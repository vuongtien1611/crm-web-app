import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { KyselyService, CrmTransaction } from '../../database/kysely.service';
import { RedisService } from '../../redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { sql } from 'kysely';
import * as argon2 from 'argon2';
import { QueryEmployeeAccountsDto } from './dto/query-employee-accounts.dto';
import { UpdateEmployeeAccountDto } from './dto/update-employee-account.dto';

const DEFAULT_BOSS_PIN = '123456';
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCKOUT_SECONDS = 15 * 60; // 15 minutes
const UNLOCKED_SESSION_TTL = 24 * 60 * 60; // 24 hours

@Injectable()
export class EmployeeAccountsService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly redisService: RedisService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private get redis() {
    return this.redisService.client;
  }

  /**
   * Check if the current session has unlocked Account Management with PIN.
   */
  async isSessionUnlocked(userId: string, sessionId?: string): Promise<boolean> {
    if (!sessionId) {
      // Fallback if session ID is not passed: check user-level key
      const val = await this.redis.get(`boss_pin_unlocked:${userId}`);
      return val === '1';
    }
    const val = await this.redis.get(`boss_pin_unlocked:${userId}:${sessionId}`);
    return val === '1';
  }

  /**
   * Ensure BOSS has a security PIN hash record.
   * If not configured, initializes with DEFAULT_BOSS_PIN (123456).
   */
  /**
   * Get BOSS security PIN hash record.
   * In production, NEVER auto-default PIN. Returns null if not configured yet.
   * In test/dev/staging, initializes test fixture PIN (123456) if unconfigured.
   */
  private async getBossPinHash(bossUserId: string | number): Promise<string | null> {
    const db = this.kysely.db;
    const existing = await db
      .selectFrom('boss_security_config')
      .selectAll()
      .where('boss_user_id', '=', bossUserId as any)
      .executeTakeFirst();

    if (existing && existing.pin_hash) {
      return existing.pin_hash;
    }

    // In test environment: fallback to DEFAULT_BOSS_PIN in memory if unconfigured
    if (process.env.NODE_ENV === 'test') {
      const pinHash = await argon2.hash(DEFAULT_BOSS_PIN, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });
      return pinHash;
    }

    return null;
  }

  /**
   * Verify 6-digit PIN to unlock session.
   */
  async verifyPin(bossUserId: string, sessionId: string, pin: string) {
    const rlKey = `boss_pin_attempts:${bossUserId}`;
    const attempts = await this.redis.get(rlKey);
    const currentAttempts = attempts ? parseInt(attempts, 10) : 0;

    if (currentAttempts >= MAX_PIN_ATTEMPTS) {
      const ttl = await this.redis.ttl(rlKey);
      throw new ForbiddenException(
        `Đã vượt quá số lần thử PIN cho phép. Vui lòng thử lại sau ${Math.ceil(ttl / 60)} phút.`,
      );
    }

    const pinHash = await this.getBossPinHash(bossUserId);
    if (!pinHash) {
      throw new BadRequestException(
        'Mã PIN bảo mật chưa được thiết lập. Vui lòng thiết lập mã PIN 6 số lần đầu.',
      );
    }

    const isValid = await argon2.verify(pinHash, pin);

    if (!isValid) {
      const newAttempts = currentAttempts + 1;
      await this.redis.set(rlKey, String(newAttempts), 'EX', PIN_LOCKOUT_SECONDS);
      const remaining = MAX_PIN_ATTEMPTS - newAttempts;
      throw new BadRequestException(
        remaining > 0
          ? `Mã PIN không chính xác. Bạn còn ${remaining} lần thử.`
          : `Mã PIN không chính xác. Tài khoản bị tạm khóa thử PIN trong 15 phút.`,
      );
    }

    // PIN is valid: Reset attempt counter
    await this.redis.del(rlKey);

    // Set unlocked in Redis for this session
    if (sessionId) {
      await this.redis.set(
        `boss_pin_unlocked:${bossUserId}:${sessionId}`,
        '1',
        'EX',
        UNLOCKED_SESSION_TTL,
      );
    }
    // Also set user-level fallback key
    await this.redis.set(
      `boss_pin_unlocked:${bossUserId}`,
      '1',
      'EX',
      UNLOCKED_SESSION_TTL,
    );

    return {
      success: true,
      unlocked: true,
      message: 'Xác thực mã PIN thành công. Phiên làm việc đã được mở khóa.',
    };
  }

  /**
   * Change 6-digit PIN for BOSS (or initial setup).
   */
  async changePin(bossUserId: string, currentPin: string | undefined, newPin: string, confirmPin?: string) {
    if (!/^\d{6}$/.test(newPin)) {
      throw new BadRequestException('Mã PIN mới phải bao gồm đúng 6 chữ số');
    }

    if (confirmPin && newPin !== confirmPin) {
      throw new BadRequestException('Mã PIN xác nhận không khớp');
    }

    const db = this.kysely.db;
    const existing = await db
      .selectFrom('boss_security_config')
      .selectAll()
      .where('boss_user_id', '=', bossUserId as any)
      .executeTakeFirst();

    const isFirstTimeSetup = !existing || !existing.pin_hash;

    // If existing PIN exists, currentPin is strictly required and verified
    if (!isFirstTimeSetup) {
      if (!currentPin) {
        throw new BadRequestException('Vui lòng nhập mã PIN hiện tại');
      }
      const isValid = await argon2.verify(existing.pin_hash, currentPin);
      if (!isValid) {
        throw new BadRequestException('Mã PIN hiện tại không chính xác');
      }
    }

    const newPinHash = await argon2.hash(newPin, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    if (existing) {
      await db
        .updateTable('boss_security_config')
        .set({
          pin_hash: newPinHash,
          failed_attempts: 0,
          locked_until: null,
          updated_at: new Date() as any,
        })
        .where('boss_user_id', '=', bossUserId as any)
        .execute();
    } else {
      await db
        .insertInto('boss_security_config')
        .values({
          boss_user_id: bossUserId as any,
          pin_hash: newPinHash,
          failed_attempts: 0,
        })
        .execute();
    }

    return {
      success: true,
      message: isFirstTimeSetup ? 'Thiết lập mã PIN bảo mật thành công.' : 'Đổi mã PIN thành công.',
    };
  }

  /**
   * Get PIN configuration status and unlock state for current session.
   */
  async getPinStatus(bossUserId: string, sessionId?: string) {
    const isUnlocked = await this.isSessionUnlocked(bossUserId, sessionId);
    const db = this.kysely.db;
    const config = await db
      .selectFrom('boss_security_config')
      .select(['id', 'pin_hash', 'updated_at'])
      .where('boss_user_id', '=', bossUserId as any)
      .executeTakeFirst();

    return {
      isConfigured: !!(config && config.pin_hash),
      isUnlocked,
    };
  }

  /**
   * Get list of employee accounts with server-side filters & pagination.
   */
  async getAccounts(query: QueryEmployeeAccountsDto, actorUserId: string, actorSessionId?: string) {
    const db = this.kysely.db;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    let baseQuery = db
      .selectFrom('employees as e')
      .innerJoin('users as u', 'u.id', 'e.user_id')
      .innerJoin('positions as p', 'p.id', 'e.position_id')
      .leftJoin('team_memberships as tm', (join: any) =>
        join
          .onRef('tm.employee_id', '=', 'e.id')
          .on((eb: any) => sql<boolean>`tm.effective_range @> NOW()`),
      )
      .leftJoin('teams as t', 't.id', 'tm.team_id');

    // Search query: Name, Code, Username, Email
    if (query.q && query.q.trim() !== '') {
      const term = `%${query.q.trim().toLowerCase()}%`;
      baseQuery = baseQuery.where((eb: any) =>
        eb.or([
          sql`LOWER(e.full_name) LIKE ${term}`,
          sql`LOWER(e.employee_code) LIKE ${term}`,
          sql`LOWER(u.username) LIKE ${term}`,
          sql`LOWER(u.email) LIKE ${term}`,
        ]),
      );
    }

    // Filter by department
    if (query.department && query.department !== 'ALL') {
      baseQuery = baseQuery.where('t.department', '=', query.department);
    }

    // Filter by team
    if (query.team_id && query.team_id !== 'ALL') {
      baseQuery = baseQuery.where('t.id', '=', query.team_id as any);
    }

    // Filter by position
    if (query.position_id && query.position_id !== 'ALL') {
      baseQuery = baseQuery.where('p.id', '=', query.position_id as any);
    }

    // Filter by account status (ACTIVE, DISABLED)
    if (query.status && query.status !== 'ALL') {
      baseQuery = baseQuery.where('u.status', '=', query.status as any);
    }

    // Count total matching records
    const countResult = await baseQuery
      .select(sql`COUNT(DISTINCT e.id)`.as('total'))
      .executeTakeFirst();
    const total = Number(countResult?.total || 0);

    // Fetch paginated records
    const rows = await baseQuery
      .select([
        'e.id as employee_id',
        'e.employee_code',
        'e.full_name',
        'e.phone',
        'e.status as employee_status',
        'e.created_at as employee_created_at',
        'u.id as user_id',
        'u.username',
        'u.email',
        'u.status as account_status',
        'u.must_change_password',
        'u.last_login_at',
        'p.id as position_id',
        'p.name as position_name',
        'p.code as position_code',
        't.id as team_id',
        't.name as team_name',
        't.department',
        sql`(
          SELECT EXISTS (
            SELECT 1 FROM password_reset_requests prr
            WHERE prr.employee_id = e.id AND prr.status = 'PENDING'
          )
        )`.as('has_pending_reset_request'),
      ])
      .distinctOn('e.id')
      .orderBy('e.id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const isUnlocked = await this.isSessionUnlocked(actorUserId, actorSessionId);

    return {
      data: rows.map((r: any) => ({
        ...r,
        has_pending_reset_request: Boolean(r.has_pending_reset_request),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      isUnlocked,
    };
  }

  /**
   * Get single employee account detail.
   */
  async getAccountDetail(
    employeeId: string | number,
    actorUserId: string,
    actorSessionId?: string,
    resetRequestId?: string | number,
  ) {
    const db = this.kysely.db;
    const employee = await db
      .selectFrom('employees as e')
      .innerJoin('users as u', 'u.id', 'e.user_id')
      .innerJoin('positions as p', 'p.id', 'e.position_id')
      .leftJoin('team_memberships as tm', (join: any) =>
        join
          .onRef('tm.employee_id', '=', 'e.id')
          .on((eb: any) => sql<boolean>`tm.effective_range @> NOW()`),
      )
      .leftJoin('teams as t', 't.id', 'tm.team_id')
      .select([
        'e.id as employee_id',
        'e.employee_code',
        'e.full_name',
        'e.phone',
        'e.status as employee_status',
        'e.created_at as employee_created_at',
        'u.id as user_id',
        'u.username',
        'u.email',
        'u.status as account_status',
        'u.must_change_password',
        'u.last_login_at',
        'p.id as position_id',
        'p.name as position_name',
        'p.code as position_code',
        't.id as team_id',
        't.name as team_name',
        't.department',
      ])
      .where('e.id', '=', employeeId as any)
      .executeTakeFirst();

    if (!employee) {
      throw new NotFoundException('Không tìm thấy thông tin nhân viên hoặc tài khoản');
    }

    // Get roles of this user
    const roles = await db
      .selectFrom('user_roles as ur')
      .innerJoin('roles as r', 'r.id', 'ur.role_id')
      .select(['r.code', 'r.name'])
      .where('ur.user_id', '=', employee.user_id as any)
      .execute();

    // Fetch pending password reset requests for this employee
    const pendingRequests = await db
      .selectFrom('password_reset_requests')
      .selectAll()
      .where('employee_id', '=', employeeId as any)
      .where('status', '=', 'PENDING')
      .orderBy('requested_at', 'desc')
      .execute();

    let targetResetRequest: any = null;
    if (resetRequestId) {
      targetResetRequest = await db
        .selectFrom('password_reset_requests')
        .selectAll()
        .where('id', '=', resetRequestId as any)
        .where('employee_id', '=', employeeId as any)
        .executeTakeFirst();
    }

    const isUnlocked = await this.isSessionUnlocked(actorUserId, actorSessionId);

    return {
      employee: {
        ...employee,
        roles: roles.map((r: any) => r.code),
        roleDetails: roles,
      },
      pendingResetRequests: pendingRequests,
      targetResetRequest,
      isUnlocked,
    };
  }

  /**
   * Update employee account (change username, status, or reset password).
   * Enforces backend step-up PIN verification.
   */
  async updateAccount(
    employeeId: string | number,
    dto: UpdateEmployeeAccountDto,
    actorEmployeeId: string | number,
    actorUserId: string,
    actorSessionId?: string,
    ip?: string,
  ) {
    // 1. Enforce Step-up PIN authorization
    const isUnlocked = await this.isSessionUnlocked(actorUserId, actorSessionId);
    if (!isUnlocked) {
      throw new ForbiddenException({
        code: 'PIN_REQUIRED',
        message: 'Yêu cầu xác thực mã PIN 6 số để thực hiện thao tác cập nhật tài khoản',
      });
    }

    const db = this.kysely.db;

    // 2. Find target employee & user
    const employee = await db
      .selectFrom('employees as e')
      .innerJoin('users as u', 'u.id', 'e.user_id')
      .innerJoin('positions as p', 'p.id', 'e.position_id')
      .select([
        'e.id as employee_id',
        'e.full_name',
        'e.user_id',
        'p.code as position_code',
        'u.username',
        'u.status as user_status',
        'u.must_change_password',
      ])
      .where('e.id', '=', employeeId as any)
      .executeTakeFirst();

    if (!employee) {
      throw new NotFoundException('Không tìm thấy tài khoản nhân sự cần cập nhật');
    }

    const beforeState = {
      username: employee.username,
      status: employee.user_status,
      must_change_password: employee.must_change_password,
    };

    const updates: Record<string, any> = {};
    let passwordResetPerformed = false;

    // 3. Username Update
    if (dto.username && dto.username.trim() !== '' && dto.username.trim() !== employee.username) {
      const normalizedUsername = dto.username.trim().toLowerCase();
      // Check format
      if (!/^[a-zA-Z0-9_.-]{3,50}$/.test(normalizedUsername)) {
        throw new BadRequestException(
          'Tên đăng nhập không hợp lệ (độ dài 3-50 ký tự, chỉ gồm chữ cái, số, _, . và -)',
        );
      }
      // Check uniqueness
      const conflict = await db
        .selectFrom('users')
        .select('id')
        .where('username', '=', normalizedUsername)
        .where('id', '!=', employee.user_id as any)
        .executeTakeFirst();

      if (conflict) {
        throw new ConflictException(`Tên đăng nhập "${normalizedUsername}" đã được sử dụng`);
      }

      updates.username = normalizedUsername;
    }

    // 4. Account Status Update
    if (dto.accountStatus && dto.accountStatus !== employee.user_status) {
      // Invariant: Cannot disable single active BOSS account
      if (employee.position_code === 'BOSS' && dto.accountStatus === 'DISABLED') {
        throw new BadRequestException('Không thể vô hiệu hóa tài khoản Giám Đốc (BOSS)');
      }
      updates.status = dto.accountStatus;
    }

    // 5. Password Reset
    if (dto.newPassword && dto.newPassword.trim() !== '') {
      if (dto.newPassword.length < 8) {
        throw new BadRequestException('Mật khẩu mới phải có tối thiểu 8 ký tự');
      }

      const passwordHash = await argon2.hash(dto.newPassword, {
        type: argon2.argon2id,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
      });

      updates.password_hash = passwordHash;
      updates.must_change_password = true; // Rule: Must change password on next login
      passwordResetPerformed = true;
    }

    if (Object.keys(updates).length === 0) {
      return { success: true, message: 'Không có thay đổi nào được ghi nhận.' };
    }

    updates.updated_at = new Date();

    // 6. Execute update in transaction
    await db.transaction().execute(async (trx: CrmTransaction) => {
      await trx
        .updateTable('users')
        .set(updates)
        .where('id', '=', employee.user_id)
        .execute();

      // If password was reset, mark pending reset requests as RESOLVED
      if (passwordResetPerformed) {
        await trx
          .updateTable('password_reset_requests')
          .set({
            status: 'RESOLVED',
            resolved_at: new Date(),
            resolved_by_employee_id: actorEmployeeId as any,
          })
          .where('employee_id', '=', employeeId as any)
          .where('status', '=', 'PENDING')
          .execute();

        // Create notification for employee
        await this.notificationsService.createNotification(
          {
            employeeId: employeeId,
            eventType: 'PASSWORD_RESET_RESOLVED',
            title: 'Mật khẩu đã được cấp lại',
            content:
              'Mật khẩu tài khoản của bạn đã được Giám Đốc (BOSS) đặt lại thành công. Vui lòng đăng nhập bằng mật khẩu mới và đổi mật khẩu theo yêu cầu.',
            deepLinkUrl: '/change-password',
            entityType: 'EMPLOYEE',
            entityId: employeeId,
          },
          trx,
        );
      }

      // 7. Write Audit Log (Sanitized, absolutely no secrets)
      const afterState = {
        username: updates.username || beforeState.username,
        status: updates.status || beforeState.status,
        must_change_password: updates.must_change_password ?? beforeState.must_change_password,
        password_reset: passwordResetPerformed,
      };

      await trx
        .insertInto('audit_logs')
        .values({
          actor_employee_id: actorEmployeeId as any,
          actor_type: 'USER',
          action: passwordResetPerformed ? 'PASSWORD_RESET' : 'EMPLOYEE_ACCOUNT_UPDATE',
          entity_type: 'EMPLOYEE',
          entity_id: employeeId as any,
          payload_before_sanitized: JSON.stringify(beforeState),
          payload_after_sanitized: JSON.stringify(afterState),
          ip_address: ip || null,
          created_at: new Date(),
        })
        .execute();
    });

    return {
      success: true,
      message: passwordResetPerformed
        ? 'Đặt lại mật khẩu và cập nhật tài khoản thành công.'
        : 'Cập nhật tài khoản nhân sự thành công.',
    };
  }
}
