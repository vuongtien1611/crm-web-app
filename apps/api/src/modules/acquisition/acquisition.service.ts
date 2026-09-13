import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { TeamsService } from '../teams/teams.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { CreateChannelDto } from './dto/create-channel.dto';
import { CreateSalesContentDto } from './dto/create-sales-content.dto';
import { sql } from 'kysely';

@Injectable()
export class AcquisitionService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly teamsService: TeamsService,
  ) {}

  // --- PLATFORMS ---
  async findAllPlatforms() {
    return this.kysely.db
      .selectFrom('platforms')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
  }

  async createPlatform(dto: CreatePlatformDto) {
    const existing = await this.kysely.db
      .selectFrom('platforms')
      .select('id')
      .where('code', '=', dto.code)
      .executeTakeFirst();

    if (existing) {
      throw new BadRequestException(`Platform code [${dto.code}] already exists`);
    }

    const [platform] = await this.kysely.db
      .insertInto('platforms')
      .values({
        code: dto.code.toUpperCase(),
        name: dto.name,
        is_active: dto.isActive !== undefined ? dto.isActive : true,
      })
      .returningAll()
      .execute();

    return platform;
  }

  // --- CHANNELS ---
  async findAllChannels() {
    return this.kysely.db
      .selectFrom('channels')
      .selectAll()
      .orderBy('name', 'asc')
      .execute();
  }

  async createChannel(dto: CreateChannelDto) {
    const existing = await this.kysely.db
      .selectFrom('channels')
      .select('id')
      .where('code', '=', dto.code)
      .executeTakeFirst();

    if (existing) {
      throw new BadRequestException(`Channel code [${dto.code}] already exists`);
    }

    const [channel] = await this.kysely.db
      .insertInto('channels')
      .values({
        code: dto.code.toUpperCase(),
        name: dto.name,
        is_active: dto.isActive !== undefined ? dto.isActive : true,
      })
      .returningAll()
      .execute();

    return channel;
  }

  // --- HELPER: Resolve Team Members for Leader ---
  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }

  // --- SALE MARKET ASSIGNMENTS ---
  async findAllMarketAssignments(user?: any) {
    const db = this.kysely.db;
    let query = db
      .selectFrom('sale_market_assignments as sma')
      .innerJoin('employees as e', 'e.id', 'sma.employee_id')
      .leftJoin('platforms as p', 'p.id', 'sma.platform_id')
      .leftJoin('channels as c', 'c.id', 'sma.channel_id')
      .leftJoin('team_memberships as tm', (join) =>
        join.onRef('tm.employee_id', '=', 'e.id').on(sql`tm.effective_range @> NOW()`),
      )
      .leftJoin('teams as t', 't.id', 'tm.team_id')
      .select([
        'sma.id',
        'sma.employee_id',
        'e.full_name as employee_name',
        'e.employee_code',
        'sma.platform_id',
        'p.name as platform_name',
        'p.code as platform_code',
        'sma.channel_id',
        'c.name as channel_name',
        'c.code as channel_code',
        'sma.is_active',
        'sma.assigned_at',
        't.name as team_name',
        't.id as team_id',
      ]);

    if (user) {
      const roles: string[] = user.roles || [];
      const isElevated = roles.includes('ADMIN') || roles.includes('BOSS');

      if (!isElevated) {
        if (roles.includes('SALES_TEAM_LEADER') && user.employeeId) {
          const teamMemberIds = await this.resolveTeamMemberIds(String(user.employeeId));
          if (teamMemberIds.length > 0) {
            query = query.where('sma.employee_id', 'in', teamMemberIds as any);
          } else {
            query = query.where(sql`1 = 0` as any);
          }
        } else if (user.employeeId) {
          query = query.where('sma.employee_id', '=', String(user.employeeId) as any);
        } else {
          query = query.where(sql`1 = 0` as any);
        }
      }
    }

    return query.orderBy('sma.assigned_at', 'desc').execute();
  }

  async assignMarket(employeeId: string, platformId?: string, channelId?: string) {
    // Check if employee exists
    const emp = await this.kysely.db
      .selectFrom('employees')
      .select(['id', 'status'])
      .where('id', '=', employeeId as any)
      .executeTakeFirst();

    if (!emp) {
      throw new BadRequestException(`Nhân viên #${employeeId} không tồn tại`);
    }

    // Check existing assignment
    let checkQuery = this.kysely.db
      .selectFrom('sale_market_assignments')
      .selectAll()
      .where('employee_id', '=', employeeId as any);

    if (platformId) {
      checkQuery = checkQuery.where('platform_id', '=', platformId as any);
    } else {
      checkQuery = checkQuery.where('platform_id', 'is', null);
    }

    if (channelId) {
      checkQuery = checkQuery.where('channel_id', '=', channelId as any);
    } else {
      checkQuery = checkQuery.where('channel_id', 'is', null);
    }

    const existing = await checkQuery.executeTakeFirst();

    if (existing) {
      if (!existing.is_active) {
        const [reactivated] = await this.kysely.db
          .updateTable('sale_market_assignments')
          .set({ is_active: true, assigned_at: new Date() })
          .where('id', '=', existing.id)
          .returningAll()
          .execute();
        return reactivated;
      }
      return existing;
    }

    const [assignment] = await this.kysely.db
      .insertInto('sale_market_assignments')
      .values({
        employee_id: employeeId as any,
        platform_id: platformId ? (platformId as any) : null,
        channel_id: channelId ? (channelId as any) : null,
        is_active: true,
      })
      .returningAll()
      .execute();

    return assignment;
  }

  async deactivateMarketAssignment(id: string) {
    const [assignment] = await this.kysely.db
      .updateTable('sale_market_assignments')
      .set({ is_active: false })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    if (!assignment) {
      throw new NotFoundException(`Market assignment #${id} không tồn tại`);
    }

    return assignment;
  }

  // --- ACQUISITION OVERVIEW METRICS ---
  async getAcquisitionOverview(user?: any) {
    const db = this.kysely.db;
    let scopedSaleIds: string[] | null = null;

    if (user) {
      const roles: string[] = user.roles || [];
      const isElevated = roles.includes('ADMIN') || roles.includes('BOSS') || roles.includes('SUPER_ADMIN');
      if (!isElevated) {
        if (roles.includes('SALES_TEAM_LEADER') && user.employeeId) {
          const teamMemberIds = await this.resolveTeamMemberIds(String(user.employeeId));
          scopedSaleIds = [...new Set([String(user.employeeId), ...teamMemberIds])];
        } else if (user.employeeId) {
          scopedSaleIds = [String(user.employeeId)];
        } else {
          scopedSaleIds = [];
        }
      }
    }

    let baseLeads = db.selectFrom('leads as l');
    if (scopedSaleIds !== null) {
      if (scopedSaleIds.length > 0) {
        baseLeads = baseLeads.where('l.assigned_sale_id', 'in', scopedSaleIds as any);
      } else {
        baseLeads = baseLeads.where(sql`1 = 0` as any);
      }
    }

    // Total leads count
    const totalRow = await baseLeads.select(sql<number>`count(l.id)`.as('total')).executeTakeFirst();
    const totalLeads = Number(totalRow?.total || 0);

    // Unassigned leads count (Only global elevated Admin/Boss see company unassigned pool)
    let unassignedLeads = 0;
    if (scopedSaleIds === null) {
      const unassignedRow = await db
        .selectFrom('leads as l')
        .where('l.assigned_sale_id', 'is', null)
        .select(sql<number>`count(l.id)`.as('unassigned'))
        .executeTakeFirst();
      unassignedLeads = Number(unassignedRow?.unassigned || 0);
    }

    // Converted leads count
    const convertedRow = await baseLeads
      .where('l.status', '=', 'CONVERTED')
      .select(sql<number>`count(l.id)`.as('converted'))
      .executeTakeFirst();
    const convertedLeads = Number(convertedRow?.converted || 0);

    const conversionRate = totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 1000) / 10 : 0;

    // Breakdown by Platform (strictly scoped in DB join)
    const platformsData = await db
      .selectFrom('platforms as p')
      .leftJoin('leads as l', (join) => {
        let j = join.onRef('l.platform_id', '=', 'p.id');
        if (scopedSaleIds !== null) {
          if (scopedSaleIds.length > 0) {
            j = j.on('l.assigned_sale_id', 'in', scopedSaleIds as any);
          } else {
            j = j.on(sql`1 = 0`);
          }
        }
        return j;
      })
      .select([
        'p.id',
        'p.code',
        'p.name',
        'p.is_active',
        sql<number>`count(l.id)`.as('total_leads'),
        sql<number>`count(l.id) filter (where l.status = 'CONVERTED')`.as('converted_leads'),
      ])
      .groupBy(['p.id', 'p.code', 'p.name', 'p.is_active'])
      .orderBy('total_leads', 'desc')
      .execute();

    // Breakdown by Channel (strictly scoped in DB join)
    const channelsData = await db
      .selectFrom('channels as c')
      .leftJoin('leads as l', (join) => {
        let j = join.onRef('l.channel_id', '=', 'c.id');
        if (scopedSaleIds !== null) {
          if (scopedSaleIds.length > 0) {
            j = j.on('l.assigned_sale_id', 'in', scopedSaleIds as any);
          } else {
            j = j.on(sql`1 = 0`);
          }
        }
        return j;
      })
      .select([
        'c.id',
        'c.code',
        'c.name',
        'c.is_active',
        sql<number>`count(l.id)`.as('total_leads'),
        sql<number>`count(l.id) filter (where l.status = 'CONVERTED')`.as('converted_leads'),
      ])
      .groupBy(['c.id', 'c.code', 'c.name', 'c.is_active'])
      .orderBy('total_leads', 'desc')
      .execute();

    return {
      totalLeads,
      unassignedLeads,
      convertedLeads,
      conversionRate,
      platforms: platformsData.map((p) => ({
        id: String(p.id),
        code: p.code,
        name: p.name,
        isActive: Boolean(p.is_active),
        totalLeads: Number(p.total_leads),
        convertedLeads: Number(p.converted_leads),
        conversionRate:
          Number(p.total_leads) > 0
            ? Math.round((Number(p.converted_leads) / Number(p.total_leads)) * 1000) / 10
            : 0,
      })),
      channels: channelsData.map((c) => ({
        id: String(c.id),
        code: c.code,
        name: c.name,
        isActive: Boolean(c.is_active),
        totalLeads: Number(c.total_leads),
        convertedLeads: Number(c.converted_leads),
        conversionRate:
          Number(c.total_leads) > 0
            ? Math.round((Number(c.converted_leads) / Number(c.total_leads)) * 1000) / 10
            : 0,
      })),
    };
  }

  // --- LEAD DISTRIBUTION BY SALE ---
  async getLeadDistribution(user?: any) {
    const db = this.kysely.db;
    let empQuery = db
      .selectFrom('employees as e')
      .innerJoin('positions as pos', 'pos.id', 'e.position_id')
      .leftJoin('team_memberships as tm', (join) =>
        join.onRef('tm.employee_id', '=', 'e.id').on(sql`tm.effective_range @> NOW()`),
      )
      .leftJoin('teams as t', 't.id', 'tm.team_id')
      .leftJoin('leads as l', 'l.assigned_sale_id', 'e.id')
      .leftJoin('sale_market_assignments as sma', (join) =>
        join.onRef('sma.employee_id', '=', 'e.id').on('sma.is_active', '=', sql`true`),
      )
      .where('e.status', '=', 'ACTIVE')
      .where('pos.code', 'in', ['SALE', 'SALES_LEADER', 'SALES_TEAM_LEADER']);

    if (user) {
      const roles: string[] = user.roles || [];
      const isElevated = roles.includes('ADMIN') || roles.includes('BOSS') || roles.includes('SUPER_ADMIN');
      if (!isElevated) {
        if (roles.includes('SALES_TEAM_LEADER') && user.employeeId) {
          const teamMemberIds = await this.resolveTeamMemberIds(String(user.employeeId));
          const allowedIds = [...new Set([String(user.employeeId), ...teamMemberIds])];
          empQuery = empQuery.where('e.id', 'in', allowedIds as any);
        } else if (user.employeeId) {
          empQuery = empQuery.where('e.id', '=', String(user.employeeId) as any);
        } else {
          empQuery = empQuery.where(sql`1 = 0` as any);
        }
      }
    }

    const rows = await empQuery
      .select([
        'e.id as employee_id',
        'e.employee_code',
        'e.full_name',
        't.name as team_name',
        sql<number>`count(distinct l.id)`.as('assigned_leads_count'),
        sql<number>`count(distinct l.id) filter (where l.status = 'CONVERTED')`.as('converted_leads_count'),
        sql<number>`count(distinct sma.id)`.as('active_assignments_count'),
      ])
      .groupBy(['e.id', 'e.employee_code', 'e.full_name', 't.name'])
      .orderBy('assigned_leads_count', 'desc')
      .execute();

    return rows.map((r) => ({
      employeeId: String(r.employee_id),
      employeeCode: r.employee_code,
      fullName: r.full_name,
      teamName: r.team_name || 'Chưa gán team',
      assignedLeadsCount: Number(r.assigned_leads_count),
      convertedLeadsCount: Number(r.converted_leads_count),
      activeAssignmentsCount: Number(r.active_assignments_count),
      conversionRate:
        Number(r.assigned_leads_count) > 0
          ? Math.round((Number(r.converted_leads_count) / Number(r.assigned_leads_count)) * 1000) / 10
          : 0,
    }));
  }

  // --- SALES CONTENTS ---
  async findAllSalesContents() {
    return this.kysely.db
      .selectFrom('sales_contents as sc')
      .innerJoin('employees as e', 'e.id', 'sc.creator_employee_id')
      .leftJoin('platforms as p', 'p.id', 'sc.platform_id')
      .leftJoin('channels as c', 'c.id', 'sc.channel_id')
      .select([
        'sc.id',
        'sc.content_title',
        'sc.url',
        'sc.published_at',
        'sc.created_at',
        'sc.creator_employee_id',
        'e.full_name as creator_name',
        'e.employee_code as creator_code',
        'sc.platform_id',
        'p.name as platform_name',
        'sc.channel_id',
        'c.name as channel_name',
      ])
      .orderBy('sc.created_at', 'desc')
      .execute();
  }

  async createSalesContent(dto: CreateSalesContentDto) {
    const [content] = await this.kysely.db
      .insertInto('sales_contents')
      .values({
        content_title: dto.contentTitle,
        creator_employee_id: dto.creatorEmployeeId as any,
        platform_id: dto.platformId ? (dto.platformId as any) : null,
        channel_id: dto.channelId ? (dto.channelId as any) : null,
        campaign_id: dto.campaignId ? (dto.campaignId as any) : null,
        url: dto.url || null,
      })
      .returningAll()
      .execute();

    return content;
  }
}
