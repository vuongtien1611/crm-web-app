import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql } from 'kysely';
import { MoveMemberDto } from './dto/move-member.dto';
import { ChangeLeaderDto } from './dto/change-leader.dto';
import { SessionService } from '../auth/services/session.service';

export interface OrgEmployeeCard {
  employeeId: string;
  employeeCode: string;
  fullName: string;
  phone: string | null;
  status: string;
  positionCode: string | null;
  positionName: string | null;
  roles: string[];
  teamId: string | null;
  teamName: string | null;
  department: string | null;
  isLeader: boolean;
  isBoss: boolean;
  membershipId: string | null;
  joinedAt?: string | null;
}

export interface OrgTeamData {
  id: string;
  code: string;
  name: string;
  department: string;
  description: string | null;
  leader: OrgEmployeeCard | null;
  members: OrgEmployeeCard[];
  memberCount: number;
}

interface ActiveMembershipRow {
  membership_id: string;
  team_id: string;
  is_leader: boolean;
  joined_at: string;
  employee_id: string;
  employee_code: string;
  full_name: string;
  phone: string | null;
  employee_status: string;
  position_code: string | null;
  position_name: string | null;
  user_id: string | null;
}

export interface OrgChartResponse {
  boss: OrgEmployeeCard | null;
  teams: OrgTeamData[];
  externalStaff: OrgEmployeeCard[];
  departments: string[];
}

@Injectable()
export class OrganizationChartService {
  private readonly logger = new Logger(OrganizationChartService.name);

  constructor(
    private readonly kysely: KyselyService,
    private readonly sessionService: SessionService,
  ) {}

  // -------------------------------------------------------------
  // GET ORGANIZATION CHART DATA
  // -------------------------------------------------------------
  async getOrganizationChart(): Promise<OrgChartResponse> {
    const db = this.kysely.db;

    // 1. Query BOSS employee
    const bossRow = await db
      .selectFrom('employees')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .leftJoin('users', 'users.id', 'employees.user_id')
      .select([
        'employees.id as employee_id',
        'employees.employee_code',
        'employees.full_name',
        'employees.phone',
        'employees.status as employee_status',
        'positions.code as position_code',
        'positions.name as position_name',
        'users.id as user_id',
      ])
      .where((eb) =>
        eb.or([
          eb('positions.code', '=', 'BOSS'),
          eb.exists(
            db
              .selectFrom('user_roles')
              .innerJoin('roles', 'roles.id', 'user_roles.role_id')
              .select('user_roles.user_id')
              .whereRef('user_roles.user_id', '=', sql.ref('users.id'))
              .where('roles.code', '=', 'BOSS'),
          ),
        ]),
      )
      .where('employees.status', 'not in', ['RESIGNED', 'TERMINATED'])
      .orderBy('employees.id', 'asc')
      .executeTakeFirst();

    // 2. Fetch all user roles map
    const allUserRoles = await db
      .selectFrom('user_roles')
      .innerJoin('roles', 'roles.id', 'user_roles.role_id')
      .select(['user_roles.user_id', 'roles.code'])
      .execute();

    const roleMap = new Map<string, string[]>();
    for (const ur of allUserRoles) {
      const uid = String(ur.user_id);
      if (!roleMap.has(uid)) roleMap.set(uid, []);
      roleMap.get(uid)!.push(ur.code);
    }

    let bossCard: OrgEmployeeCard | null = null;
    if (bossRow) {
      const uid = bossRow.user_id ? String(bossRow.user_id) : null;
      bossCard = {
        employeeId: String(bossRow.employee_id),
        employeeCode: bossRow.employee_code,
        fullName: bossRow.full_name,
        phone: bossRow.phone,
        status: bossRow.employee_status,
        positionCode: bossRow.position_code,
        positionName: bossRow.position_name,
        roles: uid ? roleMap.get(uid) || ['BOSS'] : ['BOSS'],
        teamId: null,
        teamName: null,
        department: 'BOD',
        isLeader: false,
        isBoss: true,
        membershipId: null,
      };
    }

    // 3. Query all teams
    // Canonical departments: SALES, DEV, SEO
    const teamRows = await db
      .selectFrom('teams')
      .selectAll()
      .orderBy('department', 'asc')
      .orderBy('name', 'asc')
      .execute();

    const teamIds = teamRows.map((t) => t.id);

    // 4. Query all active team memberships
    let activeMemberships: ActiveMembershipRow[] = [];
    if (teamIds.length > 0) {
      activeMemberships = await db
        .selectFrom('team_memberships')
        .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
        .leftJoin('positions', 'positions.id', 'employees.position_id')
        .leftJoin('users', 'users.id', 'employees.user_id')
        .select([
          'team_memberships.id as membership_id',
          'team_memberships.team_id',
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
        .where('team_memberships.team_id', 'in', teamIds as any)
        .where(sql`team_memberships.effective_range @> NOW()` as any)
        .where('employees.status', 'not in', ['RESIGNED', 'TERMINATED'])
        .orderBy('team_memberships.is_leader', 'desc')
        .orderBy('employees.full_name', 'asc')
        .execute();
    }

    // Map memberships by team
    const teamMemberMap = new Map<string, { leader: OrgEmployeeCard | null; members: OrgEmployeeCard[] }>();
    for (const tid of teamIds) {
      teamMemberMap.set(String(tid), { leader: null, members: [] });
    }

    const assignedEmployeeIds = new Set<string>();
    if (bossCard) {
      assignedEmployeeIds.add(bossCard.employeeId);
    }

    for (const row of activeMemberships) {
      const tid = String(row.team_id);
      const teamObj = teamMemberMap.get(tid);
      const uid = row.user_id ? String(row.user_id) : null;
      const teamMeta = teamRows.find((t) => String(t.id) === tid);

      const card: OrgEmployeeCard = {
        employeeId: String(row.employee_id),
        employeeCode: row.employee_code,
        fullName: row.full_name,
        phone: row.phone,
        status: row.employee_status,
        positionCode: row.position_code,
        positionName: row.position_name,
        roles: uid ? roleMap.get(uid) || [] : [],
        teamId: tid,
        teamName: teamMeta?.name || null,
        department: teamMeta?.department || null,
        isLeader: Boolean(row.is_leader),
        isBoss: false,
        membershipId: String(row.membership_id),
        joinedAt: row.joined_at,
      };

      assignedEmployeeIds.add(card.employeeId);

      if (teamObj) {
        if (row.is_leader) {
          teamObj.leader = card;
        } else {
          teamObj.members.push(card);
        }
      }
    }

    // Assemble canonical teams list
    const canonicalDepts = ['SALES', 'DEV', 'SEO'];
    const canonicalTeams: OrgTeamData[] = [];
    const nonCanonicalTeams: OrgTeamData[] = [];

    for (const team of teamRows) {
      const tid = String(team.id);
      const mData = teamMemberMap.get(tid) || { leader: null, members: [] };
      const teamData: OrgTeamData = {
        id: tid,
        code: team.code,
        name: team.name,
        department: team.department || 'OTHER',
        description: team.description,
        leader: mData.leader,
        members: mData.members,
        memberCount: (mData.leader ? 1 : 0) + mData.members.length,
      };

      if (canonicalDepts.includes((team.department || '').toUpperCase())) {
        canonicalTeams.push(teamData);
      } else {
        nonCanonicalTeams.push(teamData);
      }
    }

    // 5. Query External Staff (ADMIN, ACCOUNTANT, or Staff outside canonical tree)
    // "ADMIN và ACCOUNTANT: không nằm trong cây quản lý trực tiếp hiện tại, đặt khu riêng 'Ngoài cơ cấu quản lý trực tiếp'"
    const allEmployees = await db
      .selectFrom('employees')
      .leftJoin('positions', 'positions.id', 'employees.position_id')
      .leftJoin('users', 'users.id', 'employees.user_id')
      .select([
        'employees.id as employee_id',
        'employees.employee_code',
        'employees.full_name',
        'employees.phone',
        'employees.status as employee_status',
        'positions.code as position_code',
        'positions.name as position_name',
        'users.id as user_id',
      ])
      .where('employees.status', 'not in', ['RESIGNED', 'TERMINATED'])
      .orderBy('employees.id', 'asc')
      .execute();

    const externalStaff: OrgEmployeeCard[] = [];

    for (const emp of allEmployees) {
      const eid = String(emp.employee_id);
      const uid = emp.user_id ? String(emp.user_id) : null;
      const roles = uid ? roleMap.get(uid) || [] : [];
      const posCode = (emp.position_code || '').toUpperCase();

      const isExecutiveSupport =
        roles.includes('ADMIN') ||
        roles.includes('ACCOUNTANT') ||
        posCode === 'ADMIN' ||
        posCode === 'ACCOUNTANT';

      // If it's an ADMIN/ACCOUNTANT or not in assigned canonical teams
      if (isExecutiveSupport || (!assignedEmployeeIds.has(eid) && eid !== bossCard?.employeeId)) {
        externalStaff.push({
          employeeId: eid,
          employeeCode: emp.employee_code,
          fullName: emp.full_name,
          phone: emp.phone,
          status: emp.employee_status,
          positionCode: emp.position_code,
          positionName: emp.position_name,
          roles,
          teamId: null,
          teamName: isExecutiveSupport ? 'Ngoài cơ cấu quản lý trực tiếp' : 'Chưa phân nhóm',
          department: isExecutiveSupport ? 'EXECUTIVE_SUPPORT' : 'UNASSIGNED',
          isLeader: false,
          isBoss: false,
          membershipId: null,
        });
      }
    }

    // Extract unique canonical departments
    const departments = Array.from(
      new Set(canonicalTeams.map((t) => t.department.toUpperCase())),
    );

    return {
      boss: bossCard,
      teams: canonicalTeams,
      externalStaff,
      departments,
    };
  }

  // -------------------------------------------------------------
  // GET EMPLOYEE WORKLOAD (PRE-TRANSFER WARNING)
  // -------------------------------------------------------------
  async getEmployeeWorkload(employeeId: string | number) {
    const db = this.kysely.db;

    // 1. Employee existence check
    const employee = await db
      .selectFrom('employees')
      .selectAll()
      .where('id', '=', employeeId as any)
      .executeTakeFirst();

    if (!employee) {
      throw new NotFoundException(`Nhân viên #${employeeId} không tồn tại`);
    }

    // 2. Active project assignments
    const activeProjects = await db
      .selectFrom('project_assignments as pa')
      .innerJoin('projects as p', 'p.id', 'pa.project_id')
      .select(['p.id', 'p.project_name', 'pa.assignment_type'])
      .where('pa.employee_id', '=', employeeId as any)
      .where('pa.is_active', '=', true)
      .where('pa.unassigned_at', 'is', null)
      .execute();

    // 3. Active project tasks
    const activeTasks = await db
      .selectFrom('project_tasks as pt')
      .innerJoin('project_milestones as pm', 'pm.id', 'pt.milestone_id')
      .innerJoin('projects as p', 'p.id', 'pm.project_id')
      .select(['pt.id', 'pt.title', 'pt.status', 'p.project_name'])
      .where('pt.assigned_to_employee_id', '=', employeeId as any)
      .where('pt.status', 'in', ['TODO', 'IN_PROGRESS', 'BLOCKED'])
      .execute();

    // 4. Active deals (if sales)
    const activeDeals = await db
      .selectFrom('deals')
      .select(['id', 'deal_name', 'status', 'expected_value'])
      .where('assigned_sale_id', '=', employeeId as any)
      .where('status', 'not in', ['WON', 'LOST'])
      .execute();

    // 5. Current team membership & leadership status
    const currentMembership = await db
      .selectFrom('team_memberships')
      .select(['team_id', 'is_leader'])
      .where('employee_id', '=', employeeId as any)
      .where(sql`effective_range @> NOW()` as any)
      .executeTakeFirst();

    return {
      employeeId: String(employeeId),
      fullName: employee.full_name,
      employeeCode: employee.employee_code,
      isLeader: !!currentMembership?.is_leader,
      currentTeamId: currentMembership ? String(currentMembership.team_id) : null,
      activeProjectsCount: activeProjects.length,
      activeProjects: activeProjects.map((p) => ({
        id: String(p.id),
        code: String(p.id),
        name: p.project_name,
        assignmentType: p.assignment_type,
      })),
      activeTasksCount: activeTasks.length,
      activeTasks: activeTasks.map((t) => ({
        id: String(t.id),
        title: t.title,
        status: t.status,
        projectName: t.project_name,
      })),
      activeDealsCount: activeDeals.length,
      activeDeals: activeDeals.map((d) => ({
        id: String(d.id),
        title: d.deal_name,
        status: d.status,
        dealValue: Number(d.expected_value || 0),
      })),
      hasActiveWorkload:
        activeProjects.length > 0 || activeTasks.length > 0 || activeDeals.length > 0,
    };
  }

  // -------------------------------------------------------------
  // MOVE MEMBER BETWEEN TEAMS (TRANSACTION + TEMPORAL HISTORY)
  // -------------------------------------------------------------
  async moveMember(dto: MoveMemberDto, actorEmployeeId: string | number) {
    const db = this.kysely.db;

    const result = await db.transaction().execute(async (trx) => {
      // 1. Lock candidate employee record (deterministic single lock on target employee)
      const employee = await trx
        .selectFrom('employees')
        .leftJoin('positions', 'positions.id', 'employees.position_id')
        .leftJoin('users', 'users.id', 'employees.user_id')
        .select([
          'employees.id',
          'employees.employee_code',
          'employees.full_name',
          'employees.status',
          'employees.position_id',
          'positions.code as position_code',
          'users.id as user_id',
        ])
        .where('employees.id', '=', dto.employeeId as any)
        .forUpdate('employees')
        .executeTakeFirst();

      if (!employee) {
        throw new NotFoundException(`Nhân viên #${dto.employeeId} không tồn tại`);
      }

      if (employee.status === 'RESIGNED' || employee.status === 'TERMINATED') {
        throw new BadRequestException('Nhân viên đã nghỉ việc, không thể chuyển nhóm');
      }

      // Check user roles
      let userRoles: string[] = [];
      if (employee.user_id) {
        const rRows = await trx
          .selectFrom('user_roles')
          .innerJoin('roles', 'roles.id', 'user_roles.role_id')
          .select('roles.code')
          .where('user_roles.user_id', '=', employee.user_id as any)
          .execute();
        userRoles = rRows.map((r) => r.code);
      }

      // RULE: Do not allow dragging BOSS into a team
      if (employee.position_code === 'BOSS' || userRoles.includes('BOSS')) {
        throw new BadRequestException(
          'Không được phép kéo Giám Đốc (BOSS) vào Team làm việc',
        );
      }

      // 2. Lock current active membership of employee
      const currentMembership = await trx
        .selectFrom('team_memberships')
        .selectAll()
        .where('employee_id', '=', dto.employeeId as any)
        .where(sql`effective_range @> NOW()` as any)
        .forUpdate()
        .executeTakeFirst();

      if (!currentMembership) {
        throw new BadRequestException(
          `Nhân viên ${employee.full_name} (${employee.employee_code}) hiện không thuộc nhóm làm việc nào`,
        );
      }

      // Check if already in target team
      if (String(currentMembership.team_id) === String(dto.targetTeamId)) {
        throw new BadRequestException(
          `Nhân viên ${employee.full_name} đã thuộc nhóm này`,
        );
      }

      // 3. Lock Teams in deterministic order (by team ID) to prevent deadlocks
      const [firstTeamId, secondTeamId] = [
        BigInt(currentMembership.team_id),
        BigInt(dto.targetTeamId),
      ].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      const lockedTeams = await trx
        .selectFrom('teams')
        .selectAll()
        .where('id', 'in', [firstTeamId, secondTeamId] as any)
        .forUpdate()
        .execute();

      const sourceTeam = lockedTeams.find((t) => String(t.id) === String(currentMembership.team_id));
      const targetTeam = lockedTeams.find((t) => String(t.id) === String(dto.targetTeamId));

      if (!sourceTeam) {
        throw new NotFoundException(`Nhóm nguồn #${currentMembership.team_id} không tồn tại`);
      }
      if (!targetTeam) {
        throw new NotFoundException(`Nhóm đích #${dto.targetTeamId} không tồn tại`);
      }

      // Check supported department
      const validDepts = ['SALES', 'DEV', 'SEO'];
      if (!targetTeam.department || !validDepts.includes(targetTeam.department.toUpperCase())) {
        throw new BadRequestException(
          `Nhóm đích thuộc phòng ban [${targetTeam.department || 'KHÔNG XÁC ĐỊNH'}] không hợp lệ để điều chuyển. Chỉ hỗ trợ điều chuyển giữa SALES, DEV, SEO.`,
        );
      }

      const isCrossDepartment =
        (sourceTeam.department || '').toUpperCase() !==
        (targetTeam.department || '').toUpperCase();

      const wasLeader = Boolean(currentMembership.is_leader);

      // 4. Close old membership range at NOW()
      await trx
        .updateTable('team_memberships')
        .set({
          effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
        })
        .where('id', '=', currentMembership.id)
        .execute();

      // 5. Insert new membership into target team: [NOW(), NULL), ALWAYS is_leader: false
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

      let targetPos: any = null;
      let targetRole: any = null;

      // 6. Handle Role & Position Transition (Cross-Department or Leader becoming Regular Member)
      const shouldUpdateRoleAndPosition = isCrossDepartment || wasLeader;

      if (shouldUpdateRoleAndPosition) {
        const targetDeptCode =
          targetTeam.department.toUpperCase() === 'SALES' ? 'SALE' : targetTeam.department.toUpperCase();

        targetPos = await trx
          .selectFrom('positions')
          .selectAll()
          .where('code', '=', targetDeptCode)
          .executeTakeFirst();

        if (!targetPos) {
          throw new NotFoundException(
            `Chức vụ tương ứng [${targetDeptCode}] không tồn tại trong hệ thống`,
          );
        }

        targetRole = await trx
          .selectFrom('roles')
          .selectAll()
          .where('code', '=', targetDeptCode)
          .executeTakeFirst();

        if (!targetRole) {
          throw new NotFoundException(
            `Vai trò (Role) tương ứng [${targetDeptCode}] không tồn tại trong hệ thống`,
          );
        }

        // Close current open employee_position_history
        await trx
          .updateTable('employee_position_history')
          .set({
            effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
          })
          .where('employee_id', '=', dto.employeeId as any)
          .where(sql`upper_inf(effective_range)` as any)
          .execute();

        // Insert new position history
        const noteText = dto.reason?.trim()
          ? (isCrossDepartment
              ? `[CROSS_DEPARTMENT_TRANSFER] ${dto.reason.trim()}`
              : `[TEAM_TRANSFER] ${dto.reason.trim()}`)
          : (isCrossDepartment
              ? `[CROSS_DEPARTMENT_TRANSFER] Điều chuyển từ [${sourceTeam.department}] (${sourceTeam.name}) sang [${targetTeam.department}] (${targetTeam.name})`
              : `[TEAM_TRANSFER] Điều chuyển từ [${sourceTeam.name}] sang [${targetTeam.name}] (mặc định là nhân viên của nhóm mới)`);

        await trx
          .insertInto('employee_position_history')
          .values({
            employee_id: dto.employeeId as any,
            position_id: targetPos.id as any,
            effective_range: sql`tstzrange(NOW(), NULL, '[)')` as any,
            note: noteText,
            created_at: new Date(),
          })
          .execute();

        // Update employee.position_id
        await trx
          .updateTable('employees')
          .set({
            position_id: targetPos.id as any,
            updated_at: new Date(),
          })
          .where('id', '=', dto.employeeId as any)
          .execute();

        // Rotate user_roles if linked user account exists
        if (employee.user_id) {
          // Dynamic lookup of all departmental roles to revoke
          const deptRoleCodes = [
            'DEV',
            'DEV_TEAM_LEADER',
            'SALE',
            'SALES_TEAM_LEADER',
            'SEO',
            'SEO_TEAM_LEADER',
          ];
          const deptRoles = await trx
            .selectFrom('roles')
            .select('id')
            .where('code', 'in', deptRoleCodes)
            .execute();
          const deptRoleIds = deptRoles.map((r) => r.id);

          if (deptRoleIds.length > 0) {
            await trx
              .deleteFrom('user_roles')
              .where('user_id', '=', employee.user_id as any)
              .where('role_id', 'in', deptRoleIds as any[])
              .execute();
          }

          // Grant target base role
          await trx
            .insertInto('user_roles')
            .values({
              user_id: employee.user_id as any,
              role_id: targetRole.id as any,
            })
            .execute();
        }
      }

      // 7. Audit log
      await trx
        .insertInto('audit_logs')
        .values({
          action: isCrossDepartment ? 'ORG_CHART_CROSS_DEPT_MOVE' : 'ORG_CHART_MOVE_MEMBER',
          entity_type: 'EMPLOYEE',
          entity_id: employee.id as any,
          actor_employee_id: actorEmployeeId as any,
          payload_before_sanitized: JSON.stringify({
            membershipId: currentMembership.id,
            sourceTeamId: sourceTeam.id,
            sourceTeamName: sourceTeam.name,
            sourceDepartment: sourceTeam.department,
            wasLeader: currentMembership.is_leader,
            positionId: employee.position_id,
            positionCode: employee.position_code,
            employeeId: dto.employeeId,
          }),
          payload_after_sanitized: JSON.stringify({
            newMembershipId: newMembership.id,
            targetTeamId: targetTeam.id,
            targetTeamName: targetTeam.name,
            targetDepartment: targetTeam.department,
            isLeader: false,
            newPositionId: targetPos ? targetPos.id : employee.position_id,
            newPositionCode: targetPos ? targetPos.code : employee.position_code,
            newRoleId: targetRole ? targetRole.id : null,
            newRoleCode: targetRole ? targetRole.code : null,
            employeeId: dto.employeeId,
            isCrossDepartment,
            wasLeader,
            reason: dto.reason || null,
          }),
        })
        .execute();

      return {
        message: isCrossDepartment
          ? `Điều chuyển nhân sự liên phòng ban thành công ([${sourceTeam.department}] -> [${targetTeam.department}])`
          : wasLeader
            ? 'Chuyển nhóm làm việc thành công (nhân sự là nhân viên của nhóm mới)'
            : 'Chuyển nhóm làm việc thành công',
        oldMembershipId: String(currentMembership.id),
        newMembershipId: String(newMembership.id),
        sourceTeamId: String(sourceTeam.id),
        targetTeamId: String(targetTeam.id),
        isCrossDepartment,
        wasLeader,
        userId: employee.user_id ? String(employee.user_id) : null,
      };
    });

    // 8. Revoke Redis sessions AFTER DB commit
    if (result.userId && (result.isCrossDepartment || result.wasLeader)) {
      await this.sessionService.revokeAllUserSessions(result.userId);
    }

    return result;
  }

  // -------------------------------------------------------------
  // CHANGE TEAM LEADER (BLOCKED: WAITING FOR ROLE/POSITION POLICY)
  // -------------------------------------------------------------
  async changeLeader(dto: ChangeLeaderDto, actorEmployeeId: string | number) {
    throw new BadRequestException(
      'TEAM_LEADER_ROLE_POLICY_NOT_DEFINED: Tạm thời chưa cho phép đổi Trưởng nhóm khi hệ thống chưa có quy định đồng bộ role, position và leader membership.',
    );
  }
}
