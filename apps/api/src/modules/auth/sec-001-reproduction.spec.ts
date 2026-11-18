import { NestFactory } from '@nestjs/core';
import { UnauthorizedException, InternalServerErrorException } from '@nestjs/common';
import * as assert from 'assert';
import { AppModule } from '../../app.module';
import { AuthService } from './auth.service';
import { SessionService } from './services/session.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { EmployeeAccountsService } from '../employee-accounts/employee-accounts.service';
import { EmployeesService } from '../employees/employees.service';
import { OrganizationChartService } from '../organization-chart/organization-chart.service';
import { KyselyService } from '../../database/kysely.service';
import { RedisService } from '../../redis/redis.service';
import { sql } from 'kysely';
import * as argon2 from 'argon2';

function createMockExecutionContext(token: string) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: { authorization: `Bearer ${token}` },
      }),
    }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as any;
}

async function runSec001Suite() {
  console.log('====================================================');
  console.log('STARTING SEC-001 SESSION REVOCATION VERIFICATION SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);

  const authService = app.get(AuthService);
  const sessionService = app.get(SessionService);
  const jwtAuthGuard = app.get(JwtAuthGuard);
  const employeeAccountsService = app.get(EmployeeAccountsService);
  const employeesService = app.get(EmployeesService);
  const orgChartService = app.get(OrganizationChartService);
  const kysely = app.get(KyselyService);
  const redisService = app.get(RedisService);
  const db = kysely.db;

  const runId = Date.now().toString().slice(-6);

  try {
    // ----------------------------------------------------
    // PREPARE FIXTURES: Teams, Positions, Boss, Employees
    // ----------------------------------------------------
    console.log('\n--- 0. Preparing dynamic test fixtures ---');
    const bossRole = await db.selectFrom('roles').selectAll().where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const saleRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const devRole = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();

    const bossPos = await db.selectFrom('positions').selectAll().where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const devPos = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();

    // Create teams
    const [teamSale] = await db
      .insertInto('teams')
      .values({
        code: `TST-S-${runId}`,
        name: `Sales Team ${runId}`,
        department: 'SALES' as any,
      })
      .returningAll()
      .execute();

    const [teamDev] = await db
      .insertInto('teams')
      .values({
        code: `TST-D-${runId}`,
        name: `Dev Team ${runId}`,
        department: 'DEV' as any,
      })
      .returningAll()
      .execute();

    // Create Boss User + Employee
    const pwdHash = await argon2.hash('SecretPass123!@#', { type: argon2.argon2id });
    const [bossUser] = await db
      .insertInto('users')
      .values({
        username: `boss_sec_${runId}`,
        email: `boss_sec_${runId}@crm.local`,
        password_hash: pwdHash,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    await db.insertInto('user_roles').values({ user_id: bossUser.id as any, role_id: bossRole.id as any }).execute();

    const [bossEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-B-${runId}`,
        full_name: `Boss User ${runId}`,
        user_id: bossUser.id as any,
        position_id: bossPos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Unlock Boss PIN in Redis for accounts service
    await redisService.client.set(`boss_pin_unlocked:${bossUser.id}`, '1');

    // Helper to create active user + employee
    const createTestSubject = async (suffix: string, initialPos: any, initialRole: any, team: any) => {
      const [u] = await db
        .insertInto('users')
        .values({
          username: `u_${suffix}_${runId}`,
          email: `u_${suffix}_${runId}@crm.local`,
          password_hash: pwdHash,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();

      await db.insertInto('user_roles').values({ user_id: u.id as any, role_id: initialRole.id as any }).execute();

      const [e] = await db
        .insertInto('employees')
        .values({
          employee_code: `EMP-${suffix}-${runId}`,
          full_name: `Employee ${suffix} ${runId}`,
          user_id: u.id as any,
          position_id: initialPos.id,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();

      await db
        .insertInto('team_memberships')
        .values({
          team_id: team.id,
          employee_id: e.id as any,
          is_leader: false,
          effective_range: sql`tstzrange(NOW() - interval '2 days', NULL, '[)')` as any,
        })
        .execute();

      return { user: u, employee: e };
    };

    console.log('✅ Pre-requisite test fixtures successfully set up');

    // =========================================================================
    // SCENARIO 1: CONTROL — Cross-Department Transfer
    // =========================================================================
    console.log('\n--- 1. SEC-001: Cross-Department Transfer (Control) ---');
    const sub1 = await createTestSubject('TRF', devPos, devRole, teamDev);
    const login1 = await authService.login({ identifier: sub1.user.username, password: 'SecretPass123!@#' });
    const token1 = login1.accessToken;

    const ctx1 = createMockExecutionContext(token1);
    const pass1Before = await jwtAuthGuard.canActivate(ctx1);
    assert.strictEqual(pass1Before, true, 'Token 1 must pass guard before transfer');

    // Perform cross-dept transfer DEV -> SALE
    await orgChartService.moveMember(
      {
        employeeId: String(sub1.employee.id),
        targetTeamId: String(teamSale.id),
        reason: 'Cross department transfer test',
      },
      String(bossEmp.id),
    );

    let rejected1 = false;
    try {
      await jwtAuthGuard.canActivate(ctx1);
    } catch (err: any) {
      if (err instanceof UnauthorizedException && err.message.includes('Session expired or revoked')) {
        rejected1 = true;
      }
    }
    assert.strictEqual(rejected1, true, 'TEST 1: Old token must be rejected with 401 Unauthorized after Cross-Dept Transfer');
    console.log('✅ PASS: Cross-Department Transfer immediately revokes Redis session (HTTP 401)');

    // =========================================================================
    // SCENARIO 2: User Change Password
    // =========================================================================
    console.log('\n--- 2. SEC-001: User Change Password ---');
    const sub2 = await createTestSubject('PWD', salePos, saleRole, teamSale);
    const login2 = await authService.login({ identifier: sub2.user.username, password: 'SecretPass123!@#' });
    const token2 = login2.accessToken;

    const ctx2 = createMockExecutionContext(token2);
    const pass2Before = await jwtAuthGuard.canActivate(ctx2);
    assert.strictEqual(pass2Before, true, 'Token 2 must pass guard before password change');

    // User changes own password
    await authService.changePassword(String(sub2.user.id), 'SecretPass123!@#', 'NewSuperSecret456!@#');

    let rejected2 = false;
    try {
      await jwtAuthGuard.canActivate(ctx2);
    } catch (err: any) {
      if (err instanceof UnauthorizedException && err.message.includes('Session expired or revoked')) {
        rejected2 = true;
      }
    }
    assert.strictEqual(rejected2, true, 'TEST 2: Old token must be rejected with 401 Unauthorized after User Change Password');
    console.log('✅ PASS: User Change Password immediately revokes Redis session (HTTP 401)');

    // =========================================================================
    // SCENARIO 3: Admin / Boss Disable Account
    // =========================================================================
    console.log('\n--- 3. SEC-001: Admin / Boss Disable Account ---');
    const sub3 = await createTestSubject('DIS', salePos, saleRole, teamSale);
    const login3 = await authService.login({ identifier: sub3.user.username, password: 'SecretPass123!@#' });
    const token3 = login3.accessToken;

    const ctx3 = createMockExecutionContext(token3);
    const pass3Before = await jwtAuthGuard.canActivate(ctx3);
    assert.strictEqual(pass3Before, true, 'Token 3 must pass guard before disable');

    // Boss disables account via EmployeeAccountsService
    await employeeAccountsService.updateAccount(
      sub3.employee.id,
      { accountStatus: 'DISABLED' },
      bossEmp.id,
      String(bossUser.id),
      undefined,
      '127.0.0.1',
    );

    let rejected3 = false;
    try {
      await jwtAuthGuard.canActivate(ctx3);
    } catch (err: any) {
      if (err instanceof UnauthorizedException && err.message.includes('Session expired or revoked')) {
        rejected3 = true;
      }
    }
    assert.strictEqual(rejected3, true, 'TEST 3: Old token must be rejected with 401 Unauthorized after Account Disabled');
    console.log('✅ PASS: Account Disable immediately revokes Redis session (HTTP 401)');

    // =========================================================================
    // SCENARIO 4: Admin / Boss Reset Password
    // =========================================================================
    console.log('\n--- 4. SEC-001: Admin / Boss Reset Password ---');
    const sub4 = await createTestSubject('RST', salePos, saleRole, teamSale);
    const login4 = await authService.login({ identifier: sub4.user.username, password: 'SecretPass123!@#' });
    const token4 = login4.accessToken;

    const ctx4 = createMockExecutionContext(token4);
    const pass4Before = await jwtAuthGuard.canActivate(ctx4);
    assert.strictEqual(pass4Before, true, 'Token 4 must pass guard before admin reset password');

    // Boss resets password for employee
    await employeeAccountsService.updateAccount(
      sub4.employee.id,
      { newPassword: 'BrandNewBossPass789!@#' },
      bossEmp.id,
      String(bossUser.id),
      undefined,
      '127.0.0.1',
    );

    let rejected4 = false;
    try {
      await jwtAuthGuard.canActivate(ctx4);
    } catch (err: any) {
      if (err instanceof UnauthorizedException && err.message.includes('Session expired or revoked')) {
        rejected4 = true;
      }
    }
    assert.strictEqual(rejected4, true, 'TEST 4: Old token must be rejected with 401 Unauthorized after Admin Reset Password');
    console.log('✅ PASS: Admin Reset Password immediately revokes Redis session (HTTP 401)');

    // =========================================================================
    // SCENARIO 5: Promote / Demote (Position & Role Change)
    // =========================================================================
    console.log('\n--- 5. SEC-001: Promote / Demote Employee ---');
    const sub5 = await createTestSubject('PRO', devPos, devRole, teamDev);
    const login5 = await authService.login({ identifier: sub5.user.username, password: 'SecretPass123!@#' });
    const token5 = login5.accessToken;

    const ctx5 = createMockExecutionContext(token5);
    const pass5Before = await jwtAuthGuard.canActivate(ctx5);
    assert.strictEqual(pass5Before, true, 'Token 5 must pass guard before change position');

    // Change position DEV -> SALE
    await employeesService.changePosition(
      sub5.employee.id,
      {
        positionCode: 'SALE',
        actionType: 'TRANSFER',
        reason: 'Internal re-skilling',
      },
      bossEmp.id,
    );

    let rejected5 = false;
    try {
      await jwtAuthGuard.canActivate(ctx5);
    } catch (err: any) {
      if (err instanceof UnauthorizedException && err.message.includes('Session expired or revoked')) {
        rejected5 = true;
      }
    }
    assert.strictEqual(rejected5, true, 'TEST 5: Old token must be rejected with 401 Unauthorized after Promote/Demote');
    console.log('✅ PASS: Promote / Demote immediately revokes Redis session (HTTP 401)');

    // =========================================================================
    // SCENARIO 6: Redis Revocation Failure Fail-Safe
    // =========================================================================
    console.log('\n--- 6. SEC-001: Redis Revocation Failure Safety Check ---');
    const sub6 = await createTestSubject('FAILSAFE', salePos, saleRole, teamSale);

    // Mock Redis failure on revokeAllUserSessions
    const originalRevoke = sessionService.revokeAllUserSessions.bind(sessionService);
    (sessionService as any).revokeAllUserSessions = async () => {
      throw new Error('REDIS_CONNECTION_REFUSED_SIMULATION');
    };

    let redisErrorCaught = false;
    try {
      await authService.changePassword(String(sub6.user.id), 'SecretPass123!@#', 'NewPassFailSafe!@#');
    } catch (err: any) {
      if (err instanceof InternalServerErrorException && err.message.includes('REDIS_CONNECTION_REFUSED_SIMULATION')) {
        redisErrorCaught = true;
      }
    } finally {
      (sessionService as any).revokeAllUserSessions = originalRevoke;
    }

    assert.strictEqual(
      redisErrorCaught,
      true,
      'TEST 6: Redis failure during session revocation must throw InternalServerErrorException, NEVER return success 200',
    );
    console.log('✅ PASS: Redis revocation failure correctly rejects operation with 500, preventing dangerous unrevoked session');

    console.log('\n====================================================');
    console.log('SEC-001 ALL 6 SCENARIOS VERIFIED SUCCESSFULLY (PASS)');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

runSec001Suite().catch((err) => {
  console.error('❌ SEC-001 SUITE FAILED:', err);
  process.exit(1);
});
