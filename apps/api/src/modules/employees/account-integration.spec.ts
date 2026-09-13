import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { EmployeesService } from './employees.service';
import { EmployeesController } from './employees.controller';
import { AuthService } from '../auth/auth.service';
import { KyselyService } from '../../database/kysely.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  ExecutionContext,
} from '@nestjs/common';
import * as argon2 from 'argon2';

async function runAccountIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING PHASE B ACCOUNT CREATION INTEGRATION SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const employeesService = app.get(EmployeesService);
  const employeesController = app.get(EmployeesController);
  const authService = app.get(AuthService);
  const kyselyService = app.get(KyselyService);
  const reflector = app.get(Reflector);
  const permissionsGuard = new PermissionsGuard(reflector);
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

  const runId = Date.now().toString().slice(-6);

  // Fixture teams for testing
  const [salesTeam] = await db
    .insertInto('teams')
    .values({
      code: `TEAM-SALES-TEST-${runId}`,
      name: `Test Sales Team ${runId}`,
      department: 'SALES',
    })
    .returningAll()
    .execute();

  const [devTeam] = await db
    .insertInto('teams')
    .values({
      code: `TEAM-DEV-TEST-${runId}`,
      name: `Test Dev Team ${runId}`,
      department: 'DEV',
    })
    .returningAll()
    .execute();

  const [unclassifiedTeam] = await db
    .insertInto('teams')
    .values({
      code: `TEAM-UNCLASSIFIED-TEST-${runId}`,
      name: `Test Unclassified Team ${runId}`,
      department: null as any,
    })
    .returningAll()
    .execute();

  // Get admin employee for actorEmployeeId
  const adminEmp = await db
    .selectFrom('employees')
    .select('id')
    .where('employee_code', '=', 'EMP-ADMIN-001')
    .executeTakeFirst();
  const actorId = adminEmp ? String(adminEmp.id) : '1';

  try {
    // ----------------------------------------------------------------
    // ACCOUNT-01: Admin creates standard employee (User + Employee + Position + Role + AuditLog)
    // ----------------------------------------------------------------
    const user1Dto = {
      username: `ACCT_TEST_user1_${runId}`,
      email: `acct1_${runId}@crm.local`,
      password: 'StrongPass123!@#',
      fullName: 'Nguyen Van Test 1',
      phone: '0901234561',
      hireDate: '2026-09-01',
      positionCode: 'DEV',
      roleCode: 'DEV',
      department: 'DEV',
    };

    const res1 = await employeesService.createEmployeeAccount(user1Dto, actorId);
    const audit1 = await db
      .selectFrom('audit_logs')
      .selectAll()
      .where('entity_type', '=', 'EMPLOYEE')
      .where('entity_id', '=', res1.employee.id as any)
      .executeTakeFirst();

    assert(
      !!res1.user.id &&
        !!res1.employee.id &&
        res1.employee.hireDate === '2026-09-01' &&
        res1.role.code === 'DEV' &&
        res1.employee.positionCode === 'DEV' &&
        !!audit1,
      'ACCOUNT-01: Admin creates standard employee with User + Employee + Position + Role + AuditLog',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-02: Employee created with Team Membership (regular member)
    // ----------------------------------------------------------------
    const user2Dto = {
      username: `ACCT_TEST_user2_${runId}`,
      email: `acct2_${runId}@crm.local`,
      password: 'StrongPass123!@#',
      fullName: 'Tran Thi Sale Member',
      hireDate: '2026-09-02',
      positionCode: 'SALE',
      roleCode: 'SALE',
      department: 'SALES',
      teamId: salesTeam.id,
      isLeader: false,
    };

    const res2 = await employeesService.createEmployeeAccount(user2Dto, actorId);
    assert(
      res2.teamMembership?.teamId === String(salesTeam.id) &&
        res2.teamMembership?.isLeader === false,
      'ACCOUNT-02: Employee created with Team Membership (regular member) successfully',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-03: Employee created as Team Leader (SALES_TEAM_LEADER)
    // ----------------------------------------------------------------
    const user3Dto = {
      username: `ACCT_TEST_user3_${runId}`,
      email: `acct3_${runId}@crm.local`,
      password: 'StrongPass123!@#',
      fullName: 'Le Van Leader Sales',
      hireDate: '2026-09-03',
      positionCode: 'SALES_TEAM_LEADER',
      roleCode: 'SALES_TEAM_LEADER',
      department: 'SALES',
      teamId: salesTeam.id,
      isLeader: true,
    };

    const res3 = await employeesService.createEmployeeAccount(user3Dto, actorId);
    assert(
      res3.teamMembership?.teamId === String(salesTeam.id) &&
        res3.teamMembership?.isLeader === true &&
        res3.role.code === 'SALES_TEAM_LEADER',
      'ACCOUNT-03: Employee created as Team Leader with is_leader: true successfully',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-04: Reject duplicate username with 409 ConflictException and rollback
    // ----------------------------------------------------------------
    let dupUserError: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_user1_${runId}`, // duplicate username
          email: `acct_dup_user_${runId}@crm.local`,
          password: 'Password123!',
          fullName: 'Duplicate User',
          hireDate: '2026-09-04',
          positionCode: 'DEV',
          roleCode: 'DEV',
          department: 'DEV',
        },
        actorId,
      );
    } catch (err) {
      dupUserError = err;
    }

    const uncreatedEmp4 = await db
      .selectFrom('employees')
      .selectAll()
      .where('full_name', '=', 'Duplicate User')
      .executeTakeFirst();

    assert(
      dupUserError instanceof ConflictException && !uncreatedEmp4,
      'ACCOUNT-04: Reject duplicate username with 409 ConflictException and complete rollback',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-05: Reject duplicate email with 409 ConflictException and rollback
    // ----------------------------------------------------------------
    let dupEmailError: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_dup_email_${runId}`,
          email: `acct1_${runId}@crm.local`, // duplicate email from user1
          password: 'Password123!',
          fullName: 'Duplicate Email User',
          hireDate: '2026-09-05',
          positionCode: 'DEV',
          roleCode: 'DEV',
          department: 'DEV',
        },
        actorId,
      );
    } catch (err) {
      dupEmailError = err;
    }

    const uncreatedUser5 = await db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', `ACCT_TEST_dup_email_${runId}`)
      .executeTakeFirst();

    assert(
      dupEmailError instanceof ConflictException && !uncreatedUser5,
      'ACCOUNT-05: Reject duplicate email with 409 ConflictException and complete rollback',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-06: Reject incompatible Position ↔ Role (DEV vs SALE)
    // ----------------------------------------------------------------
    let incompRoleError: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_incomp_role_${runId}`,
          email: `acct_incomp_role_${runId}@crm.local`,
          password: 'Password123!',
          fullName: 'Incompatible Role User',
          hireDate: '2026-09-06',
          positionCode: 'DEV',
          roleCode: 'SALE', // Incompatible!
          department: 'DEV',
        },
        actorId,
      );
    } catch (err) {
      incompRoleError = err;
    }

    assert(
      incompRoleError instanceof BadRequestException &&
        incompRoleError.message.includes('Incompatible Position'),
      'ACCOUNT-06: Reject incompatible Position ↔ Role with 400 BadRequestException',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-07: Reject incompatible Role ↔ Team Department (DEV in SALES team)
    // ----------------------------------------------------------------
    let incompDeptError: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_incomp_dept_${runId}`,
          email: `acct_incomp_dept_${runId}@crm.local`,
          password: 'Password123!',
          fullName: 'Incompatible Dept User',
          hireDate: '2026-09-06',
          positionCode: 'DEV',
          roleCode: 'DEV',
          department: 'DEV',
          teamId: salesTeam.id, // Sales team has department SALES!
        },
        actorId,
      );
    } catch (err) {
      incompDeptError = err;
    }

    assert(
      incompDeptError instanceof BadRequestException &&
        incompDeptError.message.includes('does not match employee department'),
      'ACCOUNT-07: Reject incompatible Role ↔ Team Department with 400 BadRequestException',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-08: Reject second active Team Leader in a team and rollback
    // ----------------------------------------------------------------
    let secondLeaderError: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_leader2_${runId}`,
          email: `acct_leader2_${runId}@crm.local`,
          password: 'Password123!',
          fullName: 'Second Leader Attempt',
          hireDate: '2026-09-06',
          positionCode: 'SALES_TEAM_LEADER',
          roleCode: 'SALES_TEAM_LEADER',
          department: 'SALES',
          teamId: salesTeam.id, // already has user3 as active leader!
          isLeader: true,
        },
        actorId,
      );
    } catch (err) {
      secondLeaderError = err;
    }

    const uncreatedLeader8 = await db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', `ACCT_TEST_leader2_${runId}`)
      .executeTakeFirst();

    assert(
      secondLeaderError instanceof BadRequestException &&
        secondLeaderError.message.includes('already has an active Team Leader') &&
        !uncreatedLeader8,
      'ACCOUNT-08: Reject second active Team Leader in team with 400 BadRequestException & rollback',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-09: Verify password is encrypted with Argon2id and must_change_password = true
    // ----------------------------------------------------------------
    const rawUser1 = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', res1.user.id as any)
      .executeTakeFirst();

    const isArgon2 = rawUser1?.password_hash.startsWith('$argon2id$');
    const verifies = rawUser1
      ? await argon2.verify(rawUser1.password_hash, 'StrongPass123!@#')
      : false;

    assert(
      isArgon2 && verifies && rawUser1?.must_change_password === true,
      'ACCOUNT-09: Password hashed with Argon2id and must_change_password = TRUE',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-10: Newly created user logs in successfully via AuthService
    // ----------------------------------------------------------------
    const loginResult = await authService.login(
      {
        identifier: user1Dto.username,
        password: user1Dto.password,
      },
      'TestAgent',
      '127.0.0.1',
    );

    assert(
      !!loginResult.accessToken &&
        loginResult.user.username === user1Dto.username &&
        loginResult.user.employeeId === res1.employee.id,
      'ACCOUNT-10: Newly created user logs in successfully with valid JWT and canonical employeeId',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-11: Permissions check: non-admin/non-boss user rejected on POST /api/employees
    // ----------------------------------------------------------------
    let saleCallAllowed = false;
    let saleCallDenied = false;

    // Simulate ExecutionContext for PermissionsGuard with SALE role (lacks EMPLOYEE_CREATE)
    const mockContextSale = {
      getHandler: () => EmployeesController.prototype.createEmployeeAccount,
      getClass: () => EmployeesController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            sub: '999',
            roles: ['SALE'],
            permissions: ['LEAD_READ', 'DEAL_READ'],
          },
        }),
      }),
    } as unknown as ExecutionContext;

    try {
      saleCallAllowed = permissionsGuard.canActivate(mockContextSale);
    } catch (err) {
      saleCallDenied = err instanceof ForbiddenException;
    }

    // Simulate ExecutionContext for PermissionsGuard with ADMIN role
    const mockContextAdmin = {
      getHandler: () => EmployeesController.prototype.createEmployeeAccount,
      getClass: () => EmployeesController,
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            sub: '1',
            employeeId: actorId,
            roles: ['ADMIN'],
            permissions: ['EMPLOYEE_CREATE', 'EMPLOYEE_READ'],
          },
        }),
      }),
    } as unknown as ExecutionContext;

    const adminCallAllowed = permissionsGuard.canActivate(mockContextAdmin);

    assert(
      !saleCallAllowed && saleCallDenied && adminCallAllowed,
      'ACCOUNT-11: Permission guard blocks unauthorized users (403 Forbidden) and permits EMPLOYEE_CREATE',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-12: New employee without hireDate is rejected (400) and completely rolled back
    // ----------------------------------------------------------------
    let missingHireDateError: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_no_hire_${runId}`,
          email: `acct_no_hire_${runId}@crm.local`,
          password: 'Password123!',
          fullName: 'No Hire Date User',
          // hireDate omitted deliberately
          hireDate: '' as any,
          positionCode: 'DEV',
          roleCode: 'DEV',
          department: 'DEV',
        },
        actorId,
      );
    } catch (err) {
      missingHireDateError = err;
    }

    const uncreatedUser12 = await db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', `ACCT_TEST_no_hire_${runId}`)
      .executeTakeFirst();

    assert(
      missingHireDateError instanceof BadRequestException &&
        missingHireDateError.message.includes('hireDate is required') &&
        !uncreatedUser12,
      'ACCOUNT-12: New employee without hireDate rejected with 400 BadRequest & zero orphan records',
    );

    // ----------------------------------------------------------------
    // ACCOUNT-13: Team without classified department cannot silently infer SALES
    // ----------------------------------------------------------------
    let unclassifiedTeamError: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_unclass_team_${runId}`,
          email: `acct_unclass_team_${runId}@crm.local`,
          password: 'Password123!',
          fullName: 'Unclassified Team Member',
          hireDate: '2026-09-06',
          positionCode: 'DEV',
          roleCode: 'DEV',
          department: 'DEV',
          teamId: unclassifiedTeam.id,
        },
        actorId,
      );
    } catch (err) {
      unclassifiedTeamError = err;
    }

    const uncreatedUser13 = await db
      .selectFrom('users')
      .selectAll()
      .where('username', '=', `ACCT_TEST_unclass_team_${runId}`)
      .executeTakeFirst();

    assert(
      unclassifiedTeamError instanceof BadRequestException &&
        unclassifiedTeamError.message.includes('TEAM DEPARTMENT CLASSIFICATION GAP') &&
        !uncreatedUser13,
      'ACCOUNT-13: Team without classified department rejects assignment with TEAM DEPARTMENT CLASSIFICATION GAP',
    );

    // ----------------------------------------------------------------
    // CANONICAL SINGLE ACTIVE BOSS ENFORCEMENT SUITE
    // ----------------------------------------------------------------

    // BOSS-01: Chặn tạo BOSS thứ 2 khi đã có BOSS active
    let secondBossCreateErr: any = null;
    try {
      await employeesService.createEmployeeAccount(
        {
          username: `ACCT_TEST_boss2_${runId}`,
          email: `boss2_${runId}@crm.local`,
          password: 'Password123!',
          fullName: 'Second Boss Attempt',
          phone: '0909999999',
          hireDate: '2026-09-12',
          positionCode: 'BOSS',
          roleCode: 'BOSS',
          department: 'OPERATION',
        },
        actorId,
      );
    } catch (err) {
      secondBossCreateErr = err;
    }

    assert(
      secondBossCreateErr instanceof BadRequestException &&
        secondBossCreateErr.message.includes('Hệ thống chỉ cho phép duy nhất 1 tài khoản Giám Đốc (BOSS)'),
      'CANONICAL-BOSS-01: Creating a second active BOSS account is strictly rejected',
    );

    // BOSS-02: Chặn update/promote employee thành BOSS khi đã có BOSS active
    let promoteToBossErr: any = null;
    try {
      await employeesService.updateEmployee(
        String(res1.employee.id),
        {
          positionCode: 'BOSS',
          roleCode: 'BOSS',
        },
        actorId,
      );
    } catch (err) {
      promoteToBossErr = err;
    }

    assert(
      promoteToBossErr instanceof BadRequestException &&
        promoteToBossErr.message.includes('Hệ thống chỉ cho phép duy nhất 1 tài khoản Giám Đốc (BOSS)'),
      'CANONICAL-BOSS-02: Updating / promoting an employee to BOSS is rejected when an active BOSS exists',
    );

    // BOSS-03: Chặn reactivate/restore employee thành BOSS khi đã có BOSS active
    const bossPos = await db.selectFrom('positions').select('id').where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const [inactiveBoss] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-INACT-BOSS-${runId}`,
        full_name: 'Former Resigned Boss',
        position_id: bossPos.id as any,
        status: 'RESIGNED',
      })
      .returningAll()
      .execute();

    let reactivateBossErr: any = null;
    try {
      await employeesService.updateEmployee(
        String(inactiveBoss.id),
        {
          status: 'ACTIVE',
        },
        actorId,
      );
    } catch (err) {
      reactivateBossErr = err;
    }

    assert(
      reactivateBossErr instanceof BadRequestException &&
        reactivateBossErr.message.includes('Hệ thống chỉ cho phép duy nhất 1 tài khoản Giám Đốc (BOSS)'),
      'CANONICAL-BOSS-03: Reactivating a resigned/terminated BOSS to ACTIVE is rejected when an active BOSS exists',
    );

    // Clean up dummy inactive boss
    await db.deleteFrom('employees').where('id', '=', inactiveBoss.id).execute();

    // BOSS-04: Concurrency test - 2 simultaneous promote attempts when a slot opens up
    const activeBossEmps = await db
      .selectFrom('employees')
      .innerJoin('positions', 'positions.id', 'employees.position_id')
      .select(['employees.id', 'employees.status'])
      .where('positions.code', '=', 'BOSS')
      .where('employees.status', 'in', ['ACTIVE', 'PROBATION'])
      .execute();

    const activeBossUsers = await db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .innerJoin('users', 'users.id', 'user_roles.user_id')
      .select(['users.id', 'users.status'])
      .where('roles.code', '=', 'BOSS')
      .where('users.status', '=', 'ACTIVE')
      .execute();

    const empCand1 = await employeesService.createEmployeeAccount(
      {
        username: `ACCT_TEST_cand1_${runId}`,
        email: `cand1_${runId}@crm.local`,
        password: 'Password123!',
        fullName: 'Candidate 1',
        hireDate: '2026-09-12',
        positionCode: 'DEV',
        roleCode: 'DEV',
        department: 'DEV',
      },
      actorId,
    );

    const empCand2 = await employeesService.createEmployeeAccount(
      {
        username: `ACCT_TEST_cand2_${runId}`,
        email: `cand2_${runId}@crm.local`,
        password: 'Password123!',
        fullName: 'Candidate 2',
        hireDate: '2026-09-12',
        positionCode: 'DEV',
        roleCode: 'DEV',
        department: 'DEV',
      },
      actorId,
    );

    // Temporarily pause active boss statuses
    for (const b of activeBossEmps) {
      await db.updateTable('employees').set({ status: 'RESIGNED' }).where('id', '=', b.id).execute();
    }
    for (const u of activeBossUsers) {
      await db.updateTable('users').set({ status: 'DISABLED' }).where('id', '=', u.id).execute();
    }

    try {
      const results = await Promise.allSettled([
        employeesService.updateEmployee(
          String(empCand1.employee.id),
          { positionCode: 'BOSS', roleCode: 'BOSS' },
          actorId,
        ),
        employeesService.updateEmployee(
          String(empCand2.employee.id),
          { positionCode: 'BOSS', roleCode: 'BOSS' },
          actorId,
        ),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter((r) => r.status === 'rejected');

      assert(
        fulfilled.length === 1 && rejected.length === 1,
        'CANONICAL-BOSS-CONCURRENCY: 2 simultaneous BOSS promotions result in exactly 1 success and 1 rejection',
      );
    } finally {
      // Always restore active boss statuses
      for (const b of activeBossEmps) {
        await db.updateTable('employees').set({ status: b.status as any }).where('id', '=', b.id).execute();
      }
      for (const u of activeBossUsers) {
        await db.updateTable('users').set({ status: u.status as any }).where('id', '=', u.id).execute();
      }
    }
  } finally {
    // ----------------------------------------------------------------
    // TEARDOWN: Clean up test fixtures created during test run
    // ----------------------------------------------------------------
    const testUsers = await db
      .selectFrom('users')
      .select('id')
      .where('username', 'like', 'ACCT_TEST_%')
      .execute();

    const uids = testUsers.map((u) => u.id);

    if (uids.length > 0) {
      const testEmps = await db
        .selectFrom('employees')
        .select('id')
        .where('user_id', 'in', uids)
        .execute();
      const eids = testEmps.map((e) => e.id);

      if (eids.length > 0) {
        await db.deleteFrom('audit_logs').where('actor_employee_id', 'in', eids).execute();
        await db.deleteFrom('audit_logs').where('entity_type', '=', 'EMPLOYEE').where('entity_id', 'in', eids.map(String)).execute();
        await db.deleteFrom('team_memberships').where('employee_id', 'in', eids).execute();
        await db.deleteFrom('employees').where('id', 'in', eids).execute();
      }

      await db.deleteFrom('user_roles').where('user_id', 'in', uids).execute();
      await db.deleteFrom('users').where('id', 'in', uids).execute();
    }

    await db.deleteFrom('teams').where('id', 'in', [salesTeam.id, devTeam.id, unclassifiedTeam.id]).execute();

    await app.close();
  }

  console.log('==================================================');
  console.log(`ACCOUNT CREATION TEST RESULT: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runAccountIntegrationTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
