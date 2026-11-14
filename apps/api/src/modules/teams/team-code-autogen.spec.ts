import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';
import { TeamDepartment } from './dto/create-team.dto';
import { KyselyService } from '../../database/kysely.service';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';
import { sql } from 'kysely';

async function runTeamCodeAutogenSuite() {
  console.log('====================================================');
  console.log('STARTING TEAM CODE AUTO-GENERATION INTEGRATION SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const teamsService = app.get(TeamsService);
  const teamsController = app.get(TeamsController);
  const kyselyService = app.get(KyselyService);
  const db = kyselyService.db;

  let passCount = 0;
  let failCount = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passCount++;
    } else {
      console.error(`❌ FAIL: ${testName} ${detail ? `(${detail})` : ''}`);
      failCount++;
    }
  }

  // Admin user context (or fallback to any existing / fixture employee on clean DB)
  const adminEmp = await db
    .selectFrom('employees')
    .select('id')
    .where('employee_code', '=', 'EMP-ADMIN-001')
    .executeTakeFirst();
  let actorEmpId = adminEmp?.id;
  if (!actorEmpId) {
    const anyEmp = await db.selectFrom('employees').select('id').orderBy('id', 'asc').executeTakeFirst();
    actorEmpId = anyEmp?.id;
  }
  if (!actorEmpId) {
    const ts = Date.now().toString().slice(-6);
    const pos = await db.selectFrom('positions').select('id').orderBy('id', 'asc').executeTakeFirstOrThrow();
    const [u] = await db.insertInto('users').values({ username: `test_actor_${ts}`, email: `actor_${ts}@test.local`, password_hash: 'x', status: 'ACTIVE' }).returningAll().execute();
    const [e] = await db.insertInto('employees').values({ employee_code: `ACTOR-${ts}`, full_name: 'Test Actor', position_id: pos.id, user_id: u.id, status: 'ACTIVE' }).returningAll().execute();
    actorEmpId = e.id;
  }
  const actorId = String(actorEmpId);

  const mockUser: JwtPayload = {
    sub: actorId,
    employeeId: actorId,
    roles: ['BOSS', 'ADMIN'],
    permissions: ['TEAM_READ', 'TEAM_CREATE', 'TEAM_UPDATE', 'TEAM_ASSIGN_MEMBER'],
  };

  const createdTeamIds: string[] = [];

  try {
    // ----------------------------------------------------------------
    // TEST 1: Preview code endpoint returns next code for each department
    // ----------------------------------------------------------------
    const salesPreview = await teamsController.getPreviewTeamCode(TeamDepartment.SALES);
    assert(
      salesPreview && salesPreview.department === 'SALES' && /^SALES_\d{2,}$/.test(salesPreview.code),
      'TEST 1: Preview team code for SALES matches format SALES_XX',
      `Got code: ${salesPreview?.code}`,
    );

    const devPreview = await teamsController.getPreviewTeamCode(TeamDepartment.DEV);
    assert(
      devPreview && devPreview.department === 'DEV' && /^DEV_\d{2,}$/.test(devPreview.code),
      'TEST 1.1: Preview team code for DEV matches format DEV_XX',
      `Got code: ${devPreview?.code}`,
    );

    const seoPreview = await teamsController.getPreviewTeamCode(TeamDepartment.SEO);
    assert(
      seoPreview && seoPreview.department === 'SEO' && /^SEO_\d{2,}$/.test(seoPreview.code),
      'TEST 1.2: Preview team code for SEO matches format SEO_XX',
      `Got code: ${seoPreview?.code}`,
    );

    const opsPreview = await teamsController.getPreviewTeamCode(TeamDepartment.OPERATION);
    assert(
      opsPreview && opsPreview.department === 'OPERATION' && /^OPERATION_\d{2,}$/.test(opsPreview.code),
      'TEST 1.3: Preview team code for OPERATION matches format OPERATION_XX',
      `Got code: ${opsPreview?.code}`,
    );

    // ----------------------------------------------------------------
    // TEST 2: Tạo team SALES -> mã tự sinh đúng
    // ----------------------------------------------------------------
    const teamSales1 = await teamsController.createTeam(
      {
        name: `Đội Kinh Doanh Tự Sinh 1 ${Date.now()}`,
        department: TeamDepartment.SALES,
        description: 'Autogen Test 1',
      },
      mockUser,
    );
    createdTeamIds.push(teamSales1.id);

    assert(
      teamSales1 && teamSales1.department === 'SALES' && teamSales1.code === salesPreview.code,
      'TEST 2: Tạo team SALES tự sinh mã trùng khớp với preview tiếp theo',
      `Expected ${salesPreview.code}, got ${teamSales1?.code}`,
    );

    const salesSeq1 = parseInt(teamSales1.code.split('_')[1], 10);

    // ----------------------------------------------------------------
    // TEST 3: Tạo team SALES tiếp -> số thứ tự tăng dần
    // ----------------------------------------------------------------
    const teamSales2 = await teamsController.createTeam(
      {
        name: `Đội Kinh Doanh Tự Sinh 2 ${Date.now()}`,
        department: TeamDepartment.SALES,
        description: 'Autogen Test 2',
      },
      mockUser,
    );
    createdTeamIds.push(teamSales2.id);

    const salesSeq2 = parseInt(teamSales2.code.split('_')[1], 10);
    assert(
      salesSeq2 === salesSeq1 + 1,
      'TEST 3: Tạo team SALES tiếp -> số thứ tự tăng đúng 1 đơn vị',
      `Seq 1: ${salesSeq1}, Seq 2: ${salesSeq2}`,
    );

    // ----------------------------------------------------------------
    // TEST 4: DEV, SEO, OPERATION sinh đúng prefix
    // ----------------------------------------------------------------
    const teamDev = await teamsController.createTeam(
      {
        name: `Đội Kỹ Thuật Tự Sinh ${Date.now()}`,
        department: TeamDepartment.DEV,
        description: 'Autogen DEV Test',
      },
      mockUser,
    );
    createdTeamIds.push(teamDev.id);
    assert(
      teamDev && teamDev.code.startsWith('DEV_') && /^DEV_\d{2,}$/.test(teamDev.code),
      'TEST 4.1: DEV sinh đúng prefix DEV_XX',
      `Got: ${teamDev?.code}`,
    );

    const teamSeo = await teamsController.createTeam(
      {
        name: `Đội SEO Tự Sinh ${Date.now()}`,
        department: TeamDepartment.SEO,
        description: 'Autogen SEO Test',
      },
      mockUser,
    );
    createdTeamIds.push(teamSeo.id);
    assert(
      teamSeo && teamSeo.code.startsWith('SEO_') && /^SEO_\d{2,}$/.test(teamSeo.code),
      'TEST 4.2: SEO sinh đúng prefix SEO_XX',
      `Got: ${teamSeo?.code}`,
    );

    const teamOps = await teamsController.createTeam(
      {
        name: `Đội Vận Hành Tự Sinh ${Date.now()}`,
        department: TeamDepartment.OPERATION,
        description: 'Autogen OPERATION Test',
      },
      mockUser,
    );
    createdTeamIds.push(teamOps.id);
    assert(
      teamOps && teamOps.code.startsWith('OPERATION_') && /^OPERATION_\d{2,}$/.test(teamOps.code),
      'TEST 4.3: OPERATION sinh đúng prefix OPERATION_XX',
      `Got: ${teamOps?.code}`,
    );

    // ----------------------------------------------------------------
    // TEST 5: User không thể tự sửa mã (Backend là source of truth)
    // ----------------------------------------------------------------
    const teamHackAttempt = await teamsController.createTeam(
      {
        name: `Team Hack Code ${Date.now()}`,
        code: 'HACKED_CUSTOM_CODE_123',
        department: TeamDepartment.SALES,
        description: 'Attempt to bypass auto-generated code',
      },
      mockUser,
    );
    createdTeamIds.push(teamHackAttempt.id);

    assert(
      teamHackAttempt && teamHackAttempt.code !== 'HACKED_CUSTOM_CODE_123' && teamHackAttempt.code.startsWith('SALES_'),
      'TEST 5: Backend bỏ qua mã do FE truyền lên và tự sinh mã chuẩn (Source of Truth)',
      `Expected SALES_XX, got: ${teamHackAttempt?.code}`,
    );

    // ----------------------------------------------------------------
    // TEST 6: Tạo đồng thời không duplicate (Advisory Lock & DB Transaction)
    // ----------------------------------------------------------------
    console.log('Đang chạy kiểm thử tạo đồng thời 6 teams SALES...');
    const concurrentPromises = Array.from({ length: 6 }).map((_, index) =>
      teamsController.createTeam(
        {
          name: `Concurrent Sales Team ${index} - ${Date.now()}`,
          department: TeamDepartment.SALES,
          description: `Concurrent test ${index}`,
        },
        mockUser,
      ),
    );

    const concurrentResults = await Promise.all(concurrentPromises);
    concurrentResults.forEach((t) => createdTeamIds.push(t.id));

    const generatedCodes = concurrentResults.map((t) => t.code);
    const uniqueCodes = new Set(generatedCodes);

    assert(
      uniqueCodes.size === concurrentResults.length,
      'TEST 6: Tạo đồng thời 6 teams SALES không bị trùng lặp mã (100% unique)',
      `Unique count: ${uniqueCodes.size}/${concurrentResults.length}. Codes: ${generatedCodes.join(', ')}`,
    );

  } catch (error: any) {
    console.error('Lỗi ngoại lệ trong quá trình chạy test suite:', error);
    failCount++;
  } finally {
    // Clean up test teams created during this suite
    if (createdTeamIds.length > 0) {
      await db
        .deleteFrom('teams')
        .where('id', 'in', createdTeamIds as any)
        .execute();
      console.log(`Đã dọn dẹp ${createdTeamIds.length} bản ghi nhóm test.`);
    }

    await app.close();

    console.log('====================================================');
    console.log(`SUITE HOÀN TẤT: ${passCount} PASSED, ${failCount} FAILED`);
    console.log('====================================================');

    if (failCount > 0) {
      process.exit(1);
    }
  }
}

runTeamCodeAutogenSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
