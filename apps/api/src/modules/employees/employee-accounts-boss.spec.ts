import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { EmployeeAccountsService } from '../employee-accounts/employee-accounts.service';
import { EmployeeAccountsController } from '../employee-accounts/employee-accounts.controller';
import { AuthService } from '../auth/auth.service';
import { KyselyService } from '../../database/kysely.service';
import { RedisService } from '../../redis/redis.service';
import { BossOnlyGuard } from '../rbac/guards/boss-only.guard';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { sql } from 'kysely';

async function runBossAccountManagementTests() {
  console.log('====================================================');
  console.log('STARTING BOSS EMPLOYEE ACCOUNTS MANAGEMENT INTEGRATION TESTS');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const accountsService = app.get(EmployeeAccountsService);
  const authService = app.get(AuthService);
  const kyselyService = app.get(KyselyService);
  const redisService = app.get(RedisService);
  const db = kyselyService.db;
  const guard = new BossOnlyGuard();

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
  let testTeam: any = null;
  let testUser: any = null;
  let testEmployee: any = null;
  let bossUser: any = null;
  let bossEmployee: any = null;
  let freshBossUser: any = null;
  let pendingReq: any = null;

  try {
    // -------------------------------------------------------------
    // 1. RBAC Check: Non-BOSS roles must get 403 Forbidden
    // -------------------------------------------------------------
    const nonBossRoles = [
      ['ADMIN'],
      ['SALE'],
      ['DEV'],
      ['SEO'],
      ['SALES_TEAM_LEADER'],
      ['DEV_TEAM_LEADER'],
      ['ACCOUNTANT'],
    ];

    let allNonBossRejected = true;
    for (const roles of nonBossRoles) {
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { sub: '999', roles },
          }),
        }),
      };
      try {
        guard.canActivate(mockContext);
        allNonBossRejected = false;
      } catch (err: any) {
        if (!(err instanceof ForbiddenException)) {
          allNonBossRejected = false;
        }
      }
    }
    assert(
      allNonBossRejected,
      'BOSS-01: Non-BOSS roles (ADMIN, SALE, DEV, SEO, LEADER, ACCOUNTANT) strictly receive 403 Forbidden',
    );

    // BOSS role must pass guard
    const bossContext: any = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { sub: '1', roles: ['BOSS'] },
        }),
      }),
    };
    assert(guard.canActivate(bossContext) === true, 'BOSS-02: BOSS role successfully passes BossOnlyGuard');

    // -------------------------------------------------------------
    // Setup test fixtures (Test Team, Position, User, Employee)
    // -------------------------------------------------------------
    [testTeam] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-BOSS-TEST-${runId}`,
        name: `Test Team Boss ${runId}`,
        department: 'SALES',
      })
      .returningAll()
      .execute();

    let posSale = await db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', 'SALE')
      .executeTakeFirst();
    if (!posSale) {
      const [newPos] = await db
        .insertInto('positions')
        .values({ code: 'SALE', name: 'Nhân viên kinh doanh' })
        .returningAll()
        .execute();
      posSale = newPos;
    }

    const testPasswordHash = await argon2.hash('OldPassword@123', {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    [testUser] = await db
      .insertInto('users')
      .values({
        username: `test_emp_${runId}`,
        email: `test_emp_${runId}@crm.local`,
        password_hash: testPasswordHash,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    [testEmployee] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-TEST-${runId}`,
        full_name: `Nguyễn Văn Test ${runId}`,
        phone: '0901234567',
        position_id: posSale.id,
        user_id: testUser.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    await db
      .insertInto('team_memberships')
      .values({
        team_id: testTeam.id,
        employee_id: testEmployee.id,
        is_leader: false,
        effective_range: sql`tstzrange(NOW(), NULL, '[)')`,
      })
      .execute();

    // Create a mock BOSS user and employee
    let bossPos = await db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', 'BOSS')
      .executeTakeFirst();
    if (!bossPos) {
      const [newBossPos] = await db
        .insertInto('positions')
        .values({ code: 'BOSS', name: 'Giám Đốc' })
        .returningAll()
        .execute();
      bossPos = newBossPos;
    }

    [bossUser] = await db
      .insertInto('users')
      .values({
        username: `boss_user_${runId}`,
        email: `boss_${runId}@crm.local`,
        password_hash: testPasswordHash,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    [bossEmployee] = await db
      .insertInto('employees')
      .values({
        employee_code: `BOSS-TEST-${runId}`,
        full_name: `Tổng Giám Đốc ${runId}`,
        position_id: bossPos.id,
        user_id: bossUser.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const bossRole = await db
      .selectFrom('roles')
      .selectAll()
      .where('code', '=', 'BOSS')
      .executeTakeFirst();
    if (bossRole) {
      await db
        .insertInto('user_roles')
        .values({ user_id: bossUser.id, role_id: bossRole.id })
        .onConflict((oc) => oc.doNothing())
        .execute();
    }

    const testSessionId = `session-boss-test-${runId}`;

    // -------------------------------------------------------------
    // 2. Query Employee Accounts (List, Search, Filters, Pagination)
    // -------------------------------------------------------------
    const listResult = await accountsService.getAccounts(
      { page: 1, limit: 10 },
      String(bossUser.id),
      testSessionId,
    );
    assert(
      Array.isArray(listResult.data) && listResult.total > 0,
      'BOSS-03: BOSS can fetch all employee accounts with pagination',
    );

    // Search by full name / code
    const searchResult = await accountsService.getAccounts(
      { q: `Nguyễn Văn Test ${runId}` },
      String(bossUser.id),
      testSessionId,
    );
    assert(
      searchResult.data.length === 1 && String(searchResult.data[0].employee_id) === String(testEmployee.id),
      'BOSS-04: BOSS can search employee accounts by full name or employee code',
    );

    // -------------------------------------------------------------
    // 3. PIN 6-Digit Verification & Step-Up Auth
    // -------------------------------------------------------------
    // Before PIN entry: session must be locked
    let isUnlocked = await accountsService.isSessionUnlocked(String(bossUser.id), testSessionId);
    assert(!isUnlocked, 'BOSS-05: Session starts in LOCKED state (no PIN entered yet)');

    // Backend PIN Enforcement: Calling updateAccount without PIN must throw 403 PIN_REQUIRED
    let pinBlocked = false;
    try {
      await accountsService.updateAccount(
        testEmployee.id,
        { username: `updated_${runId}` },
        bossEmployee.id,
        String(bossUser.id),
        testSessionId,
      );
    } catch (err: any) {
      if (err instanceof ForbiddenException && err.getResponse()?.['code'] === 'PIN_REQUIRED') {
        pinBlocked = true;
      }
    }
    assert(pinBlocked, 'BOSS-06: Backend enforces PIN requirement, blocking mutations with 403 PIN_REQUIRED');

    // Wrong PIN rejection
    let wrongPinRejected = false;
    try {
      await accountsService.verifyPin(String(bossUser.id), testSessionId, '999999');
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('Mã PIN không chính xác')) {
        wrongPinRejected = true;
      }
    }
    assert(wrongPinRejected, 'BOSS-07: Invalid 6-digit PIN is rejected with remaining attempts counter');

    // Correct PIN verification (Default 123456)
    const verifyResult = await accountsService.verifyPin(String(bossUser.id), testSessionId, '123456');
    assert(
      verifyResult.success === true && verifyResult.unlocked === true,
      'BOSS-08: Correct PIN (123456) successfully unlocks Account Management for the session',
    );

    isUnlocked = await accountsService.isSessionUnlocked(String(bossUser.id), testSessionId);
    assert(isUnlocked === true, 'BOSS-09: Session unlock state is verified in Redis server-side');

    // -------------------------------------------------------------
    // 4. Update Employee Account & Reset Password
    // -------------------------------------------------------------
    const newPassword = 'NewSecretPassword@2026';
    const updateResult = await accountsService.updateAccount(
      testEmployee.id,
      {
        username: `renamed_emp_${runId}`,
        accountStatus: 'ACTIVE',
        newPassword,
      },
      bossEmployee.id,
      String(bossUser.id),
      testSessionId,
    );
    assert(updateResult.success === true, 'BOSS-10: Account update and password reset succeed when unlocked');

    // Verify DB state: password updated with Argon2id, must_change_password set to true
    const updatedUser = await db
      .selectFrom('users')
      .selectAll()
      .where('id', '=', testUser.id as any)
      .executeTakeFirst();

    assert(
      updatedUser?.username === `renamed_emp_${runId}` &&
        updatedUser?.must_change_password === true &&
        (await argon2.verify(updatedUser.password_hash, newPassword)) === true,
      'BOSS-11: Password is saved as Argon2id hash (never plaintext) and must_change_password is true',
    );

    // Verify Audit Log
    const auditRecord = await db
      .selectFrom('audit_logs')
      .selectAll()
      .where('entity_id', '=', testEmployee.id as any)
      .where('action', '=', 'PASSWORD_RESET')
      .orderBy('created_at', 'desc')
      .executeTakeFirst();

    assert(
      auditRecord !== undefined &&
        String(auditRecord.actor_employee_id) === String(bossEmployee.id) &&
        !JSON.stringify(auditRecord.payload_after_sanitized).includes(newPassword),
      'BOSS-12: Password reset is recorded in audit_logs with NO plaintext password or secrets',
    );

    // -------------------------------------------------------------
    // 5. Forgot Password Flow & Reset Request Resolution
    // -------------------------------------------------------------
    // Employee requests forgot password
    const forgotResult = await authService.forgotPassword(
      { identifier: `renamed_emp_${runId}` },
      '127.0.0.1',
    );
    assert(
      forgotResult.success === true,
      'BOSS-13: Employee creates Password Reset Request via forgot-password endpoint',
    );

    // Check request record created with PENDING
    pendingReq = await db
      .selectFrom('password_reset_requests')
      .selectAll()
      .where('employee_id', '=', testEmployee.id as any)
      .where('status', '=', 'PENDING')
      .executeTakeFirst();

    assert(
      pendingReq !== undefined && pendingReq.status === 'PENDING',
      'BOSS-14: Password reset request is stored with status PENDING',
    );

    // Check notification dispatched to BOSS
    const notif = await db
      .selectFrom('notifications')
      .selectAll()
      .where('event_type', '=', 'PASSWORD_RESET_REQUESTED')
      .where('entity_id', '=', pendingReq?.id as any)
      .executeTakeFirst();

    assert(
      notif !== undefined &&
        notif.deep_link_url === `/employee-accounts/${testEmployee.id}?resetRequest=${pendingReq?.id}`,
      'BOSS-15: In-app notification with deep link dispatched to BOSS',
    );

    // Now BOSS resets password -> should resolve pending request
    await accountsService.updateAccount(
      testEmployee.id,
      {
        newPassword: 'AnotherPassword@2026',
        resetRequestId: pendingReq?.id,
      },
      bossEmployee.id,
      String(bossUser.id),
      testSessionId,
    );

    const resolvedReq = await db
      .selectFrom('password_reset_requests')
      .selectAll()
      .where('id', '=', pendingReq?.id as any)
      .executeTakeFirst();

    assert(
      resolvedReq?.status === 'RESOLVED' &&
        resolvedReq.resolved_at !== null &&
        String(resolvedReq.resolved_by_employee_id) === String(bossEmployee.id),
      'BOSS-16: Pending password reset request automatically transitions to RESOLVED with audit actor',
    );

    // -------------------------------------------------------------
    // 6. Logout locks the PIN session again
    // -------------------------------------------------------------
    await authService.logout(String(bossUser.id), testSessionId);
    const lockedAfterLogout = await accountsService.isSessionUnlocked(String(bossUser.id), testSessionId);
    assert(
      lockedAfterLogout === false,
      'BOSS-17: Logging out immediately revokes the PIN unlocked state in Redis',
    );

    // -------------------------------------------------------------
    // 7. First-time PIN setup vs Change PIN tests
    // -------------------------------------------------------------
    // Create new BOSS user without PIN in boss_security_config
    freshBossUser = await db
      .insertInto('users')
      .values({
        username: `fresh_boss_${runId}`,
        email: `fresh_boss_${runId}@test.com`,
        password_hash: await argon2.hash('TestPass@2026'),
      })
      .returning(['id', 'username'])
      .executeTakeFirstOrThrow();

    // Verify isConfigured is false initially
    const freshPinStatus = await accountsService.getPinStatus(String(freshBossUser.id));
    assert(freshPinStatus.isConfigured === false, 'BOSS-18: Fresh BOSS account has isConfigured = false');

    // 1. First-time setup WITHOUT currentPin -> must PASS
    const firstSetupRes = await accountsService.changePin(String(freshBossUser.id), undefined, '654321');
    assert(firstSetupRes.success === true, 'BOSS-19: First-time setup without currentPin succeeds');

    const configuredStatus = await accountsService.getPinStatus(String(freshBossUser.id));
    assert(configuredStatus.isConfigured === true, 'BOSS-20: After first setup, isConfigured becomes true');

    // 2. Second setup WITHOUT currentPin -> must REJECT
    let secondSetupRejected = false;
    try {
      await accountsService.changePin(String(freshBossUser.id), undefined, '111222');
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('Vui lòng nhập mã PIN hiện tại')) {
        secondSetupRejected = true;
      }
    }
    assert(secondSetupRejected, 'BOSS-21: Setup/change without currentPin when already configured is rejected');

    // 3. Change PIN with WRONG currentPin -> must REJECT
    let wrongCurrentPinRejected = false;
    try {
      await accountsService.changePin(String(freshBossUser.id), '000000', '111222');
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('Mã PIN hiện tại không chính xác')) {
        wrongCurrentPinRejected = true;
      }
    }
    assert(wrongCurrentPinRejected, 'BOSS-22: Change PIN with wrong currentPin is rejected');

    // 4. Change PIN with CORRECT currentPin -> must PASS
    const changePinRes = await accountsService.changePin(String(freshBossUser.id), '654321', '111222');
    assert(changePinRes.success === true, 'BOSS-23: Change PIN with correct currentPin succeeds');

    // 5. Verify PIN in database is Argon2id hash, never plaintext
    const dbConfig = await db
      .selectFrom('boss_security_config')
      .selectAll()
      .where('boss_user_id', '=', freshBossUser.id as any)
      .executeTakeFirst();
    assert(
      dbConfig?.pin_hash.startsWith('$argon2') && !dbConfig.pin_hash.includes('111222'),
      'BOSS-24: PIN is stored as Argon2id hash, never plaintext',
    );

  } catch (error: any) {
    console.error('Fatal test exception:', error);
    failCount++;
  } finally {
    try {
      if (freshBossUser?.id) {
        await db.deleteFrom('boss_security_config').where('boss_user_id', '=', freshBossUser.id as any).execute();
        await db.deleteFrom('users').where('id', '=', freshBossUser.id as any).execute();
      }
      if (pendingReq?.id) {
        await db.deleteFrom('notifications').where('entity_id', '=', pendingReq.id as any).execute();
      }
      if (testEmployee?.id) {
        await db.deleteFrom('password_reset_requests').where('employee_id', '=', testEmployee.id as any).execute();
        await db.deleteFrom('audit_logs').where('entity_id', '=', testEmployee.id as any).execute();
        await db.deleteFrom('team_memberships').where('employee_id', '=', testEmployee.id as any).execute();
      }
      const empIds = [testEmployee?.id, bossEmployee?.id].filter(Boolean);
      if (empIds.length > 0) {
        await db.deleteFrom('employees').where('id', 'in', empIds as any).execute();
      }
      if (bossUser?.id) {
        await db.deleteFrom('boss_security_config').where('boss_user_id', '=', bossUser.id as any).execute();
      }
      const userIds = [testUser?.id, bossUser?.id].filter(Boolean);
      if (userIds.length > 0) {
        await db.deleteFrom('user_roles').where('user_id', 'in', userIds as any).execute();
        await db.deleteFrom('users').where('id', 'in', userIds as any).execute();
      }
      if (testTeam?.id) {
        await db.deleteFrom('teams').where('id', '=', testTeam.id as any).execute();
      }
    } catch (cleanErr) {
      console.warn('Cleanup warning in employee-accounts-boss:', cleanErr);
    }
    await app.close();
  }

  console.log('====================================================');
  console.log(`TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('====================================================');

  if (failCount > 0) {
    process.exit(1);
  }
}

runBossAccountManagementTests();
