import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import * as argon2 from 'argon2';
import {
  CreateEmployeeAccountDto,
  COMPATIBILITY_MATRIX,
} from './dto/create-employee.dto';

export interface EmployeeRecord {
  id: string;
  user_id: string | null;
  employee_code: string;
  full_name: string;
  phone: string | null;
  position_id: string;
  status: 'PROBATION' | 'ACTIVE' | 'RESIGNED' | 'TERMINATED';
  hire_date?: string | null;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class EmployeesService {
  constructor(private readonly kysely: KyselyService) {}

  async findByUserId(userId: string | number): Promise<EmployeeRecord | null> {
    const db = this.kysely.db;
    const emp = await db
      .selectFrom('employees')
      .selectAll()
      .where('user_id', '=', userId as any)
      .executeTakeFirst();

    return (emp as unknown as EmployeeRecord) || null;
  }

  async findByEmployeeCode(code: string): Promise<EmployeeRecord | null> {
    const db = this.kysely.db;
    const emp = await db
      .selectFrom('employees')
      .selectAll()
      .where('employee_code', '=', code)
      .executeTakeFirst();

    return (emp as unknown as EmployeeRecord) || null;
  }

  async createEmployee(data: {
    employeeCode: string;
    fullName: string;
    positionId: string | number;
    userId?: string | number | null;
    status?: 'PROBATION' | 'ACTIVE' | 'RESIGNED' | 'TERMINATED';
  }): Promise<EmployeeRecord> {
    const db = this.kysely.db;
    const [emp] = await db
      .insertInto('employees')
      .values({
        employee_code: data.employeeCode,
        full_name: data.fullName,
        position_id: data.positionId as any,
        user_id: data.userId ? (data.userId as any) : null,
        status: data.status || 'ACTIVE',
      })
      .returningAll()
      .execute();

    return emp as unknown as EmployeeRecord;
  }

  async linkUser(employeeId: string | number, userId: string | number): Promise<void> {
    const db = this.kysely.db;
    await db
      .updateTable('employees')
      .set({ user_id: userId as any })
      .where('id', '=', employeeId as any)
      .execute();
  }

  /**
   * CANONICAL INVARIANT: Only 1 active BOSS account is permitted across the entire system.
   * Serializes checks via PostgreSQL transaction-level advisory lock to eliminate race conditions.
   */
  private async checkSingleActiveBossConstraint(
    trx: any,
    targetEmployeeId?: string | number,
    targetUserId?: string | number,
  ) {
    await sql`SELECT pg_advisory_xact_lock(hashtext('single_active_boss_lock'))`.execute(trx);

    // 1. Check active employees with position BOSS
    let empQuery = trx
      .selectFrom('employees')
      .innerJoin('positions', 'positions.id', 'employees.position_id')
      .select(['employees.id', 'employees.full_name', 'employees.employee_code', 'employees.status'])
      .where('positions.code', '=', 'BOSS')
      .where('employees.status', 'in', ['ACTIVE', 'PROBATION']);

    if (targetEmployeeId) {
      empQuery = empQuery.where('employees.id', '!=', targetEmployeeId as any);
    }
    const existingActiveEmp = await empQuery.executeTakeFirst();

    // 2. Check active users with role BOSS
    let userQuery = trx
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .innerJoin('users', 'users.id', 'user_roles.user_id')
      .select(['users.id', 'users.username', 'users.email', 'users.status'])
      .where('roles.code', '=', 'BOSS')
      .where('users.status', '=', 'ACTIVE');

    if (targetUserId) {
      userQuery = userQuery.where('users.id', '!=', targetUserId as any);
    }
    const existingActiveUser = await userQuery.executeTakeFirst();

    if (existingActiveEmp || existingActiveUser) {
      const desc = existingActiveEmp
        ? `${existingActiveEmp.full_name} (${existingActiveEmp.employee_code})`
        : `${existingActiveUser?.username} (${existingActiveUser?.email})`;

      throw new BadRequestException(
        `Hệ thống chỉ cho phép duy nhất 1 tài khoản Giám Đốc (BOSS) đang hoạt động. Hiện đã có tài khoản BOSS active: ${desc}. Không thể tạo, kích hoạt hoặc thăng chức tài khoản BOSS thứ 2.`,
      );
    }
  }

  // --------------------------------------------------
  // PHASE B: ATOMIC EMPLOYEE ACCOUNT CREATION
  // Creates User + Employee + Position + Role + Team Membership + AuditLog
  // --------------------------------------------------
  async createEmployeeAccount(
    dto: CreateEmployeeAccountDto,
    actorEmployeeId?: string | number | null,
  ) {
    // 1. Validate hireDate (Strictly required, no fallback)
    if (
      !dto.hireDate ||
      typeof dto.hireDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dto.hireDate.trim())
    ) {
      throw new BadRequestException(
        'hireDate is required and must be in YYYY-MM-DD format',
      );
    }

    // 2. Validate Compatibility Matrix (Position ↔ Role ↔ Department)
    const rule = COMPATIBILITY_MATRIX[dto.positionCode];
    if (!rule) {
      throw new BadRequestException(`Invalid positionCode: ${dto.positionCode}`);
    }
    if (!rule.roles.includes(dto.roleCode)) {
      throw new BadRequestException(
        `Incompatible Position [${dto.positionCode}] and Role [${dto.roleCode}]`,
      );
    }
    const normalizedDept = dto.department.trim().toUpperCase();
    if (!rule.departments.includes(normalizedDept)) {
      throw new BadRequestException(
        `Department [${dto.department}] is not compatible with Position [${dto.positionCode}]`,
      );
    }

    // 2.1 Fast-path pre-check for single active BOSS rule
    if (dto.positionCode === 'BOSS' || dto.roleCode === 'BOSS') {
      const activeBossEmp = await this.kysely.db
        .selectFrom('employees')
        .innerJoin('positions', 'positions.id', 'employees.position_id')
        .select(['employees.id', 'employees.full_name', 'employees.employee_code'])
        .where('positions.code', '=', 'BOSS')
        .where('employees.status', 'in', ['ACTIVE', 'PROBATION'])
        .executeTakeFirst();

      const activeBossUser = await this.kysely.db
        .selectFrom('user_roles')
        .innerJoin('roles', 'roles.id', 'user_roles.role_id')
        .innerJoin('users', 'users.id', 'user_roles.user_id')
        .select(['users.id', 'users.username', 'users.email'])
        .where('roles.code', '=', 'BOSS')
        .where('users.status', '=', 'ACTIVE')
        .executeTakeFirst();

      if (activeBossEmp || activeBossUser) {
        const desc = activeBossEmp
          ? `${activeBossEmp.full_name} (${activeBossEmp.employee_code})`
          : `${activeBossUser?.username} (${activeBossUser?.email})`;
        throw new BadRequestException(
          `Hệ thống chỉ cho phép duy nhất 1 tài khoản Giám Đốc (BOSS) đang hoạt động. Hiện đã có tài khoản BOSS active: ${desc}. Không thể tạo thêm BOSS active thứ 2.`,
        );
      }
    }

    // 3. Fetch Position and Role from database
    const position = await this.kysely.db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', dto.positionCode)
      .executeTakeFirst();
    if (!position) {
      throw new NotFoundException(`Position '${dto.positionCode}' not found in database`);
    }

    const role = await this.kysely.db
      .selectFrom('roles')
      .selectAll()
      .where('code', '=', dto.roleCode)
      .executeTakeFirst();
    if (!role) {
      throw new NotFoundException(`Role '${dto.roleCode}' not found in database`);
    }

    // 4. If teamId provided, check team existence and department compatibility
    let team: any = null;
    if (dto.teamId) {
      team = await this.kysely.db
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', dto.teamId as any)
        .executeTakeFirst();
      if (!team) {
        throw new NotFoundException(`Team #${dto.teamId} not found`);
      }
      if (!team.department) {
        throw new BadRequestException(
          `TEAM DEPARTMENT CLASSIFICATION GAP: Team #${dto.teamId} (${team.code}) does not have a classified department. Cannot assign employee without explicit team department.`,
        );
      }
      if (team.department.toUpperCase() !== normalizedDept) {
        throw new BadRequestException(
          `Team department [${team.department}] does not match employee department [${dto.department}]`,
        );
      }
    }

    // 4. Check duplicate username or email in users table
    const existingUser = await this.kysely.db
      .selectFrom('users')
      .select(['id', 'username', 'email'])
      .where((eb) =>
        eb.or([
          eb('username', '=', dto.username),
          eb('email', '=', dto.email),
        ]),
      )
      .executeTakeFirst();

    if (existingUser) {
      if (existingUser.username === dto.username) {
        throw new ConflictException(`Username '${dto.username}' already exists`);
      }
      if (existingUser.email === dto.email) {
        throw new ConflictException(`Email '${dto.email}' already exists`);
      }
    }

    // 5. Password Hashing with Argon2id
    const rawPassword = dto.password || 'VmaxTemp123!@#';
    const passwordHash = await argon2.hash(rawPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const isLeader =
      dto.isLeader ??
      (dto.positionCode.endsWith('_TEAM_LEADER') || dto.roleCode.endsWith('_TEAM_LEADER'));

    // 6. Execute in atomic transaction
    return await this.kysely.db.transaction().execute(async (trx) => {
      // Invariant: Enforce Single Active BOSS under concurrency lock
      if (dto.positionCode === 'BOSS' || dto.roleCode === 'BOSS') {
        await this.checkSingleActiveBossConstraint(trx);
      }

      // Check active team leader conflict if isLeader = true
      if (dto.teamId && isLeader) {
        const activeLeader = await trx
          .selectFrom('team_memberships')
          .select('id')
          .where('team_id', '=', dto.teamId as any)
          .where('is_leader', '=', true)
          .where(sql`effective_range @> NOW()` as any)
          .executeTakeFirst();

        if (activeLeader) {
          throw new BadRequestException(
            `Team #${dto.teamId} already has an active Team Leader`,
          );
        }
      }

      // Insert User
      const [createdUser] = await trx
        .insertInto('users')
        .values({
          username: dto.username,
          email: dto.email,
          password_hash: passwordHash,
          status: 'ACTIVE',
          must_change_password: true,
        })
        .returningAll()
        .execute();

      // Generate unique employeeCode
      const employeeCode =
        'EMP-' +
        dto.positionCode.slice(0, 4) +
        '-' +
        Math.random().toString(36).substring(2, 6).toUpperCase() +
        '-' +
        Date.now().toString().slice(-4);

      // Insert Employee
      const [createdEmployee] = await trx
        .insertInto('employees')
        .values({
          user_id: createdUser.id,
          employee_code: employeeCode,
          full_name: dto.fullName,
          phone: dto.phone || null,
          position_id: position.id,
          hire_date: dto.hireDate as any,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();

      // Insert User Role
      await trx
        .insertInto('user_roles')
        .values({
          user_id: createdUser.id,
          role_id: role.id,
        })
        .execute();

      // Insert Team Membership if teamId provided
      let teamMembership: any = null;
      if (dto.teamId) {
        const [membership] = await trx
          .insertInto('team_memberships')
          .values({
            team_id: dto.teamId as any,
            employee_id: createdEmployee.id,
            is_leader: isLeader,
            effective_range: sql`tstzrange(NOW(), NULL, '[)')`,
          })
          .returningAll()
          .execute();
        teamMembership = membership;
      }

      // Insert Audit Log
      await trx
        .insertInto('audit_logs')
        .values({
          actor_employee_id: actorEmployeeId ? (actorEmployeeId as any) : null,
          action: 'EMPLOYEE_CREATE',
          entity_type: 'EMPLOYEE',
          entity_id: createdEmployee.id,
          payload_before_sanitized: null,
          payload_after_sanitized: JSON.stringify({
            userId: createdUser.id,
            employeeId: createdEmployee.id,
            username: createdUser.username,
            email: createdUser.email,
            positionCode: dto.positionCode,
            roleCode: dto.roleCode,
            department: dto.department,
            teamId: dto.teamId || null,
            isLeader,
          }),
        })
        .execute();

      return {
        user: {
          id: String(createdUser.id),
          username: createdUser.username,
          email: createdUser.email,
          mustChangePassword: createdUser.must_change_password,
          status: createdUser.status,
        },
        employee: {
          id: String(createdEmployee.id),
          employeeCode: createdEmployee.employee_code,
          fullName: createdEmployee.full_name,
          phone: createdEmployee.phone,
          positionId: String(createdEmployee.position_id),
          positionCode: dto.positionCode,
          hireDate: dto.hireDate
            ? dto.hireDate
            : createdEmployee.hire_date instanceof Date
              ? `${createdEmployee.hire_date.getFullYear()}-${String(createdEmployee.hire_date.getMonth() + 1).padStart(2, '0')}-${String(createdEmployee.hire_date.getDate()).padStart(2, '0')}`
              : createdEmployee.hire_date
                ? String(createdEmployee.hire_date)
                : null,
          status: createdEmployee.status,
        },
        role: {
          id: String(role.id),
          code: role.code,
          name: role.name,
        },
        teamMembership: teamMembership
          ? {
              id: String(teamMembership.id),
              teamId: String(teamMembership.team_id),
              isLeader: teamMembership.is_leader,
            }
          : null,
      };
    });
  }

  // --------------------------------------------------
  // UPDATE EMPLOYEE (Status, Position, Role Promotion, Details)
  // Enforces Single Active BOSS Invariant during promotions/reactivations
  // --------------------------------------------------
  async updateEmployee(
    id: string | number,
    dto: {
      positionCode?: string;
      roleCode?: string;
      status?: 'PROBATION' | 'ACTIVE' | 'RESIGNED' | 'TERMINATED';
      fullName?: string;
      phone?: string;
    },
    actorEmployeeId?: string | number | null,
  ) {
    return await this.kysely.db.transaction().execute(async (trx) => {
      // 1. Fetch current employee record
      const emp = await trx
        .selectFrom('employees')
        .selectAll()
        .where('id', '=', id as any)
        .executeTakeFirst();

      if (!emp) {
        throw new NotFoundException(`Employee #${id} not found`);
      }

      let newPositionId = emp.position_id;
      let isBossCheckNeeded = false;

      if (dto.positionCode) {
        const pos = await trx
          .selectFrom('positions')
          .selectAll()
          .where('code', '=', dto.positionCode)
          .executeTakeFirst();
        if (!pos) throw new NotFoundException(`Position '${dto.positionCode}' not found`);
        newPositionId = pos.id as any;
        if (pos.code === 'BOSS') isBossCheckNeeded = true;
      }

      if (dto.roleCode === 'BOSS') isBossCheckNeeded = true;

      const targetStatus = dto.status || emp.status;
      const isTargetActive = ['ACTIVE', 'PROBATION'].includes(targetStatus);

      // Check if this was already a BOSS being reactivated
      const currentPos = await trx
        .selectFrom('positions')
        .select('code')
        .where('id', '=', emp.position_id)
        .executeTakeFirst();
      if (currentPos?.code === 'BOSS' && isTargetActive) {
        isBossCheckNeeded = true;
      }

      // Enforce single active BOSS invariant
      if (isBossCheckNeeded && isTargetActive) {
        await this.checkSingleActiveBossConstraint(trx, id, emp.user_id);
      }

      const updateData: any = { updated_at: new Date() };
      if (dto.fullName) updateData.full_name = dto.fullName;
      if (dto.phone !== undefined) updateData.phone = dto.phone;
      if (dto.positionCode) updateData.position_id = newPositionId;
      if (dto.status) updateData.status = dto.status;

      const [updatedEmp] = await trx
        .updateTable('employees')
        .set(updateData)
        .where('id', '=', id as any)
        .returningAll()
        .execute();

      // If user linked and roleCode specified or status changed
      if (emp.user_id) {
        if (dto.roleCode) {
          const role = await trx
            .selectFrom('roles')
            .selectAll()
            .where('code', '=', dto.roleCode)
            .executeTakeFirst();
          if (role) {
            await trx.deleteFrom('user_roles').where('user_id', '=', emp.user_id as any).execute();
            await trx.insertInto('user_roles').values({ user_id: emp.user_id as any, role_id: role.id as any }).execute();
          }
        }
        if (dto.status) {
          const userStatus = ['RESIGNED', 'TERMINATED'].includes(dto.status) ? 'DISABLED' : 'ACTIVE';
          await trx.updateTable('users').set({ status: userStatus, updated_at: new Date() }).where('id', '=', emp.user_id as any).execute();
        }
      }

      return updatedEmp;
    });
  }

  // --------------------------------------------------
  // METADATA OPTIONS FOR FORM CREATION
  // --------------------------------------------------
  async getFormOptions() {
    const db = this.kysely.db;
    const positions = await db
      .selectFrom('positions')
      .select(['id', 'code', 'name'])
      .orderBy('id asc')
      .execute();

    const roles = await db
      .selectFrom('roles')
      .select(['id', 'code', 'name'])
      .orderBy('id asc')
      .execute();

    const teams = await db
      .selectFrom('teams')
      .select(['id', 'code', 'name', 'department'])
      .orderBy('id asc')
      .execute();

    return {
      positions: positions.map((p) => ({
        id: String(p.id),
        code: p.code,
        name: p.name,
      })),
      roles: roles.map((r) => ({
        id: String(r.id),
        code: r.code,
        name: r.name,
      })),
      teams: teams.map((t) => ({
        id: String(t.id),
        code: t.code,
        name: t.name,
        department: t.department || '',
      })),
      canonicalDepartments: ['SALES', 'DEV', 'SEO', 'OPERATION'],
      compatibility: COMPATIBILITY_MATRIX,
    };
  }

  // --------------------------------------------------
  // LIST EMPLOYEES (WITH PAGINATION, SEARCH, SUMMARY)
  // --------------------------------------------------
  async getEmployees(query: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    positionCode?: string;
    department?: string;
    teamId?: string | number;
  }) {
    const db = this.kysely.db;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    let baseQuery = db
      .selectFrom('employees')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .leftJoin('users', 'users.id', 'employees.user_id');

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim().toLowerCase()}%`;
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb(sql`lower(employees.full_name)`, 'like', term),
          eb(sql`lower(employees.employee_code)`, 'like', term),
          eb(sql`lower(users.email)`, 'like', term),
          eb(sql`lower(users.username)`, 'like', term),
        ]),
      );
    }

    if (query.status && query.status.trim()) {
      baseQuery = baseQuery.where('employees.status', '=', query.status.trim() as any);
    }

    if (query.positionCode && query.positionCode.trim()) {
      baseQuery = baseQuery.where('positions.code', '=', query.positionCode.trim());
    }

    if (query.teamId) {
      baseQuery = baseQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('team_memberships')
            .select('team_memberships.id')
            .whereRef('team_memberships.employee_id', '=', 'employees.id')
            .where('team_memberships.team_id', '=', query.teamId as any)
            .where(sql`team_memberships.effective_range @> NOW()` as any),
        ),
      );
    }

    if (query.department && query.department.trim()) {
      const dept = query.department.trim().toUpperCase();
      baseQuery = baseQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('team_memberships')
            .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
            .select('team_memberships.id')
            .whereRef('team_memberships.employee_id', '=', 'employees.id')
            .where('teams.department', '=', dept)
            .where(sql`team_memberships.effective_range @> NOW()` as any),
        ),
      );
    }

    const countResult = await baseQuery
      .select(sql<string>`count(employees.id)`.as('total_count'))
      .executeTakeFirst();
    const total = Number(countResult?.total_count || 0);

    const rows = await baseQuery
      .select([
        'employees.id as employee_id',
        'employees.employee_code',
        'employees.full_name',
        'employees.phone',
        'employees.hire_date',
        'employees.status as employee_status',
        'employees.created_at as employee_created_at',
        'positions.id as pos_id',
        'positions.code as pos_code',
        'positions.name as pos_name',
        'users.id as user_id',
        'users.username',
        'users.email',
        'users.status as user_status',
        'users.must_change_password',
      ])
      .orderBy('employees.id', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    const summaryRows = await db
      .selectFrom('employees')
      .select([
        sql<string>`count(*)`.as('total'),
        sql<string>`count(*) filter (where status = 'ACTIVE')`.as('active'),
        sql<string>`count(*) filter (where status = 'PROBATION')`.as('probation'),
        sql<string>`count(*) filter (where status = 'RESIGNED')`.as('resigned'),
        sql<string>`count(*) filter (where status = 'TERMINATED')`.as('terminated'),
      ])
      .executeTakeFirst();

    const empIds = rows.map((r) => r.employee_id);
    const userIds = rows.map((r) => r.user_id).filter(Boolean);

    let roleMap = new Map<string, Array<{ id: string; code: string; name: string }>>();
    if (userIds.length > 0) {
      const userRoles = await db
        .selectFrom('user_roles')
        .innerJoin('roles', 'roles.id', 'user_roles.role_id')
        .select([
          'user_roles.user_id',
          'roles.id as role_id',
          'roles.code as role_code',
          'roles.name as role_name',
        ])
        .where('user_roles.user_id', 'in', userIds as any)
        .execute();

      for (const ur of userRoles) {
        const uid = String(ur.user_id);
        if (!roleMap.has(uid)) roleMap.set(uid, []);
        roleMap.get(uid)!.push({
          id: String(ur.role_id),
          code: ur.role_code,
          name: ur.role_name,
        });
      }
    }

    let teamMap = new Map<
      string,
      { id: string; code: string; name: string; department: string; isLeader: boolean }
    >();
    if (empIds.length > 0) {
      const memberships = await db
        .selectFrom('team_memberships')
        .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
        .select([
          'team_memberships.employee_id',
          'team_memberships.is_leader',
          'teams.id as team_id',
          'teams.code as team_code',
          'teams.name as team_name',
          'teams.department',
        ])
        .where('team_memberships.employee_id', 'in', empIds as any)
        .where(sql`team_memberships.effective_range @> NOW()` as any)
        .execute();

      for (const m of memberships) {
        teamMap.set(String(m.employee_id), {
          id: String(m.team_id),
          code: m.team_code,
          name: m.team_name,
          department: m.department || '',
          isLeader: m.is_leader,
        });
      }
    }

    const data = rows.map((r) => {
      const uid = r.user_id ? String(r.user_id) : null;
      const eid = String(r.employee_id);

      return {
        id: eid,
        employee_code: r.employee_code,
        full_name: r.full_name,
        phone: r.phone || null,
        hire_date:
          r.hire_date instanceof Date
            ? `${r.hire_date.getFullYear()}-${String(r.hire_date.getMonth() + 1).padStart(2, '0')}-${String(r.hire_date.getDate()).padStart(2, '0')}`
            : r.hire_date
              ? String(r.hire_date)
              : null,
        status: r.employee_status,
        created_at: r.employee_created_at,
        position: r.pos_id
          ? {
              id: String(r.pos_id),
              code: r.pos_code,
              name: r.pos_name,
            }
          : null,
        user: uid
          ? {
              id: uid,
              username: r.username,
              email: r.email,
              status: r.user_status,
              must_change_password: r.must_change_password,
            }
          : null,
        roles: uid && roleMap.has(uid) ? roleMap.get(uid)! : [],
        currentTeam: teamMap.has(eid) ? teamMap.get(eid)! : null,
      };
    });

    return {
      data,
      meta: {
        page,
        limit,
        total,
      },
      summary: {
        total: Number(summaryRows?.total || 0),
        active: Number(summaryRows?.active || 0),
        probation: Number(summaryRows?.probation || 0),
        resigned: Number(summaryRows?.resigned || 0),
        terminated: Number(summaryRows?.terminated || 0),
      },
    };
  }

  // --------------------------------------------------
  // GET EMPLOYEE DETAIL BY ID
  // --------------------------------------------------
  async getEmployeeById(id: string | number) {
    const db = this.kysely.db;
    const emp = await db
      .selectFrom('employees')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .leftJoin('users', 'users.id', 'employees.user_id')
      .select([
        'employees.id as employee_id',
        'employees.employee_code',
        'employees.full_name',
        'employees.phone',
        'employees.hire_date',
        'employees.status as employee_status',
        'employees.created_at as employee_created_at',
        'positions.id as pos_id',
        'positions.code as pos_code',
        'positions.name as pos_name',
        'users.id as user_id',
        'users.username',
        'users.email',
        'users.status as user_status',
        'users.must_change_password',
        'users.created_at as user_created_at',
      ])
      .where('employees.id', '=', id as any)
      .executeTakeFirst();

    if (!emp) {
      throw new NotFoundException(`Employee #${id} not found`);
    }

    let roles: Array<{ id: string; code: string; name: string }> = [];
    if (emp.user_id) {
      const userRoles = await db
        .selectFrom('user_roles')
        .innerJoin('roles', 'roles.id', 'user_roles.role_id')
        .select(['roles.id', 'roles.code', 'roles.name'])
        .where('user_roles.user_id', '=', emp.user_id as any)
        .execute();
      roles = userRoles.map((r) => ({ id: String(r.id), code: r.code, name: r.name }));
    }

    const membership = await db
      .selectFrom('team_memberships')
      .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
      .select([
        'teams.id as team_id',
        'teams.code as team_code',
        'teams.name as team_name',
        'teams.department',
        'team_memberships.is_leader',
      ])
      .where('team_memberships.employee_id', '=', id as any)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .executeTakeFirst();

    const historyRows = await db
      .selectFrom('team_memberships')
      .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
      .select([
        'team_memberships.id as membership_id',
        'team_memberships.is_leader',
        sql`lower(team_memberships.effective_range)`.as('effective_from'),
        sql`upper(team_memberships.effective_range)`.as('effective_to'),
        sql`team_memberships.effective_range @> NOW()`.as('is_current'),
        'teams.id as team_id',
        'teams.code as team_code',
        'teams.name as team_name',
        'teams.department',
      ])
      .where('team_memberships.employee_id', '=', id as any)
      .orderBy(sql`lower(team_memberships.effective_range)`, 'desc')
      .execute();

    const teamHistory = historyRows.map((h: any) => ({
      membershipId: String(h.membership_id),
      teamId: String(h.team_id),
      teamCode: h.team_code,
      teamName: h.team_name,
      department: h.department,
      isLeader: h.is_leader,
      effectiveFrom: h.effective_from ? new Date(h.effective_from).toISOString() : null,
      effectiveTo: h.effective_to ? new Date(h.effective_to).toISOString() : null,
      isCurrent: Boolean(h.is_current),
    }));

    return {
      employee: {
        id: String(emp.employee_id),
        employee_code: emp.employee_code,
        full_name: emp.full_name,
        phone: emp.phone || null,
        hire_date:
          emp.hire_date instanceof Date
            ? `${emp.hire_date.getFullYear()}-${String(emp.hire_date.getMonth() + 1).padStart(2, '0')}-${String(emp.hire_date.getDate()).padStart(2, '0')}`
            : emp.hire_date
              ? String(emp.hire_date)
              : null,
        status: emp.employee_status,
        created_at: emp.employee_created_at,
      },
      account: emp.user_id
        ? {
            user_id: String(emp.user_id),
            username: emp.username,
            email: emp.email,
            user_status: emp.user_status,
            must_change_password: emp.must_change_password,
            created_at: emp.user_created_at,
          }
        : null,
      position: emp.pos_id
        ? {
            id: String(emp.pos_id),
            code: emp.pos_code,
            name: emp.pos_name,
          }
        : null,
      roles,
      currentTeam: membership
        ? {
            id: String(membership.team_id),
            code: membership.team_code,
            name: membership.team_name,
            department: membership.department,
            isLeader: membership.is_leader,
          }
        : null,
      teamHistory,
    };
  }
}

