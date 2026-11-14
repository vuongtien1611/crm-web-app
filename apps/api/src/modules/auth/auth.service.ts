import { HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { EmployeesService } from '../employees/employees.service';
import { RbacService } from '../rbac/rbac.service';
import { PasswordService } from './services/password.service';
import { SessionService } from './services/session.service';
import { KyselyService } from '../../database/kysely.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { BadRequestException } from '@nestjs/common';

export interface AuthUserPayload {
  id: string;
  username: string;
  email: string;
  employeeId: string | null;
  employeeCode: string | null;
  fullName: string | null;
  mustChangePassword: boolean;
  roles: string[];
  permissions: string[];
}

const LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60;
const MAX_IDENTIFIER_LOGIN_ATTEMPTS = 5;
const MAX_IP_LOGIN_ATTEMPTS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly employeesService: EmployeesService,
    private readonly rbacService: RbacService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService,
    private readonly kysely: KyselyService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async login(dto: LoginDto, userAgent?: string, ip?: string) {
    const identifier = (dto.identifier || '').trim().toLowerCase();
    const identifierHash = crypto.createHash('sha256').update(identifier).digest('hex');
    const ipHash = crypto.createHash('sha256').update(ip || 'unknown').digest('hex');
    const identifierAttemptsKey = `login_attempts:identifier:${identifierHash}`;
    const ipAttemptsKey = `login_attempts:ip:${ipHash}`;

    const ipAttempts = await this.incrementLoginAttempts(ipAttemptsKey);
    const identifierAttempts = await this.redisService.client.get(identifierAttemptsKey);
    if (
      Number(identifierAttempts || 0) >= MAX_IDENTIFIER_LOGIN_ATTEMPTS ||
      ipAttempts > MAX_IP_LOGIN_ATTEMPTS
    ) {
      throw new HttpException(
        'Too many login attempts. Please try again in 15 minutes.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const recordFailedLogin = async () => {
      await this.incrementLoginAttempts(identifierAttemptsKey);
    };

    // 1. Find user by username or email
    const user = await this.usersService.findByIdentifier(dto.identifier);
    if (!user) {
      await recordFailedLogin();
      throw new UnauthorizedException('Invalid credentials');
    }

    // 2. Verify User Active Status
    if (user.status !== 'ACTIVE') {
      await recordFailedLogin();
      throw new UnauthorizedException('User account is disabled or suspended');
    }

    // 3. Verify Employee Status (if linked)
    const employee = await this.employeesService.findByUserId(user.id);
    if (employee && (employee.status === 'RESIGNED' || employee.status === 'TERMINATED')) {
      await recordFailedLogin();
      throw new UnauthorizedException('Employee record is inactive');
    }

    // 4. Verify Password (Argon2id)
    const isPasswordValid = await this.passwordService.verifyPassword(user.password_hash, dto.password);
    if (!isPasswordValid) {
      await recordFailedLogin();
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.redisService.client.del(identifierAttemptsKey);

    // 5. Load Roles and Permissions
    const { roles, permissions } = await this.rbacService.getUserRolesAndPermissions(user.id);

    // 6. Sign Tokens
    const accessSecret = this.configService.get<string>('jwt.accessSecret') || 'default_access_secret';
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret') || 'default_refresh_secret';

    const sessionId = crypto.randomUUID();

    const accessToken = jwt.sign(
      {
        sub: user.id,
        employeeId: employee?.id || null,
        sessionId,
        roles,
        permissions,
      },
      accessSecret,
      { expiresIn: '15m' },
    );

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        sessionId,
      },
      refreshSecret,
      { expiresIn: '7d' },
    );

    // 7. Store Refresh Session in Redis
    await this.sessionService.createSession(
      String(user.id),
      refreshToken,
      sessionId,
      userAgent,
      ip,
    );

    // 8. Update last_login_at in database
    await this.kysely.db
      .updateTable('users')
      .set({ last_login_at: new Date() as any })
      .where('id', '=', user.id as any)
      .execute();

    const userPayload: AuthUserPayload = {
      id: String(user.id),
      username: user.username,
      email: user.email,
      employeeId: employee ? String(employee.id) : null,
      employeeCode: employee ? employee.employee_code : null,
      fullName: employee ? employee.full_name : null,
      mustChangePassword: !!user.must_change_password,
      roles,
      permissions,
    };

    return {
      accessToken,
      refreshToken,
      user: userPayload,
    };
  }

  private async incrementLoginAttempts(key: string): Promise<number> {
    const attempts = await this.redisService.client.incr(key);
    if (attempts === 1) {
      await this.redisService.client.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS);
    }
    return attempts;
  }

  async refresh(refreshToken: string, userAgent?: string, ip?: string) {
    const refreshSecret = this.configService.get<string>('jwt.refreshSecret') || 'default_refresh_secret';
    const accessSecret = this.configService.get<string>('jwt.accessSecret') || 'default_access_secret';

    let decoded: any;
    try {
      decoded = jwt.verify(refreshToken, refreshSecret);
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const userId = String(decoded.sub);
    const sessionId = String(decoded.sessionId);

    // Verify User Active
    const user = await this.usersService.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account is disabled or invalid');
    }

    const employee = await this.employeesService.findByUserId(userId);
    if (employee && (employee.status === 'RESIGNED' || employee.status === 'TERMINATED')) {
      throw new UnauthorizedException('Employee record is inactive');
    }

    // Generate new session ID and refresh token
    const newSessionId = crypto.randomUUID();
    const newRefreshToken = jwt.sign(
      { sub: userId, sessionId: newSessionId },
      refreshSecret,
      { expiresIn: '7d' },
    );

    // Rotate Session in Redis
    const rotatedSessionId = await this.sessionService.rotateSession(
      userId,
      sessionId,
      refreshToken,
      newSessionId,
      newRefreshToken,
      userAgent,
      ip,
    );

    if (!rotatedSessionId) {
      throw new UnauthorizedException('Session expired or revoked');
    }

    // Load RBAC
    const { roles, permissions } = await this.rbacService.getUserRolesAndPermissions(userId);

    const newAccessToken = jwt.sign(
      {
        sub: userId,
        employeeId: employee?.id || null,
        sessionId: rotatedSessionId,
        roles,
        permissions,
      },
      accessSecret,
      { expiresIn: '15m' },
    );

    const userPayload: AuthUserPayload = {
      id: String(user.id),
      username: user.username,
      email: user.email,
      employeeId: employee ? String(employee.id) : null,
      employeeCode: employee ? employee.employee_code : null,
      fullName: employee ? employee.full_name : null,
      mustChangePassword: !!user.must_change_password,
      roles,
      permissions,
    };

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      user: userPayload,
    };
  }

  async logout(userId: string, sessionId?: string) {
    if (sessionId) {
      await this.sessionService.revokeSession(userId, sessionId);
      await this.redisService.client.del(`boss_pin_unlocked:${userId}:${sessionId}`);
      await this.redisService.client.del(`boss_pin_unlocked:${userId}`);
    } else {
      await this.sessionService.revokeAllUserSessions(userId);
      await this.redisService.client.del(`boss_pin_unlocked:${userId}`);
    }
  }

  async forgotPassword(dto: ForgotPasswordDto, ip?: string) {
    const cleanId = (dto.identifier || '').trim();
    if (!cleanId) {
      return {
        success: true,
        message: 'Nếu thông tin hợp lệ, yêu cầu cấp lại mật khẩu đã được gửi tới Ban Giám Đốc (BOSS).',
      };
    }

    // Rate-limiting on Redis: max 3 requests per 15 minutes per IP + identifier
    const rlKey = `forgot_pwd_rl:${ip || 'unknown'}:${cleanId.toLowerCase()}`;
    const count = await this.redisService.client.get(rlKey);
    const numCount = count ? parseInt(count, 10) : 0;
    if (numCount >= 3) {
      throw new BadRequestException(
        'Bạn đã gửi quá nhiều yêu cầu trong thời gian ngắn. Vui lòng thử lại sau 15 phút.',
      );
    }
    await this.redisService.client.set(rlKey, String(numCount + 1), 'EX', 15 * 60);

    // 1. Identify employee / user
    const user = await this.usersService.findByIdentifier(cleanId);
    let employee = user ? await this.employeesService.findByUserId(user.id) : null;
    if (!employee) {
      employee = await this.employeesService.findByEmployeeCode(cleanId);
    }

    if (!employee || employee.status === 'RESIGNED' || employee.status === 'TERMINATED') {
      // Don't leak whether user exists
      return {
        success: true,
        message: 'Nếu thông tin hợp lệ, yêu cầu cấp lại mật khẩu đã được gửi tới Ban Giám Đốc (BOSS).',
      };
    }

    // 2. Prevent duplicate pending requests within 15 minutes
    const db = this.kysely.db;
    const existing = await db
      .selectFrom('password_reset_requests')
      .select(['id', 'requested_at'])
      .where('employee_id', '=', employee.id as any)
      .where('status', '=', 'PENDING')
      .executeTakeFirst();

    if (existing) {
      return {
        success: true,
        message: 'Yêu cầu của bạn đang chờ Ban Giám Đốc (BOSS) xử lý. Vui lòng không gửi lại nhiều lần.',
      };
    }

    // 3. Create Password Reset Request
    const [reqRecord] = await db
      .insertInto('password_reset_requests')
      .values({
        employee_id: employee.id as any,
        status: 'PENDING',
        ip_address: ip || null,
        requested_at: new Date(),
      })
      .returningAll()
      .execute();

    // 4. Send In-App Notification to BOSS
    await this.notificationsService.notifyRoles(['BOSS'], {
      eventType: 'PASSWORD_RESET_REQUESTED',
      title: 'Yêu cầu cấp lại mật khẩu',
      content: `${employee.full_name} đã quên tài khoản/mật khẩu. Hãy cấp lại cho ${employee.full_name}.`,
      deepLinkUrl: `/employee-accounts/${employee.id}?resetRequest=${reqRecord.id}`,
      entityType: 'PASSWORD_RESET_REQUEST',
      entityId: reqRecord.id,
    });

    return {
      success: true,
      message: 'Yêu cầu cấp lại tài khoản/mật khẩu đã được gửi tới Ban Giám Đốc (BOSS). Vui lòng liên hệ quản trị viên để nhận lại thông tin đăng nhập sau khi được cấp lại.',
    };
  }

  async getMe(userId: string): Promise<AuthUserPayload> {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      throw new UnauthorizedException('User account not found or inactive');
    }

    const user = await this.usersService.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account not found or inactive');
    }

    const employee = await this.employeesService.findByUserId(userId);
    const { roles, permissions } = await this.rbacService.getUserRolesAndPermissions(userId);

    return {
      id: String(user.id),
      username: user.username,
      email: user.email,
      employeeId: employee ? String(employee.id) : null,
      employeeCode: employee ? employee.employee_code : null,
      fullName: employee ? employee.full_name : null,
      mustChangePassword: !!user.must_change_password,
      roles,
      permissions,
    };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    if (!userId) {
      throw new UnauthorizedException('User account not found or inactive');
    }

    const user = await this.usersService.findById(userId);
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User account not found or inactive');
    }

    const isCurrentValid = await this.passwordService.verifyPassword(user.password_hash, currentPassword);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Mật khẩu hiện tại không chính xác');
    }

    // Hash new password using Argon2id
    const newHash = await this.passwordService.hashPassword(newPassword);

    // Update password and set must_change_password = FALSE
    await this.usersService.updatePassword(userId, newHash);
  }
}
