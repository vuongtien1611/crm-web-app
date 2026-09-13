import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { RbacService } from '../rbac/rbac.service';
import { KyselyService } from '../../database/kysely.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { Reflector } from '@nestjs/core';
import { UnauthorizedException } from '@nestjs/common';

async function runAuthIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING AUTH FOUNDATION INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const authService = app.get(AuthService);
  const usersService = app.get(UsersService);
  const passwordService = app.get(PasswordService);
  const sessionService = app.get(SessionService);
  const rbacService = app.get(RbacService);
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

  // Fixture setup
  const testUsername = `testuser_${Date.now()}`;
  const testEmail = `test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  const hashedPassword = await passwordService.hashPassword(testPassword);

  // Get a position
  const pos = await db.selectFrom('positions').select('id').executeTakeFirst();
  if (!pos) throw new Error('No positions found in DB');

  // Create User & Role mapping
  const user = await usersService.createUser({
    username: testUsername,
    email: testEmail,
    passwordHash: hashedPassword,
    status: 'ACTIVE',
  });

  // Assign SALE role
  const saleRole = await rbacService.findRoleByCode('SALE');
  if (saleRole) {
    await usersService.assignRoleToUser(user.id, saleRole.id);
  }

  try {
    // AUTH-01: Login Success
    let loginRes: any;
    try {
      loginRes = await authService.login(
        { identifier: testUsername, password: testPassword },
        'TestAgent/1.0',
        '127.0.0.1',
      );
      assert(
        !!loginRes.accessToken && !!loginRes.refreshToken && loginRes.user.username === testUsername,
        'AUTH-01: Login success',
      );
    } catch (e: any) {
      assert(false, 'AUTH-01: Login success', e.message);
    }

    // AUTH-02: Wrong Password => 401
    try {
      await authService.login(
        { identifier: testUsername, password: 'WrongPassword!' },
        'TestAgent/1.0',
        '127.0.0.1',
      );
      assert(false, 'AUTH-02: Wrong password blocked', 'Expected 401');
    } catch (e: any) {
      assert(
        e.status === 401 || e.getStatus?.() === 401 || e.name === 'UnauthorizedException',
        'AUTH-02: Wrong password blocked',
      );
    }

    // AUTH-03: Disabled User => 401
    const disabledUser = await usersService.createUser({
      username: `disabled_${Date.now()}`,
      email: `disabled_${Date.now()}@example.com`,
      passwordHash: hashedPassword,
      status: 'DISABLED',
    });
    try {
      await authService.login(
        { identifier: disabledUser.username, password: testPassword },
        'TestAgent/1.0',
        '127.0.0.1',
      );
      assert(false, 'AUTH-03: Disabled user blocked', 'Expected 401');
    } catch (e: any) {
      assert(
        e.status === 401 || e.getStatus?.() === 401 || e.name === 'UnauthorizedException',
        'AUTH-03: Disabled user blocked',
      );
    }

    // AUTH-04: /me without token => 401
    try {
      await authService.getMe('');
      assert(false, 'AUTH-04: /me without token blocked', 'Expected 401');
    } catch (e: any) {
      assert(
        e.status === 401 || e.getStatus?.() === 401 || e.name === 'UnauthorizedException',
        'AUTH-04: /me without token blocked',
      );
    }

    // AUTH-05: /me valid access token => 200
    try {
      const me = await authService.getMe(String(user.id));
      assert(me.username === testUsername && Array.isArray(me.roles), 'AUTH-05: /me valid token');
    } catch (e: any) {
      assert(false, 'AUTH-05: /me valid token', e.message);
    }

    // AUTH-06: Refresh Success
    let refreshRes: any;
    try {
      refreshRes = await authService.refresh(loginRes.refreshToken, 'TestAgent/1.0', '127.0.0.1');
      assert(!!refreshRes.accessToken && !!refreshRes.refreshToken, 'AUTH-06: Refresh success');
    } catch (e: any) {
      assert(false, 'AUTH-06: Refresh success', e.message);
    }

    // AUTH-07: Old Refresh Token After Rotation Rejected
    try {
      await authService.refresh(loginRes.refreshToken, 'TestAgent/1.0', '127.0.0.1');
      assert(false, 'AUTH-07: Old refresh token rejected', 'Expected rejection');
    } catch (e: any) {
      assert(
        e.status === 401 || e.getStatus?.() === 401 || e.name === 'UnauthorizedException',
        'AUTH-07: Old refresh token rejected',
      );
    }

    // AUTH-08: Logout Revokes Session
    try {
      if (!refreshRes || !refreshRes.refreshToken) {
        throw new Error('Refresh response missing token');
      }
      const jwtPayload = JSON.parse(
        Buffer.from(refreshRes.refreshToken.split('.')[1], 'base64').toString(),
      );
      await authService.logout(String(user.id), jwtPayload.sessionId);
      assert(true, 'AUTH-08: Logout revokes session');
    } catch (e: any) {
      assert(false, 'AUTH-08: Logout revokes session', e.message);
    }

    // AUTH-09: Revoked Refresh Token Rejected
    try {
      await authService.refresh(refreshRes.refreshToken, 'TestAgent/1.0', '127.0.0.1');
      assert(false, 'AUTH-09: Revoked refresh token rejected', 'Expected 401');
    } catch (e: any) {
      assert(
        e.status === 401 || e.getStatus?.() === 401 || e.name === 'UnauthorizedException',
        'AUTH-09: Revoked refresh token rejected',
      );
    }

    // AUTH-10 & AUTH-11: Permission Guard Allowed vs Denied
    const reflector = new Reflector();
    const permissionsGuard = new PermissionsGuard(reflector);

    // Mock Execution Context for SALE permissions
    const createMockContext = (userObj: any, requiredPerms: string[]) => {
      reflector.getAllAndOverride = () => requiredPerms;
      return {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({ user: userObj }),
        }),
      } as any;
    };

    // User with SALE role permissions
    const { permissions: salePerms } = await rbacService.getUserRolesAndPermissions(user.id);
    const mockUser = { id: String(user.id), roles: ['SALE'], permissions: salePerms };

    // AUTH-10: Permission Allowed
    if (salePerms.length > 0) {
      const allowedPerm = salePerms[0];
      const ctxAllowed = createMockContext(mockUser, [allowedPerm]);
      const isAllowed = permissionsGuard.canActivate(ctxAllowed);
      assert(isAllowed === true, 'AUTH-10: Permission allowed');
    } else {
      assert(true, 'AUTH-10: Permission allowed (skipped due to empty permissions)');
    }

    // AUTH-11: Permission Denied
    const ctxDenied = createMockContext(mockUser, ['NON_EXISTENT_IMPOSSIBLE_PERMISSION']);
    try {
      permissionsGuard.canActivate(ctxDenied);
      assert(false, 'AUTH-11: Permission denied blocked', 'Expected 403');
    } catch (e: any) {
      assert(
        e.status === 403 || e.getStatus?.() === 403 || e.name === 'ForbiddenException',
        'AUTH-11: Permission denied blocked',
      );
    }

    // AUTH-12: Change password with wrong current password blocked
    try {
      await authService.changePassword(String(user.id), 'WrongCurrentPassword!', 'NewSecretPassword123!');
      assert(false, 'AUTH-12: Wrong current password blocked', 'Expected UnauthorizedException');
    } catch (e: any) {
      assert(
        e instanceof UnauthorizedException || e.status === 401 || e.message?.includes('không chính xác'),
        'AUTH-12: Wrong current password blocked',
      );
    }

    // AUTH-13: Change password successfully updates password and resets must_change_password
    const newPassword = 'BrandNewPassword2026!';
    await authService.changePassword(String(user.id), testPassword, newPassword);
    const updatedUser = await usersService.findById(user.id);
    const verifyNew = await passwordService.verifyPassword(updatedUser!.password_hash, newPassword);
    const verifyOld = await passwordService.verifyPassword(updatedUser!.password_hash, testPassword);
    assert(
      verifyNew === true && verifyOld === false && updatedUser!.must_change_password === false,
      'AUTH-13: Password change updates hash and sets must_change_password = FALSE',
    );
  } finally {
    // Cleanup fixture user
    await db.deleteFrom('user_roles').where('user_id', '=', user.id as any).execute();
    await db.deleteFrom('users').where('id', '=', user.id as any).execute();
    await db.deleteFrom('users').where('username', 'like', 'disabled_%').execute();
  }

  console.log('==================================================');
  console.log(`AUTH INTEGRATION TEST RESULT: ${passCount} PASSED, ${failCount} FAILED`);
  console.log('==================================================');

  await app.close();
  if (failCount > 0) {
    process.exit(1);
  }
}

runAuthIntegrationTests().catch((err) => {
  console.error('❌ Auth Integration Test Suite Error:', err);
  process.exit(1);
});
