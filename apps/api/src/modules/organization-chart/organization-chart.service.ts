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

export interface OrgChartResponse {
  boss: OrgEmployeeCard | null;
  teams: OrgTeamData[];
  externalStaff: OrgEmployeeCard[];
  departments: string[];
}

@Injectable()
export class OrganizationChartService {
  private readonly logger = new Logger(OrganizationChartService.name);

  constructor(private readonly kysely: KyselyService) {}

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
              .whereRef('user_roles.user_id', '=', 'users.id')
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
    let activeMemberships: any[] = [];
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
  // MOVE MEMBER BETWEEN TEAMS (TRANSACTION + TEMPORAL HISTORY)
  // -------------------------------------------------------------
  async moveMember(dto: MoveMemberDto, actorEmployeeId: string | number) {
    const db = this.kysely.db;

    return await db.transaction().execute(async (trx) => {
      // 1. Lock candidate employee record
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

      // 2. Lock Target Team
      const targetTeam = await trx
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', dto.targetTeamId as any)
        .forUpdate()
        .executeTakeFirst();

      if (!targetTeam) {
        throw new NotFoundException(`Nhóm đích #${dto.targetTeamId} không tồn tại`);
      }

      // 3. Lock current active membership of employee
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

      // RULE: Do not allow dragging Team Leader as normal member
      if (currentMembership.is_leader) {
        throw new BadRequestException(
          `Không thể kéo thả Trưởng nhóm (${employee.full_name}) thành thành viên thường. Vui lòng sử dụng action 'Đổi trưởng Team'.`,
        );
      }

      // Check if already in target team
      if (String(currentMembership.team_id) === String(targetTeam.id)) {
        throw new BadRequestException(
          `Nhân viên ${employee.full_name} đã thuộc nhóm [${targetTeam.name}]`,
        );
      }

      // 4. Lock Source Team
      const sourceTeam = await trx
        .selectFrom('teams')
        .selectAll()
        .where('id', '=', currentMembership.team_id as any)
        .forUpdate()
        .executeTakeFirst();

      if (!sourceTeam) {
        throw new NotFoundException(`Nhóm nguồn #${currentMembership.team_id} không tồn tại`);
      }

      // CROSS-DEPARTMENT CHECK:
      const isCrossDepartment =
        (sourceTeam.department || '').toUpperCase() !==
        (targetTeam.department || '').toUpperCase();

      if (isCrossDepartment) {
        throw new BadRequestException(
          `CROSS_DEPARTMENT_TRANSFER_RULE_NOT_DEFINED: Chưa hỗ trợ điều chuyển liên phòng ban ([${sourceTeam.department}] -> [${targetTeam.department}]).`,
        );
      }

      // 5. Close old membership range at NOW()
      await trx
        .updateTable('team_memberships')
        .set({
          effective_range: sql`tstzrange(lower(effective_range), NOW(), '[)')` as any,
        })
        .where('id', '=', currentMembership.id)
        .execute();

      // 6. Insert new membership into target team: [NOW(), NULL)
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

      // 7. Audit log
      await trx
        .insertInto('audit_logs')
        .values({
          action: 'ORG_CHART_MOVE_MEMBER',
          entity_type: 'TEAM_MEMBERSHIP',
          entity_id: newMembership.id,
          actor_employee_id: actorEmployeeId as any,
          payload_before_sanitized: JSON.stringify({
            membershipId: currentMembership.id,
            sourceTeamId: sourceTeam.id,
            sourceTeamName: sourceTeam.name,
            sourceDepartment: sourceTeam.department,
            employeeId: dto.employeeId,
          }),
          payload_after_sanitized: JSON.stringify({
            newMembershipId: newMembership.id,
            targetTeamId: targetTeam.id,
            targetTeamName: targetTeam.name,
            targetDepartment: targetTeam.department,
            employeeId: dto.employeeId,
            isCrossDepartment,
            reason: dto.reason || null,
          }),
        })
        .execute();

      return {
        message: isCrossDepartment
          ? `Chuyển nhóm thành công (Lưu ý: Chuyển liên phòng ban [${sourceTeam.department}] -> [${targetTeam.department}])`
          : 'Chuyển nhóm làm việc thành công',
        oldMembershipId: String(currentMembership.id),
        newMembershipId: String(newMembership.id),
        sourceTeamId: String(sourceTeam.id),
        targetTeamId: String(targetTeam.id),
        isCrossDepartment,
      };
    });
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
