import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { CreateTeamDto, TeamDepartment } from './dto/create-team.dto';
import { AssignMemberDto } from './dto/assign-member.dto';
import { MoveMemberDto } from './dto/move-member.dto';
import { ChangeLeaderDto } from './dto/change-leader.dto';
import { JwtPayload } from '../auth/guards/jwt-auth.guard';

export interface TeamRecentProjectItem {
  id: string | number;
  project_name: string;
  status: string;
  materialized_progress_percent: number | string;
  created_at: Date | string;
  order_code: string;
  company_name: string;
  service_name: string;
  primaryAssignees: string[];
  supportAssignees: string[];
}

@Injectable()
export class TeamsService {
  constructor(private readonly kysely: KyselyService) {}

  // -------------------------------------------------------------
  // OBJECT AUTHORIZATION HELPER
  // -------------------------------------------------------------
  private async verifyTeamAccess(teamId: string | number, user: JwtPayload): Promise<void> {
    const roles = user.roles || [];
    if (roles.includes('ADMIN') || roles.includes('BOSS')) {
      return; // Global access
    }

    if (!user.employeeId) {
      throw new ForbiddenException('Bạn không có quyền truy cập nhóm làm việc này');
    }

    // Check if user is currently active leader of this team
    const ledTeam = await this.kysely.db
      .selectFrom('team_memberships')
      .select('team_id')
      .where('employee_id', '=', user.employeeId as any)
      .where('team_id', '=', teamId as any)
      .where('is_leader', '=', true)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirst();

    if (!ledTeam) {
      throw new ForbiddenException('Trưởng nhóm chỉ có quyền xem dữ liệu của nhóm mình phụ trách');
    }
  }

  // -------------------------------------------------------------
  // CANONICAL WORKSPACE HELPERS
  // -------------------------------------------------------------
  async getCurrentLedTeam(employeeId: string | number) {
    return await this.kysely.db
      .selectFrom('team_memberships')
      .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
      .selectAll('teams')
      .where('team_memberships.employee_id', '=', employeeId as any)
      .where('team_memberships.is_leader', '=', true)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .executeTakeFirst();
  }

  async getCurrentTeamMembers(teamId: string | number) {
    return await this.kysely.db
      .selectFrom('team_memberships')
      .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .selectAll('employees')
      .select([
        'team_memberships.id as membership_id',
        'team_memberships.is_leader',
        'team_memberships.effective_range',
        'positions.name as position_name',
      ])
      .where('team_memberships.team_id', '=', teamId as any)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .execute();
  }

  // -------------------------------------------------------------
  // GET TEAMS LIST
  // -------------------------------------------------------------
  async getTeams(query: { department?: string; search?: string }, user: JwtPayload) {
    const db = this.kysely.db;
    const roles = user.roles || [];
    const isGlobal = roles.includes('ADMIN') || roles.includes('BOSS');

    let baseQuery = db.selectFrom('teams');

    // Scoped access for team leaders
    if (!isGlobal) {
      if (!user.employeeId) {
        return { data: [], total: 0 };
      }
      baseQuery = baseQuery.where((eb) =>
        eb.exists(
          db
            .selectFrom('team_memberships')
            .select('team_memberships.id')
            .whereRef('team_memberships.team_id', '=', 'teams.id')
            .where('team_memberships.employee_id', '=', user.employeeId as any)
            .where('team_memberships.is_leader', '=', true)
            .where(sql`team_memberships.effective_range @> NOW()` as any),
        ),
      );
    }

    if (query.department && query.department.trim()) {
      baseQuery = baseQuery.where('teams.department', '=', query.department.trim().toUpperCase());
    }

    if (query.search && query.search.trim()) {
      const term = `%${query.search.trim()}%`;
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb('teams.name', 'ilike', term),
          eb('teams.code', 'ilike', term),
          eb('teams.description', 'ilike', term),
        ]),
      );
    }

    const rows = await baseQuery
      .selectAll('teams')
      .orderBy('teams.id', 'desc')
      .execute();

    if (rows.length === 0) {
      return { data: [], total: 0 };
    }

    const teamIds = rows.map((r) => r.id);

    // Fetch active leaders
    const leaders = await db
      .selectFrom('team_memberships')
      .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
      .select([
        'team_memberships.team_id',
        'employees.id as leader_id',
        'employees.employee_code as leader_code',
        'employees.full_name as leader_name',
      ])
      .where('team_memberships.team_id', 'in', teamIds as any)
      .where('team_memberships.is_leader', '=', true)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .execute();

    const leaderMap = new Map<string, { id: string; employeeCode: string; fullName: string }>();
    for (const l of leaders) {
      leaderMap.set(String(l.team_id), {
        id: String(l.leader_id),
        employeeCode: l.leader_code,
        fullName: l.leader_name,
      });
    }

    // Fetch active member counts
    const counts = await db
      .selectFrom('team_memberships')
      .select([
        'team_id',
        sql<string>`count(id)`.as('member_count'),
      ])
      .where('team_id', 'in', teamIds as any)
      .where(sql`effective_range @> NOW()` as any)
      .groupBy('team_id')
      .execute();

    const countMap = new Map<string, number>();
    for (const c of counts) {
      countMap.set(String(c.team_id), Number(c.member_count || 0));
    }

    const data = rows.map((team) => {
      const tid = String(team.id);
      return {
        id: tid,
        code: team.code,
        name: team.name,
        department: team.department,
        description: team.description,
        createdAt: team.created_at,
        currentLeader: leaderMap.get(tid) || null,
        activeMemberCount: countMap.get(tid) || 0,
      };
    });

    return { data, total: data.length };
  }

  // -------------------------------------------------------------
  // GET TEAM BY ID (DETAIL)
  // -------------------------------------------------------------
  async getTeamById(id: string | number, user: JwtPayload) {
    await this.verifyTeamAccess(id, user);

    const db = this.kysely.db;
    const team = await db
      .selectFrom('teams')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!team) {
      throw new NotFoundException(`Nhóm làm việc #${id} không tồn tại`);
    }

    // Get current leader
    const leader = await db
      .selectFrom('team_memberships')
      .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .select([
        'employees.id as leader_id',
        'employees.employee_code as leader_code',
        'employees.full_name as leader_name',
        'positions.code as leader_position_code',
        'positions.name as leader_position_name',
      ])
      .where('team_memberships.team_id', '=', id as any)
      .where('team_memberships.is_leader', '=', true)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .executeTakeFirst();

    // Get counts
    const activeCountRow = await db
      .selectFrom('team_memberships')
      .select(sql<string>`count(id)`.as('active_count'))
      .where('team_id', '=', id as any)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirst();

    const totalHistoricalCountRow = await db
      .selectFrom('team_memberships')
      .select(sql<string>`count(distinct employee_id)`.as('total_count'))
      .where('team_id', '=', id as any)
      .executeTakeFirst();

    return {
      id: String(team.id),
      code: team.code,
      name: team.name,
      department: team.department,
      description: team.description,
      createdAt: team.created_at,
      currentLeader: leader
        ? {
            id: String(leader.leader_id),
            employeeCode: leader.leader_code,
            fullName: leader.leader_name,
            positionCode: leader.leader_position_code,
            positionName: leader.leader_position_name,
          }
        : null,
      activeMemberCount: Number(activeCountRow?.active_count || 0),
      totalHistoricalMemberCount: Number(totalHistoricalCountRow?.total_count || 0),
    };
  }

  // -------------------------------------------------------------
  // GET TEAM MEMBERS (ACTIVE)
  // -------------------------------------------------------------
  async getTeamMembers(teamId: string | number, user: JwtPayload) {
    await this.verifyTeamAccess(teamId, user);

    const db = this.kysely.db;
    const members = await db
      .selectFrom('team_memberships')
      .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .leftJoin('users', 'users.id', 'employees.user_id')
      .select([
        'team_memberships.id as membership_id',
        'team_memberships.is_leader',
        sql<string>`lower(team_memberships.effective_range)`.as('joined_at'),
        'employees.id as employee_id',
        'employees.employee_code',
        'employees.full_name',
        'employees.phone',
        'employees.status as employee_status',
        'positions.code as position_code',
        'positions.name as position_name',
        'users.id as user_id',
      ])
      .where('team_memberships.team_id', '=', teamId as any)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .orderBy('team_memberships.is_leader', 'desc')
      .orderBy('employees.full_name', 'asc')
      .execute();

    // Fetch roles for users
    const userIds = members.map((m) => m.user_id).filter(Boolean);
    const roleMap = new Map<string, string[]>();
    if (userIds.length > 0) {
      const userRoles = await db
        .selectFrom('user_roles')
        .innerJoin('roles', 'roles.id', 'user_roles.role_id')
        .select(['user_roles.user_id', 'roles.code'])
        .where('user_roles.user_id', 'in', userIds as any)
        .execute();
      for (const ur of userRoles) {
        const uid = String(ur.user_id);
        if (!roleMap.has(uid)) roleMap.set(uid, []);
        roleMap.get(uid)!.push(ur.code);
      }
    }

    return members.map((m) => ({
      membershipId: String(m.membership_id),
      employeeId: String(m.employee_id),
      employeeCode: m.employee_code,
      fullName: m.full_name,
      phone: m.phone,
      status: m.employee_status,
      positionCode: m.position_code,
      positionName: m.position_name,
      roles: m.user_id ? roleMap.get(String(m.user_id)) || [] : [],
      isLeader: m.is_leader,
      joinedAt: m.joined_at,
    }));
  }

  // -------------------------------------------------------------
  // GET TEAM HISTORY (CHRONOLOGICAL TEMPORAL HISTORY)
  // -------------------------------------------------------------
  async getTeamHistory(teamId: string | number, user: JwtPayload) {
    await this.verifyTeamAccess(teamId, user);

    const db = this.kysely.db;
    const history = await db
      .selectFrom('team_memberships')
      .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .select([
        'team_memberships.id as membership_id',
        'team_memberships.is_leader',
        sql<string>`lower(team_memberships.effective_range)`.as('effective_from'),
        sql<string>`upper(team_memberships.effective_range)`.as('effective_to'),
        sql<boolean>`team_memberships.effective_range @> NOW()`.as('is_current'),
        'employees.id as employee_id',
        'employees.employee_code',
        'employees.full_name',
        'positions.name as position_name',
        'positions.code as position_code',
      ])
      .where('team_memberships.team_id', '=', teamId as any)
      .orderBy('team_memberships.id', 'desc')
      .execute();

    return history.map((h) => ({
      membershipId: String(h.membership_id),
      employeeId: String(h.employee_id),
      employeeCode: h.employee_code,
      fullName: h.full_name,
      positionName: h.position_name,
      positionCode: h.position_code,
      isLeader: h.is_leader,
      effectiveFrom: h.effective_from,
      effectiveTo: h.effective_to,
      isCurrent: h.is_current,
    }));
  }

  // -------------------------------------------------------------
  // GENERATE NEXT TEAM CODE
  // -------------------------------------------------------------
  async generateNextTeamCode(department: TeamDepartment, trx?: any): Promise<string> {
    const executor = trx || this.kysely.db;
    const prefix = `${department}_`;
    const regexPattern = `^${prefix}[0-9]+$`;
    const substringPattern = `^${prefix}([0-9]+)$`;

    const row = await executor
      .selectFrom('teams')
      .select(
        sql<number>`COALESCE(MAX(CAST(SUBSTRING(code FROM ${substringPattern}) AS INTEGER)), 0)`.as('max_seq'),
      )
      .where(sql`code ~ ${regexPattern}` as any)
      .executeTakeFirst();

    let nextSeq = Number(row?.max_seq || 0) + 1;
    let candidateCode = `${prefix}${String(nextSeq).padStart(2, '0')}`;

    // Safety fallback: ensure candidate code is unique
    while (true) {
      const existing = await executor
        .selectFrom('teams')
        .select('id')
        .where('code', '=', candidateCode)
        .executeTakeFirst();
      if (!existing) {
        break;
      }
      nextSeq++;
      candidateCode = `${prefix}${String(nextSeq).padStart(2, '0')}`;
    }

    return candidateCode;
  }

  // -------------------------------------------------------------
  // CREATE TEAM
  // -------------------------------------------------------------
  async createTeam(
    dto: CreateTeamDto,
    actorEmployeeId: string | number,
    options?: { forceAutoCode?: boolean },
  ) {
    const db = this.kysely.db;
    const shouldAutoGenerate = options?.forceAutoCode || !dto.code || !dto.code.trim();

    return await db.transaction().execute(async (trx) => {
      let finalCode = '';

      if (shouldAutoGenerate) {
        // Concurrency advisory lock per department: serializes concurrent code generation
        await sql`SELECT pg_advisory_xact_lock(hashtext('teams_code_' || ${dto.department})::bigint)`.execute(trx);
        finalCode = await this.generateNextTeamCode(dto.department, trx);
      } else {
        finalCode = dto.code!.trim().toUpperCase();
        // Check duplicate code
        const existing = await trx
          .selectFrom('teams')
          .select('id')
          .where('code', '=', finalCode)
          .executeTakeFirst();

        if (existing) {
          throw new ConflictException(`Mã nhóm làm việc '${finalCode}' đã tồn tại`);
        }
      }

      // Final uniqueness validation
      const existingConflict = await trx
        .selectFrom('teams')
        .select('id')
        .where('code', '=', finalCode)
        .executeTakeFirst();

      if (existingConflict) {
        throw new ConflictException(`Mã nhóm làm việc '${finalCode}' đã tồn tại`);
      }

      const [team] = await trx
        .insertInto('teams')
        .values({
          name: dto.name.trim(),
          code: finalCode,
          department: dto.department,
          description: dto.description ? dto.description.trim() : null,
        })
        .returningAll()
        .execute();

      // Audit log
      await trx
        .insertInto('audit_logs')
        .values({
          action: 'TEAM_CREATE',
          entity_type: 'TEAM',
          entity_id: team.id,
          actor_employee_id: actorEmployeeId as any,
          payload_before_sanitized: null,
          payload_after_sanitized: JSON.stringify({
            name: team.name,
            code: team.code,
            department: team.department,
          }),
        })
        .execute();

      return {
        id: String(team.id),
        code: team.code,
        name: team.name,
        department: team.department,
        description: team.description,
        createdAt: team.created_at,
      };
    });
  }

  // -------------------------------------------------------------
  // ASSIGN MEMBER
  // -------------------------------------------------------------
  async assignMember(
    teamId: string | number,
    dto: AssignMemberDto,
    actorEmployeeId: string | number,
  ) {
    const db = this.kysely.db;

    return await db.transaction().execute(async (trx) => {
      // 1. Lock team record
      const team = await trx
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', teamId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!team) {
        throw new NotFoundException(`Nhóm làm việc #${teamId} không tồn tại`);
      }

      // 2. Fetch employee details
      const emp = await trx
        .selectFrom('employees')
        .selectAll()
        .where('employees.id', '=', dto.employeeId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!emp) {
        throw new NotFoundException(`Nhân viên #${dto.employeeId} không tồn tại`);
      }

      let positionCode: string | null = null;
      if (emp.position_id) {
        const pos = await trx
          .selectFrom('positions')
          .select('code')
          .where('id', '=', emp.position_id as any)
          .executeTakeFirst();
        positionCode = pos?.code || null;
      }

      if (emp.status === 'RESIGNED' || emp.status === 'TERMINATED') {
        throw new BadRequestException('Nhân viên đã nghỉ việc, không thể phân bổ vào nhóm');
      }

      // 3. Department compatibility validation
      const teamDept = team.department ? team.department.toUpperCase() : '';
      const posCode = positionCode || '';

      if (teamDept === 'SALES' && !posCode.startsWith('SALE')) {
        throw new BadRequestException(
          `Chức vụ [${posCode}] không thuộc phòng ban [SALES] của nhóm`,
        );
      }
      if (teamDept === 'DEV' && !posCode.startsWith('DEV')) {
        throw new BadRequestException(
          `Chức vụ [${posCode}] không thuộc phòng ban [DEV] của nhóm`,
        );
      }
      if (teamDept === 'SEO' && !posCode.startsWith('SEO')) {
        throw new BadRequestException(
          `Chức vụ [${posCode}] không thuộc phòng ban [SEO] của nhóm`,
        );
      }

      // 4. Leader eligibility check
      const isLeader = dto.isLeader === true;
      if (isLeader) {
        if (teamDept === 'SALES' && posCode !== 'SALES_TEAM_LEADER') {
          throw new BadRequestException(
            `Chỉ chức vụ [SALES_TEAM_LEADER] mới có thể làm Trưởng nhóm kinh doanh`,
          );
        }
        if (teamDept === 'DEV' && posCode !== 'DEV_TEAM_LEADER') {
          throw new BadRequestException(
            `Chỉ chức vụ [DEV_TEAM_LEADER] mới có thể làm Trưởng nhóm kỹ thuật / DEV`,
          );
        }
        if (teamDept === 'SEO' && posCode !== 'SEO_TEAM_LEADER') {
          throw new BadRequestException(
            `Chỉ chức vụ [SEO_TEAM_LEADER] mới có thể làm Trưởng nhóm SEO`,
          );
        }

        // Check active leader in team
        const activeLeader = await trx
          .selectFrom('team_memberships')
          .select('id')
          .where('team_id', '=', teamId as any)
          .where('is_leader', '=', true)
          .where(sql`effective_range @> NOW()` as any)
          .executeTakeFirst();

        if (activeLeader) {
          throw new BadRequestException(
            `Nhóm #${teamId} (${team.name}) hiện đã có Trưởng nhóm đang hoạt động`,
          );
        }
      }

      // 5. Check if employee already has active membership in ANY team
      const existingMembership = await trx
        .selectFrom('team_memberships')
        .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
        .select(['team_memberships.id', 'teams.name as team_name', 'teams.id as current_team_id'])
        .where('team_memberships.employee_id', '=', dto.employeeId as any)
        .where(sql`team_memberships.effective_range @> NOW()` as any)
        .executeTakeFirst();

      if (existingMembership) {
        throw new BadRequestException(
          `Nhân viên ${emp.full_name} hiện đang là thành viên của nhóm [${existingMembership.team_name}]. Hãy sử dụng thao tác 'Chuyển nhóm' (move-member).`,
        );
      }

      // 6. Insert new membership: [NOW(), infinity)
      const [membership] = await trx
        .insertInto('team_memberships')
        .values({
          team_id: team.id,
          employee_id: emp.id,
          is_leader: isLeader,
          effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
        })
        .returningAll()
        .execute();

      // 7. Audit log
      await trx
        .insertInto('audit_logs')
        .values({
          action: 'TEAM_MEMBER_ASSIGN',
          entity_type: 'TEAM_MEMBERSHIP',
          entity_id: membership.id,
          actor_employee_id: actorEmployeeId as any,
          payload_before_sanitized: null,
          payload_after_sanitized: JSON.stringify({
            teamId: team.id,
            teamName: team.name,
            employeeId: emp.id,
            fullName: emp.full_name,
            isLeader,
          }),
        })
        .execute();

      return {
        membershipId: String(membership.id),
        teamId: String(team.id),
        employeeId: String(emp.id),
        isLeader,
        message: 'Phân bổ nhân viên vào nhóm thành công',
      };
    });
  }

  // -------------------------------------------------------------
  // MOVE MEMBER BETWEEN TEAMS (TEMPORAL RANGE CLOSE & OPEN)
  // -------------------------------------------------------------
  async moveMember(
    sourceTeamId: string | number,
    dto: MoveMemberDto,
    actorEmployeeId: string | number,
  ) {
    const db = this.kysely.db;

    return await db.transaction().execute(async (trx) => {
      // 1. Lock source & target teams
      const sourceTeam = await trx
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', sourceTeamId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!sourceTeam) {
        throw new NotFoundException(`Nhóm nguồn #${sourceTeamId} không tồn tại`);
      }

      const targetTeam = await trx
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', dto.targetTeamId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!targetTeam) {
        throw new NotFoundException(`Nhóm đích #${dto.targetTeamId} không tồn tại`);
      }

      if (String(sourceTeam.id) === String(targetTeam.id)) {
        throw new BadRequestException('Nhóm nguồn và nhóm đích phải khác nhau');
      }

      // Department check
      if (sourceTeam.department !== targetTeam.department) {
        throw new BadRequestException(
          `Không thể chuyển nhân viên giữa 2 phòng ban khác nhau ([${sourceTeam.department}] -> [${targetTeam.department}])`,
        );
      }

      // 2. Lock current active membership of employee
      const currentMembership = await trx
        .selectFrom('team_memberships')
        .selectAll()
        .where('employee_id', '=', dto.employeeId as any)
        .where('team_id', '=', sourceTeamId as any)
        .where(sql`effective_range @> NOW()` as any)
        .forUpdate()
        .executeTakeFirst();

      if (!currentMembership) {
        throw new BadRequestException(
          `Nhân viên #${dto.employeeId} hiện không có tư cách thành viên hoạt động tại nhóm nguồn #${sourceTeamId}`,
        );
      }

      // 3. Close old membership range at NOW()
      // effective_range = tstzrange(lower(effective_range), NOW(), '[)')
      await trx
        .updateTable('team_memberships')
        .set({
          effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
        })
        .where('id', '=', currentMembership.id)
        .execute();

      // 4. Insert new membership into target team: [NOW(), NULL)
      // When moved, member enters as standard member (is_leader = false)
      const [newMembership] = await trx
        .insertInto('team_memberships')
        .values({
          team_id: targetTeam.id,
          employee_id: dto.employeeId as any,
          is_leader: false,
          effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
        })
        .returningAll()
        .execute();

      // 5. Audit log
      await trx
        .insertInto('audit_logs')
        .values({
          action: 'TEAM_MEMBER_MOVE',
          entity_type: 'TEAM_MEMBERSHIP',
          entity_id: newMembership.id,
          actor_employee_id: actorEmployeeId as any,
          payload_before_sanitized: JSON.stringify({
            sourceTeamId: sourceTeam.id,
            membershipId: currentMembership.id,
          }),
          payload_after_sanitized: JSON.stringify({
            targetTeamId: targetTeam.id,
            employeeId: dto.employeeId,
            newMembershipId: newMembership.id,
          }),
        })
        .execute();

      return {
        message: 'Chuyển nhóm làm việc thành công',
        oldMembershipId: String(currentMembership.id),
        newMembershipId: String(newMembership.id),
        sourceTeamId: String(sourceTeam.id),
        targetTeamId: String(targetTeam.id),
      };
    });
  }

  // -------------------------------------------------------------
  // CHANGE TEAM LEADER (TEMPORAL CLOSE OLD LEADER & PROMOTE NEW)
  // -------------------------------------------------------------
  async changeLeader(
    teamId: string | number,
    dto: ChangeLeaderDto,
    actorEmployeeId: string | number,
  ) {
    const db = this.kysely.db;

    return await db.transaction().execute(async (trx) => {
      // 1. Lock Team
      const team = await trx
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', teamId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!team) {
        throw new NotFoundException(`Nhóm làm việc #${teamId} không tồn tại`);
      }

      // 2. Validate candidate
      // 2. Lock candidate record
      const candidate = await trx
        .selectFrom('employees')
        .selectAll()
        .where('employees.id', '=', dto.newLeaderEmployeeId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!candidate) {
        throw new NotFoundException(`Nhân viên #${dto.newLeaderEmployeeId} không tồn tại`);
      }

      let candidatePositionCode: string | null = null;
      if (candidate.position_id) {
        const pos = await trx
          .selectFrom('positions')
          .select('code')
          .where('id', '=', candidate.position_id as any)
          .executeTakeFirst();
        candidatePositionCode = pos?.code || null;
      }

      if (candidate.status === 'RESIGNED' || candidate.status === 'TERMINATED') {
        throw new BadRequestException('Nhân viên đã nghỉ việc, không thể làm Trưởng nhóm');
      }

      // Eligibility
      const teamDept = team.department ? team.department.toUpperCase() : '';
      const posCode = candidatePositionCode || '';

      if (teamDept === 'SALES' && posCode !== 'SALES_TEAM_LEADER') {
        throw new BadRequestException(
          `Chỉ chức vụ [SALES_TEAM_LEADER] mới có thể làm Trưởng nhóm kinh doanh`,
        );
      }
      if (teamDept === 'DEV' && posCode !== 'DEV_TEAM_LEADER') {
        throw new BadRequestException(
          `Chỉ chức vụ [DEV_TEAM_LEADER] mới có thể làm Trưởng nhóm kỹ thuật / DEV`,
        );
      }
      if (teamDept === 'SEO' && posCode !== 'SEO_TEAM_LEADER') {
        throw new BadRequestException(
          `Chỉ chức vụ [SEO_TEAM_LEADER] mới có thể làm Trưởng nhóm SEO`,
        );
      }

      // 3. Find current active leader (if any)
      const currentLeaderMembership = await trx
        .selectFrom('team_memberships')
        .selectAll()
        .where('team_id', '=', teamId as any)
        .where('is_leader', '=', true)
        .where(sql`effective_range @> NOW()` as any)
        .forUpdate()
        .executeTakeFirst();

      if (
        currentLeaderMembership &&
        String(currentLeaderMembership.employee_id) === String(candidate.id)
      ) {
        throw new BadRequestException('Nhân viên này hiện tại đã là Trưởng nhóm của nhóm');
      }

      // 4. Close current leader membership range at NOW()
      if (currentLeaderMembership) {
        await trx
          .updateTable('team_memberships')
          .set({
            effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
          })
          .where('id', '=', currentLeaderMembership.id)
          .execute();
      }

      // 5. Check candidate active membership
      const candidateActiveMembership = await trx
        .selectFrom('team_memberships')
        .selectAll()
        .where('employee_id', '=', candidate.id)
        .where(sql`effective_range @> NOW()` as any)
        .forUpdate()
        .executeTakeFirst();

      if (candidateActiveMembership) {
        if (String(candidateActiveMembership.team_id) !== String(teamId)) {
          throw new BadRequestException(
            `Nhân viên ${candidate.full_name} hiện đang ở nhóm khác. Vui lòng chuyển nhân viên sang nhóm này trước khi bổ nhiệm làm Trưởng nhóm.`,
          );
        } else {
          // Candidate is currently a standard member in this team -> close membership range at NOW()
          await trx
            .updateTable('team_memberships')
            .set({
              effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
            })
            .where('id', '=', candidateActiveMembership.id)
            .execute();
        }
      }

      // 6. Insert new Leader membership: [NOW(), NULL) with is_leader = true
      const [newLeaderMembership] = await trx
        .insertInto('team_memberships')
        .values({
          team_id: team.id,
          employee_id: candidate.id,
          is_leader: true,
          effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
        })
        .returningAll()
        .execute();

      // 7. Audit log
      await trx
        .insertInto('audit_logs')
        .values({
          action: 'TEAM_LEADER_CHANGE',
          entity_type: 'TEAM_MEMBERSHIP',
          entity_id: newLeaderMembership.id,
          actor_employee_id: actorEmployeeId as any,
          payload_before_sanitized: JSON.stringify({
            teamId: team.id,
            previousLeaderEmployeeId: currentLeaderMembership?.employee_id || null,
          }),
          payload_after_sanitized: JSON.stringify({
            teamId: team.id,
            newLeaderEmployeeId: candidate.id,
          }),
        })
        .execute();

      return {
        message: 'Thay đổi Trưởng nhóm thành công',
        teamId: String(team.id),
        newLeaderEmployeeId: String(candidate.id),
        newLeaderMembershipId: String(newLeaderMembership.id),
      };
    });
  }

  // -------------------------------------------------------------
  // SALES WORKSPACE AGGREGATE SUMMARY (REAL DATABASE TOTALS)
  // -------------------------------------------------------------
  async getSalesWorkspaceSummary(user: JwtPayload, periodParam?: string) {
    const db = this.kysely.db;
    const roles = user.roles || [];
    const isGlobal = roles.includes('ADMIN') || roles.includes('BOSS');

    // 1. Resolve Team
    let team: any;
    if (isGlobal) {
      team = await db
        .selectFrom('teams')
        .selectAll()
        .where('department', '=', 'SALES')
        .orderBy('created_at', 'asc')
        .executeTakeFirst();
    } else {
      if (!user.employeeId) {
        throw new ForbiddenException('Bạn không có quyền truy cập Sales Workspace');
      }
      team = await this.getCurrentLedTeam(user.employeeId);
    }

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm Sales nào bạn đang phụ trách');
    }

    // 2. Resolve Current Members
    const members = await this.getCurrentTeamMembers(team.id);
    const memberIds = members.map((m: any) => String(m.id));

    // Target Period (e.g. "2026-09")
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam || currentPeriod;

    if (memberIds.length === 0) {
      return {
        team: {
          id: String(team.id),
          name: team.name,
          code: team.code,
          department: team.department,
        },
        period,
        metrics: {
          totalLeads: 0,
          openDealsCount: 0,
          wonDealsCount: 0,
          wonRevenue: 0,
          totalCommission: 0,
        },
        members: [],
      };
    }

    // 3. Real Total Leads (DB COUNT)
    const leadsRes = await db
      .selectFrom('leads')
      .select(sql<number>`count(id)`.as('total'))
      .where('assigned_sale_id', 'in', memberIds as any)
      .executeTakeFirst();
    const totalLeads = Number(leadsRes?.total || 0);

    // 4. Real Open Deals (DB COUNT)
    const openDealsRes = await db
      .selectFrom('deals')
      .select(sql<number>`count(id)`.as('total'))
      .where('assigned_sale_id', 'in', memberIds as any)
      .where('status', 'in', ['OPEN', 'NEGOTIATING'])
      .executeTakeFirst();
    const openDealsCount = Number(openDealsRes?.total || 0);

    // 5. Real Won Deals in Target Period (DB COUNT & SUM)
    const wonDealsRes = await db
      .selectFrom('deals')
      .select([
        sql<number>`count(id)`.as('won_count'),
        sql<number>`coalesce(sum(expected_value), 0)`.as('won_revenue'),
      ])
      .where('assigned_sale_id', 'in', memberIds as any)
      .where('status', '=', 'WON')
      .where(sql`to_char(won_at, 'YYYY-MM') = ${period}` as any)
      .executeTakeFirst();
    const wonDealsCount = Number(wonDealsRes?.won_count || 0);
    const wonRevenue = Number(wonDealsRes?.won_revenue || 0);

    // 6. Real Commissions in Target Period (DB SUM)
    const commRes = await db
      .selectFrom('commissions')
      .select(sql<number>`coalesce(sum(calculated_amount), 0)`.as('total'))
      .where('beneficiary_employee_id', 'in', memberIds as any)
      .where('status', 'in', ['CALCULATED', 'APPROVED', 'ADJUSTED', 'IN_PAYROLL', 'PAID', 'RELEASED'])
      .executeTakeFirst();
    const totalCommission = Number(commRes?.total || 0);

    // 7. Member-level aggregate counts (GROUP BY)
    const memberLeadsCounts = await db
      .selectFrom('leads')
      .select(['assigned_sale_id', sql<number>`count(id)`.as('count')])
      .where('assigned_sale_id', 'in', memberIds as any)
      .groupBy('assigned_sale_id')
      .execute();
    const leadsMap = new Map<string, number>();
    for (const row of memberLeadsCounts) {
      if (row.assigned_sale_id) {
        leadsMap.set(String(row.assigned_sale_id), Number(row.count));
      }
    }

    const memberDealsCounts = await db
      .selectFrom('deals')
      .select(['assigned_sale_id', sql<number>`count(id)`.as('count')])
      .where('assigned_sale_id', 'in', memberIds as any)
      .groupBy('assigned_sale_id')
      .execute();
    const dealsMap = new Map<string, number>();
    for (const row of memberDealsCounts) {
      if (row.assigned_sale_id) {
        dealsMap.set(String(row.assigned_sale_id), Number(row.count));
      }
    }

    const memberWonCounts = await db
      .selectFrom('deals')
      .select([
        'assigned_sale_id',
        sql<number>`count(id)`.as('count'),
        sql<number>`coalesce(sum(expected_value), 0)`.as('revenue'),
      ])
      .where('assigned_sale_id', 'in', memberIds as any)
      .where('status', '=', 'WON')
      .where(sql`to_char(won_at, 'YYYY-MM') = ${period}` as any)
      .groupBy('assigned_sale_id')
      .execute();
    const wonMap = new Map<string, { count: number; revenue: number }>();
    for (const row of memberWonCounts) {
      if (row.assigned_sale_id) {
        wonMap.set(String(row.assigned_sale_id), {
          count: Number(row.count),
          revenue: Number(row.revenue),
        });
      }
    }

    const membersSummary = members.map((m: any) => {
      const empId = String(m.id);
      const won = wonMap.get(empId) || { count: 0, revenue: 0 };
      return {
        employeeId: empId,
        employeeCode: m.employee_code,
        fullName: m.full_name,
        positionName: m.position_name || null,
        isLeader: Boolean(m.is_leader),
        leadsCount: leadsMap.get(empId) || 0,
        dealsCount: dealsMap.get(empId) || 0,
        wonDealsCount: won.count,
        wonRevenue: won.revenue,
      };
    });

    return {
      team: {
        id: String(team.id),
        name: team.name,
        code: team.code,
        department: team.department,
      },
      period,
      metrics: {
        totalLeads,
        openDealsCount,
        wonDealsCount,
        wonRevenue,
        totalCommission,
      },
      members: membersSummary,
    };
  }

  // -------------------------------------------------------------
  // GET DEV WORKSPACE SUMMARY
  // -------------------------------------------------------------
  async getDevWorkspaceSummary(user: JwtPayload, periodParam?: string) {
    const db = this.kysely.db;
    const roles = user.roles || [];
    const isGlobal = roles.includes('ADMIN') || roles.includes('BOSS');

    let team: any = null;

    if (isGlobal) {
      team = await db
        .selectFrom('teams')
        .selectAll()
        .where('department', '=', 'DEV')
        .orderBy('created_at', 'asc')
        .executeTakeFirst();
    } else {
      if (!user.employeeId) {
        throw new ForbiddenException('User missing employee ID');
      }
      team = await this.getCurrentLedTeam(user.employeeId);
    }

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm Kỹ thuật (DEV) nào bạn đang phụ trách');
    }

    // 2. Resolve Current Members
    const members = await this.getCurrentTeamMembers(team.id);
    const memberIds = members.map((m: any) => String(m.id));

    // Target Period (e.g. "2026-09")
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam || currentPeriod;

    if (memberIds.length === 0) {
      return {
        team: {
          id: String(team.id),
          name: team.name,
          code: team.code,
          department: team.department,
        },
        period,
        metrics: {
          totalProjects: 0,
          activeProjectsCount: 0,
          blockedProjectsCount: 0,
          completedProjectsCount: 0,
          reviewAcceptanceCount: 0,
          totalAcceptances: 0,
          totalKpiPoints: 0,
        },
        tasksSummary: {
          todo: 0,
          inProgress: 0,
          blocked: 0,
          done: 0,
          total: 0,
        },
        members: [],
        recentProjects: [],
      };
    }

    // 3. Subquery / Join for Projects of current members
    // Projects where member has an active assignment
    const teamProjectsQuery = db
      .selectFrom('projects as p')
      .innerJoin('project_assignments as pa', 'pa.project_id', 'p.id')
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true);

    const teamProjectRows = await teamProjectsQuery
      .select(sql<string>`distinct p.id`.as('project_id'))
      .execute();
    const teamProjectIds = teamProjectRows.map((r) => String(r.project_id));

    let totalProjects = 0;
    let activeProjectsCount = 0;
    let blockedProjectsCount = 0;
    let completedProjectsCount = 0;
    let reviewAcceptanceCount = 0;
    let totalAcceptances = 0;

    if (teamProjectIds.length > 0) {
      const projectStatusCounts = await db
        .selectFrom('projects as p')
        .select(['p.status', sql<number>`count(p.id)`.as('count')])
        .where('p.id', 'in', teamProjectIds as any)
        .groupBy('p.status')
        .execute();

      for (const row of projectStatusCounts) {
        const count = Number(row.count);
        totalProjects += count;
        if (['ASSIGNED', 'READY_TO_START', 'IN_PROGRESS'].includes(row.status)) {
          activeProjectsCount += count;
        } else if (
          ['BLOCKED', 'WAITING_CUSTOMER', 'WAITING_SALE', 'WAITING_INTERNAL'].includes(row.status)
        ) {
          blockedProjectsCount += count;
        } else if (['REVIEW', 'ACCEPTANCE'].includes(row.status)) {
          reviewAcceptanceCount += count;
        } else if (row.status === 'COMPLETED') {
          completedProjectsCount += count;
        }
      }

      const acceptancesRes = await db
        .selectFrom('project_acceptances')
        .select(sql<number>`count(id)`.as('total'))
        .where('project_id', 'in', teamProjectIds as any)
        .executeTakeFirst();
      totalAcceptances = Number(acceptancesRes?.total || 0);
    }

    // 4. Tasks Summary (tasks assigned to team members OR in team projects)
    const taskStatusCounts = await db
      .selectFrom('project_tasks as pt')
      .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
      .select(['pt.status', sql<number>`count(pt.id)`.as('count')])
      .where((eb) =>
        eb.or([
          eb('pt.assigned_to_employee_id', 'in', memberIds as any),
          teamProjectIds.length > 0
            ? eb('pm.project_id', 'in', teamProjectIds as any)
            : (sql`1 = 0` as any),
        ]),
      )
      .groupBy('pt.status')
      .execute();

    let tasksTodo = 0;
    let tasksInProgress = 0;
    let tasksBlocked = 0;
    let tasksDone = 0;

    for (const row of taskStatusCounts) {
      const count = Number(row.count);
      if (row.status === 'TODO') tasksTodo += count;
      else if (row.status === 'IN_PROGRESS') tasksInProgress += count;
      else if (row.status === 'BLOCKED') tasksBlocked += count;
      else if (row.status === 'DONE') tasksDone += count;
    }
    const tasksTotal = tasksTodo + tasksInProgress + tasksBlocked + tasksDone;

    // 5. Total KPI Points for period
    const kpiRes = await db
      .selectFrom('kpi_events')
      .select(sql<number>`coalesce(sum(kpi_points), 0)`.as('total'))
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .executeTakeFirst();
    const totalKpiPoints = Number(kpiRes?.total || 0);

    // 6. Workload per Dev
    const memberAssignments = await db
      .selectFrom('project_assignments as pa')
      .innerJoin('projects as p', 'p.id', 'pa.project_id')
      .select([
        'pa.employee_id',
        'pa.assignment_type',
        sql<number>`count(distinct p.id)`.as('project_count'),
      ])
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true)
      .where('p.status', 'not in', ['COMPLETED', 'CANCELLED'])
      .groupBy(['pa.employee_id', 'pa.assignment_type'])
      .execute();

    const workloadMap = new Map<string, { primary: number; support: number }>();
    for (const row of memberAssignments) {
      const empId = String(row.employee_id);
      const curr = workloadMap.get(empId) || { primary: 0, support: 0 };
      if (row.assignment_type === 'PRIMARY') {
        curr.primary = Number(row.project_count);
      } else if (row.assignment_type === 'SUPPORT') {
        curr.support = Number(row.project_count);
      }
      workloadMap.set(empId, curr);
    }

    const memberTasks = await db
      .selectFrom('project_tasks')
      .select(['assigned_to_employee_id', sql<number>`count(id)`.as('task_count')])
      .where('assigned_to_employee_id', 'in', memberIds as any)
      .where('status', 'in', ['TODO', 'IN_PROGRESS', 'BLOCKED'])
      .groupBy('assigned_to_employee_id')
      .execute();

    const tasksMap = new Map<string, number>();
    for (const row of memberTasks) {
      if (row.assigned_to_employee_id) {
        tasksMap.set(String(row.assigned_to_employee_id), Number(row.task_count));
      }
    }

    const memberKpis = await db
      .selectFrom('kpi_events')
      .select(['employee_id', sql<number>`coalesce(sum(kpi_points), 0)`.as('points')])
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .groupBy('employee_id')
      .execute();

    const kpiMap = new Map<string, number>();
    for (const row of memberKpis) {
      if (row.employee_id) {
        kpiMap.set(String(row.employee_id), Number(row.points));
      }
    }

    const membersSummary = members.map((m: any) => {
      const empId = String(m.id);
      const wl = workloadMap.get(empId) || { primary: 0, support: 0 };
      return {
        employeeId: empId,
        employeeCode: m.employee_code,
        fullName: m.full_name,
        positionName: m.position_name || null,
        isLeader: Boolean(m.is_leader),
        activePrimaryProjectsCount: wl.primary,
        activeSupportProjectsCount: wl.support,
        totalActiveProjects: wl.primary + wl.support,
        activeTasksCount: tasksMap.get(empId) || 0,
        kpiPoints: kpiMap.get(empId) || 0,
      };
    });

    // 7. Recent Projects
    let recentProjects: TeamRecentProjectItem[] = [];
    if (teamProjectIds.length > 0) {
      const rawRecent = await db
        .selectFrom('projects as p')
        .innerJoin('order_items as oi', 'oi.id', 'p.order_item_id')
        .innerJoin('orders as o', 'o.id', 'oi.order_id')
        .innerJoin('accounts as a', 'a.id', 'o.account_id')
        .innerJoin('services as s', 's.id', 'oi.service_id')
        .select([
          'p.id',
          'p.project_name',
          'p.status',
          'p.materialized_progress_percent',
          'p.created_at',
          'o.order_code',
          'a.company_name',
          's.name as service_name',
        ])
        .where('p.id', 'in', teamProjectIds as any)
        .orderBy('p.created_at', 'desc')
        .limit(10)
        .execute();

      recentProjects = await Promise.all(
        rawRecent.map(async (rp) => {
          const assignees = await db
            .selectFrom('project_assignments as pa')
            .innerJoin('employees as e', 'e.id', 'pa.employee_id')
            .select(['e.id', 'e.full_name', 'pa.assignment_type'])
            .where('pa.project_id', '=', rp.id)
            .where('pa.is_active', '=', true)
            .execute();

          return {
            ...rp,
            primaryAssignees: assignees
              .filter((a) => a.assignment_type === 'PRIMARY')
              .map((a) => a.full_name),
            supportAssignees: assignees
              .filter((a) => a.assignment_type === 'SUPPORT')
              .map((a) => a.full_name),
          };
        }),
      );
    }

    return {
      team: {
        id: String(team.id),
        name: team.name,
        code: team.code,
        department: team.department,
      },
      period,
      metrics: {
        totalProjects,
        activeProjectsCount,
        blockedProjectsCount,
        completedProjectsCount,
        reviewAcceptanceCount,
        totalAcceptances,
        totalKpiPoints,
      },
      tasksSummary: {
        todo: tasksTodo,
        inProgress: tasksInProgress,
        blocked: tasksBlocked,
        done: tasksDone,
        total: tasksTotal,
      },
      members: membersSummary,
      recentProjects,
    };
  }

  /**
   * PHASE G: SEO Team Leader Internal Workspace Summary
   * Pure internal operational workspace for SEO teams:
   * - Current SEO Team
   * - Members (temporal)
   * - Projects (assigned to team members)
   * - Tasks (TODO, IN_PROGRESS, BLOCKED, DONE)
   * - Progress (materialized progress %)
   * - Blocked / Waiting work
   * - Workload (PRIMARY vs SUPPORT, active tasks)
   * - KPI points
   */
  async getSeoWorkspaceSummary(user: JwtPayload, periodParam?: string) {
    const db = this.kysely.db;
    const roles = user.roles || [];
    const isGlobal = roles.includes('ADMIN') || roles.includes('BOSS');

    let team: any = null;

    if (isGlobal) {
      team = await db
        .selectFrom('teams')
        .selectAll()
        .where('department', '=', 'SEO')
        .orderBy('created_at', 'asc')
        .executeTakeFirst();
    } else {
      if (!user.employeeId) {
        throw new ForbiddenException('User missing employee ID');
      }
      team = await this.getCurrentLedTeam(user.employeeId);
    }

    if (!team) {
      throw new NotFoundException('Không tìm thấy nhóm SEO nào bạn đang phụ trách');
    }

    if (!isGlobal && team.department !== 'SEO') {
      throw new ForbiddenException('Nhóm bạn đang phụ trách không thuộc phòng ban SEO');
    }

    // 2. Resolve Current Members
    const members = await this.getCurrentTeamMembers(team.id);
    const memberIds = members.map((m: any) => String(m.id));

    // Target Period (e.g. "2026-09")
    const now = new Date();
    const currentPeriod = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const period = periodParam || currentPeriod;

    if (memberIds.length === 0) {
      return {
        team: {
          id: String(team.id),
          name: team.name,
          code: team.code,
          department: team.department,
        },
        period,
        metrics: {
          totalProjects: 0,
          activeProjectsCount: 0,
          blockedProjectsCount: 0,
          completedProjectsCount: 0,
          reviewAcceptanceCount: 0,
          totalAcceptances: 0,
          totalKpiPoints: 0,
        },
        tasksSummary: {
          todo: 0,
          inProgress: 0,
          blocked: 0,
          done: 0,
          total: 0,
        },
        members: [],
        recentProjects: [],
      };
    }

    // 3. Subquery / Join for Projects of current team members
    const teamProjectsQuery = db
      .selectFrom('projects as p')
      .innerJoin('project_assignments as pa', 'pa.project_id', 'p.id')
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true);

    const teamProjectRows = await teamProjectsQuery
      .select(sql<string>`distinct p.id`.as('project_id'))
      .execute();
    const teamProjectIds = teamProjectRows.map((r) => String(r.project_id));

    let totalProjects = 0;
    let activeProjectsCount = 0;
    let blockedProjectsCount = 0;
    let completedProjectsCount = 0;
    let reviewAcceptanceCount = 0;
    let totalAcceptances = 0;

    if (teamProjectIds.length > 0) {
      const projectStatusCounts = await db
        .selectFrom('projects as p')
        .select(['p.status', sql<number>`count(p.id)`.as('count')])
        .where('p.id', 'in', teamProjectIds as any)
        .groupBy('p.status')
        .execute();

      for (const row of projectStatusCounts) {
        const count = Number(row.count);
        totalProjects += count;
        if (['ASSIGNED', 'READY_TO_START', 'IN_PROGRESS'].includes(row.status)) {
          activeProjectsCount += count;
        } else if (
          ['BLOCKED', 'WAITING_CUSTOMER', 'WAITING_SALE', 'WAITING_INTERNAL'].includes(row.status)
        ) {
          blockedProjectsCount += count;
        } else if (['REVIEW', 'ACCEPTANCE'].includes(row.status)) {
          reviewAcceptanceCount += count;
        } else if (row.status === 'COMPLETED') {
          completedProjectsCount += count;
        }
      }

      const acceptancesRes = await db
        .selectFrom('project_acceptances')
        .select(sql<number>`count(id)`.as('total'))
        .where('project_id', 'in', teamProjectIds as any)
        .executeTakeFirst();
      totalAcceptances = Number(acceptancesRes?.total || 0);
    }

    // 4. Tasks Summary (tasks assigned to team members OR in team projects)
    const taskStatusCounts = await db
      .selectFrom('project_tasks as pt')
      .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
      .select(['pt.status', sql<number>`count(pt.id)`.as('count')])
      .where((eb) =>
        eb.or([
          eb('pt.assigned_to_employee_id', 'in', memberIds as any),
          teamProjectIds.length > 0
            ? eb('pm.project_id', 'in', teamProjectIds as any)
            : (sql`1 = 0` as any),
        ]),
      )
      .groupBy('pt.status')
      .execute();

    let tasksTodo = 0;
    let tasksInProgress = 0;
    let tasksBlocked = 0;
    let tasksDone = 0;

    for (const row of taskStatusCounts) {
      const count = Number(row.count);
      if (row.status === 'TODO') tasksTodo += count;
      else if (row.status === 'IN_PROGRESS') tasksInProgress += count;
      else if (row.status === 'BLOCKED') tasksBlocked += count;
      else if (row.status === 'DONE') tasksDone += count;
    }
    const tasksTotal = tasksTodo + tasksInProgress + tasksBlocked + tasksDone;

    // 5. Total KPI Points for period
    const kpiRes = await db
      .selectFrom('kpi_events')
      .select(sql<number>`coalesce(sum(kpi_points), 0)`.as('total'))
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .executeTakeFirst();
    const totalKpiPoints = Number(kpiRes?.total || 0);

    // 6. Workload per SEO Specialist
    const memberAssignments = await db
      .selectFrom('project_assignments as pa')
      .innerJoin('projects as p', 'p.id', 'pa.project_id')
      .select([
        'pa.employee_id',
        'pa.assignment_type',
        sql<number>`count(distinct p.id)`.as('project_count'),
      ])
      .where('pa.employee_id', 'in', memberIds as any)
      .where('pa.is_active', '=', true)
      .where('p.status', 'not in', ['COMPLETED', 'CANCELLED'])
      .groupBy(['pa.employee_id', 'pa.assignment_type'])
      .execute();

    const workloadMap = new Map<string, { primary: number; support: number }>();
    for (const row of memberAssignments) {
      const empId = String(row.employee_id);
      const curr = workloadMap.get(empId) || { primary: 0, support: 0 };
      if (row.assignment_type === 'PRIMARY') {
        curr.primary = Number(row.project_count);
      } else if (row.assignment_type === 'SUPPORT') {
        curr.support = Number(row.project_count);
      }
      workloadMap.set(empId, curr);
    }

    const memberTasks = await db
      .selectFrom('project_tasks')
      .select(['assigned_to_employee_id', sql<number>`count(id)`.as('task_count')])
      .where('assigned_to_employee_id', 'in', memberIds as any)
      .where('status', 'in', ['TODO', 'IN_PROGRESS', 'BLOCKED'])
      .groupBy('assigned_to_employee_id')
      .execute();

    const tasksMap = new Map<string, number>();
    for (const row of memberTasks) {
      if (row.assigned_to_employee_id) {
        tasksMap.set(String(row.assigned_to_employee_id), Number(row.task_count));
      }
    }

    const memberKpis = await db
      .selectFrom('kpi_events')
      .select(['employee_id', sql<number>`coalesce(sum(kpi_points), 0)`.as('points')])
      .where('employee_id', 'in', memberIds as any)
      .where('target_kpi_period', '=', period)
      .groupBy('employee_id')
      .execute();

    const kpiMap = new Map<string, number>();
    for (const row of memberKpis) {
      if (row.employee_id) {
        kpiMap.set(String(row.employee_id), Number(row.points));
      }
    }

    const membersSummary = members.map((m: any) => {
      const empId = String(m.id);
      const wl = workloadMap.get(empId) || { primary: 0, support: 0 };
      return {
        employeeId: empId,
        employeeCode: m.employee_code,
        fullName: m.full_name,
        positionName: m.position_name || null,
        isLeader: Boolean(m.is_leader),
        activePrimaryProjectsCount: wl.primary,
        activeSupportProjectsCount: wl.support,
        totalActiveProjects: wl.primary + wl.support,
        activeTasksCount: tasksMap.get(empId) || 0,
        kpiPoints: kpiMap.get(empId) || 0,
      };
    });

    // 7. Recent Projects
    let recentProjects: TeamRecentProjectItem[] = [];
    if (teamProjectIds.length > 0) {
      const rawRecent = await db
        .selectFrom('projects as p')
        .innerJoin('order_items as oi', 'oi.id', 'p.order_item_id')
        .innerJoin('orders as o', 'o.id', 'oi.order_id')
        .innerJoin('accounts as a', 'a.id', 'o.account_id')
        .innerJoin('services as s', 's.id', 'oi.service_id')
        .select([
          'p.id',
          'p.project_name',
          'p.status',
          'p.materialized_progress_percent',
          'p.created_at',
          'o.order_code',
          'a.company_name',
          's.name as service_name',
        ])
        .where('p.id', 'in', teamProjectIds as any)
        .orderBy('p.created_at', 'desc')
        .limit(10)
        .execute();

      recentProjects = await Promise.all(
        rawRecent.map(async (rp) => {
          const assignees = await db
            .selectFrom('project_assignments as pa')
            .innerJoin('employees as e', 'e.id', 'pa.employee_id')
            .select(['e.id', 'e.full_name', 'pa.assignment_type'])
            .where('pa.project_id', '=', rp.id)
            .where('pa.is_active', '=', true)
            .execute();

          return {
            ...rp,
            primaryAssignees: assignees
              .filter((a) => a.assignment_type === 'PRIMARY')
              .map((a) => a.full_name),
            supportAssignees: assignees
              .filter((a) => a.assignment_type === 'SUPPORT')
              .map((a) => a.full_name),
          };
        }),
      );
    }

    return {
      team: {
        id: String(team.id),
        name: team.name,
        code: team.code,
        department: team.department,
      },
      period,
      metrics: {
        totalProjects,
        activeProjectsCount,
        blockedProjectsCount,
        completedProjectsCount,
        reviewAcceptanceCount,
        totalAcceptances,
        totalKpiPoints,
      },
      tasksSummary: {
        todo: tasksTodo,
        inProgress: tasksInProgress,
        blocked: tasksBlocked,
        done: tasksDone,
        total: tasksTotal,
      },
      members: membersSummary,
      recentProjects,
    };
  }
}
