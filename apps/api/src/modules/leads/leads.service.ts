import { Injectable, NotFoundException, BadRequestException, ForbiddenException, ConflictException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadQualityDto, LeadQuality } from './dto/update-lead-quality.dto';
import { UpdateLeadStatusDto, LeadStatus } from './dto/update-lead-status.dto';
import { AssignLeadDto } from './dto/assign-lead.dto';
import { MarkFailedDto } from './dto/mark-failed.dto';
import { ConvertLeadToDealDto } from './dto/convert-lead-to-deal.dto';
import { UpdateLeadInfoDto } from './dto/update-lead-info.dto';
import { TeamsService } from '../teams/teams.service';
import { sql } from 'kysely';

export interface FindLeadsFilter {
  page?: number;
  limit?: number;
  q?: string;
  status?: string;
  quality?: string;
  assignedSaleId?: string;
  platformId?: string;
  channelId?: string;
  unassigned?: boolean;
  assignedSaleIdOnly?: string;   // SALE role: restricted to own leads
  assignedSaleIdIn?: string[];   // SALES_TEAM_LEADER: restricted to team member leads
}

import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LeadsService {
  constructor(
    private readonly kysely: KyselyService,
    private readonly teamsService: TeamsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private async resolveTeamMemberIds(employeeId: string): Promise<string[]> {
    const team = await this.teamsService.getCurrentLedTeam(employeeId);
    if (!team) return [];
    const members = await this.teamsService.getCurrentTeamMembers(team.id);
    return members.map((m) => String((m as any).id));
  }

  async createLead(dto: CreateLeadDto, actor?: any): Promise<any> {
    let assignedSaleId = dto.assignedSaleId ? String(dto.assignedSaleId) : null;
    let autoAssigned = false;
    let assignmentGap = false;
    let assignmentGapReason: string | null = null;

    const roles: string[] = actor?.roles || [];
    const isElevated = roles.includes('ADMIN') || roles.includes('BOSS') || roles.includes('SUPER_ADMIN');
    const isSalesLeader = roles.includes('SALES_TEAM_LEADER');
    const isSale = roles.includes('SALE');

    // Default assignedSaleId to current user if creator is a SALE employee
    if (!assignedSaleId && actor?.employeeId && (isSale || (!isElevated && !isSalesLeader))) {
      assignedSaleId = String(actor.employeeId);
    }

    // Validate assignedSaleId if provided
    if (assignedSaleId) {
      const targetEmployee = await this.kysely.db
        .selectFrom('employees as e')
        .leftJoin('positions as p', 'p.id', 'e.position_id')
        .select(['e.id', 'e.status', 'p.code as position_code'])
        .where('e.id', '=', assignedSaleId as any)
        .executeTakeFirst();

      if (!targetEmployee || targetEmployee.status !== 'ACTIVE') {
        throw new BadRequestException(`Nhân viên được gán [${assignedSaleId}] không tồn tại hoặc không ở trạng thái ACTIVE`);
      }

      const validSalePositions = ['SALE', 'SALES_LEADER', 'SALES_TEAM_LEADER', 'BOSS'];
      if (targetEmployee.position_code && !validSalePositions.includes(targetEmployee.position_code)) {
        throw new BadRequestException(`Nhân viên được gán [${assignedSaleId}] không thuộc vị trí kinh doanh hợp lệ (SALE hoặc SALES_TEAM_LEADER)`);
      }

      if (actor) {
        if (isSale && !isElevated && !isSalesLeader) {
          // Normal SALE can ONLY assign to self
          if (actor.employeeId && String(assignedSaleId) !== String(actor.employeeId)) {
            throw new ForbiddenException('Nhân viên kinh doanh không được phép gán Lead cho nhân viên khác');
          }
        } else if (isSalesLeader && !isElevated) {
          // Sales Leader can only assign to members of their led team or themselves
          if (actor.employeeId) {
            const teamMemberIds = await this.resolveTeamMemberIds(String(actor.employeeId));
            if (!teamMemberIds.includes(String(assignedSaleId)) && String(assignedSaleId) !== String(actor.employeeId)) {
              throw new ForbiddenException('Trưởng nhóm kinh doanh chỉ được phân công Lead cho thành viên trong nhóm phụ trách');
            }
          }
        }
      }
    }

    // Auto-assignment via Market Assignment if assignedSaleId is not provided and both platformId & channelId are present
    if (!assignedSaleId && dto.platformId && dto.channelId) {
      const activeAssignments = await this.kysely.db
        .selectFrom('sale_market_assignments')
        .select(['id', 'employee_id'])
        .where('platform_id', '=', dto.platformId as any)
        .where('channel_id', '=', dto.channelId as any)
        .where('is_active', '=', true)
        .execute();

      if (activeAssignments.length === 1) {
        assignedSaleId = String(activeAssignments[0].employee_id);
        autoAssigned = true;
      } else if (activeAssignments.length > 1) {
        assignmentGap = true;
        assignmentGapReason = 'MULTIPLE_ACTIVE_SALES_FOUND';
      } else {
        assignmentGap = true;
        assignmentGapReason = 'NO_ACTIVE_MARKET_ASSIGNMENT';
      }
    }

    const creatorEmployeeId = dto.creatorEmployeeId ? String(dto.creatorEmployeeId) : (actor?.employeeId ? String(actor.employeeId) : null);

    return await this.kysely.db.transaction().execute(async (trx) => {
      const [lead] = await trx
        .insertInto('leads')
        .values({
          full_name: dto.fullName,
          phone: dto.phone || null,
          email: dto.email || null,
          platform_id: dto.platformId ? (dto.platformId as any) : null,
          channel_id: dto.channelId ? (dto.channelId as any) : null,
          campaign_id: dto.campaignId ? (dto.campaignId as any) : null,
          sales_content_id: dto.salesContentId ? (dto.salesContentId as any) : null,
          creator_employee_id: creatorEmployeeId ? (creatorEmployeeId as any) : null,
          assigned_sale_id: assignedSaleId ? (assignedSaleId as any) : null,
          landing_page: dto.landingPage || null,
          external_id: dto.externalId || null,
          utm_source: dto.utmSource || null,
          utm_medium: dto.utmMedium || null,
          utm_campaign: dto.utmCampaign || null,
          quality: 'UNCLASSIFIED',
          status: 'NEW',
        })
        .returningAll()
        .execute();

      if (assignedSaleId) {
        await trx
          .insertInto('lead_assignment_history')
          .values({
            lead_id: lead.id,
            from_sale_id: null,
            to_sale_id: assignedSaleId as any,
            assigned_by_employee_id: creatorEmployeeId ? (creatorEmployeeId as any) : null,
            reason: autoAssigned ? 'Auto-assigned via Market Assignment' : 'Gán ban đầu khi tạo Lead',
          })
          .execute();

        if (this.notificationsService) {
          if (autoAssigned) {
            await this.notificationsService.createNotification(
              {
                employeeId: assignedSaleId,
                eventType: 'LEAD_AUTO_ASSIGNED',
                title: 'Lead mới được phân công tự động',
                content: `Bạn được phân công phụ trách Lead: ${lead.full_name}`,
                deepLinkUrl: `/leads/${lead.id}`,
                entityType: 'LEAD',
                entityId: String(lead.id),
              },
              trx,
            );
          } else if (!actor?.employeeId || String(actor.employeeId) !== String(assignedSaleId)) {
            await this.notificationsService.createNotification(
              {
                employeeId: assignedSaleId,
                eventType: 'LEAD_ASSIGNED',
                title: 'Lead mới được phân công',
                content: `Bạn được phân công phụ trách Lead: ${lead.full_name}`,
                deepLinkUrl: `/leads/${lead.id}`,
                entityType: 'LEAD',
                entityId: String(lead.id),
              },
              trx,
            );
          }
        }
      }

      if (assignmentGap && this.notificationsService) {
        await this.notificationsService.notifyRoles(
          ['BOSS', 'ADMIN'],
          {
            eventType: 'LEAD_UNASSIGNED_GAP',
            title: 'Cảnh báo: Lead chưa được phân công',
            content: `Lead ${lead.full_name} không được gán Sale tự động (${assignmentGapReason})`,
            deepLinkUrl: `/leads/${lead.id}`,
            entityType: 'LEAD',
            entityId: String(lead.id),
          },
          trx,
        );
      }

      return {
        ...lead,
        assignmentGap,
        assignmentGapReason,
      };
    });
  }

  async findLeads(filter: FindLeadsFilter) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(filter.limit) || 10));
    const offset = (page - 1) * limit;

    let query = this.kysely.db
      .selectFrom('leads as l')
      .leftJoin('platforms as p', 'p.id', 'l.platform_id')
      .leftJoin('channels as c', 'c.id', 'l.channel_id')
      .leftJoin('employees as sale', 'sale.id', 'l.assigned_sale_id')
      .leftJoin('employees as creator', 'creator.id', 'l.creator_employee_id')
      .leftJoin('sales_contents as sc', 'sc.id', 'l.sales_content_id');

    // Object-level auth: restrict SALE role to own leads
    if (filter.assignedSaleIdOnly) {
      query = query.where('l.assigned_sale_id', '=', filter.assignedSaleIdOnly as any);
    }

    // Team-scope auth: restrict SALES_TEAM_LEADER to current team members' leads
    if (filter.assignedSaleIdIn && filter.assignedSaleIdIn.length > 0) {
      query = query.where('l.assigned_sale_id', 'in', filter.assignedSaleIdIn as any);
    } else if (filter.assignedSaleIdIn && filter.assignedSaleIdIn.length === 0) {
      // Leader has no team members → return empty
      query = query.where(sql`1 = 0` as any);
    }

    if (filter.unassigned || filter.assignedSaleId === 'unassigned') {
      query = query.where('l.assigned_sale_id', 'is', null);
    } else if (filter.assignedSaleId === 'assigned') {
      query = query.where('l.assigned_sale_id', 'is not', null);
    } else if (filter.assignedSaleId) {
      query = query.where('l.assigned_sale_id', '=', filter.assignedSaleId as any);
    }

    if (filter.status) {
      query = query.where('l.status', '=', filter.status);
    }

    if (filter.quality) {
      query = query.where('l.quality', '=', filter.quality);
    }

    if (filter.platformId) {
      query = query.where('l.platform_id', '=', filter.platformId as any);
    }

    if (filter.channelId) {
      query = query.where('l.channel_id', '=', filter.channelId as any);
    }

    if (filter.q) {
      const searchTerm = `%${filter.q}%`;
      query = query.where((eb) =>
        eb.or([
          eb('l.full_name', 'ilike', searchTerm),
          eb('l.phone', 'ilike', searchTerm),
          eb('l.email', 'ilike', searchTerm),
        ]),
      );
    }

    // Total Count
    const countResult = await query
      .select(sql<number>`count(l.id)`.as('total'))
      .executeTakeFirst();
    const total = Number(countResult?.total || 0);

    // Paginated Rows
    const data = await query
      .select([
        'l.id',
        'l.full_name',
        'l.phone',
        'l.email',
        'l.quality',
        'l.not_potential_reason',
        'l.status',
        'l.failed_reason',
        'l.landing_page',
        'l.external_id',
        'l.utm_source',
        'l.utm_medium',
        'l.utm_campaign',
        'l.created_at',
        'l.updated_at',
        'l.platform_id',
        'p.name as platform_name',
        'l.channel_id',
        'c.name as channel_name',
        'l.assigned_sale_id',
        'sale.full_name as assigned_sale_name',
        'sale.employee_code as assigned_sale_code',
        'l.creator_employee_id',
        'creator.full_name as creator_employee_name',
        'l.sales_content_id',
        'sc.content_title',
      ])
      .orderBy('l.created_at', 'desc')
      .offset(offset)
      .limit(limit)
      .execute();

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findLeadById(id: string) {
    const lead = await this.kysely.db
      .selectFrom('leads as l')
      .leftJoin('platforms as p', 'p.id', 'l.platform_id')
      .leftJoin('channels as c', 'c.id', 'l.channel_id')
      .leftJoin('employees as sale', 'sale.id', 'l.assigned_sale_id')
      .leftJoin('employees as creator', 'creator.id', 'l.creator_employee_id')
      .leftJoin('sales_contents as sc', 'sc.id', 'l.sales_content_id')
      .select([
        'l.id',
        'l.full_name',
        'l.phone',
        'l.email',
        'l.quality',
        'l.not_potential_reason',
        'l.status',
        'l.failed_reason',
        'l.landing_page',
        'l.external_id',
        'l.utm_source',
        'l.utm_medium',
        'l.utm_campaign',
        'l.created_at',
        'l.updated_at',
        'l.platform_id',
        'p.name as platform_name',
        'l.channel_id',
        'c.name as channel_name',
        'l.assigned_sale_id',
        'sale.full_name as assigned_sale_name',
        'sale.employee_code as assigned_sale_code',
        'l.creator_employee_id',
        'creator.full_name as creator_employee_name',
        'l.sales_content_id',
        'sc.content_title',
      ])
      .where('l.id', '=', id as any)
      .executeTakeFirst();

    if (!lead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    // Fetch Assignment History
    const assignmentHistory = await this.kysely.db
      .selectFrom('lead_assignment_history as lah')
      .leftJoin('employees as from_sale', 'from_sale.id', 'lah.from_sale_id')
      .innerJoin('employees as to_sale', 'to_sale.id', 'lah.to_sale_id')
      .leftJoin('employees as by_emp', 'by_emp.id', 'lah.assigned_by_employee_id')
      .select([
        'lah.id',
        'lah.assigned_at',
        'lah.reason',
        'from_sale.full_name as from_sale_name',
        'to_sale.full_name as to_sale_name',
        'by_emp.full_name as assigned_by_name',
      ])
      .where('lah.lead_id', '=', id as any)
      .orderBy('lah.assigned_at', 'desc')
      .execute();

    // Fetch Activities
    const activities = await this.kysely.db
      .selectFrom('sales_activities as sa')
      .innerJoin('employees as e', 'e.id', 'sa.employee_id')
      .select([
        'sa.id',
        'sa.activity_type',
        'sa.occurred_at',
        'sa.next_follow_up_at',
        'sa.result_note',
        'sa.created_at',
        'e.full_name as employee_name',
      ])
      .where('sa.lead_id', '=', id as any)
      .orderBy('sa.occurred_at', 'desc')
      .execute();

    // Fetch associated deal if already converted
    const deal = await this.kysely.db
      .selectFrom('deals as d')
      .leftJoin('accounts as a', 'a.id', 'd.account_id')
      .select([
        'd.id',
        'd.deal_name',
        'd.status',
        'd.expected_value',
        'd.account_id',
        'a.company_name as account_name',
      ])
      .where('d.lead_id', '=', id as any)
      .executeTakeFirst();

    return {
      ...lead,
      deal: deal || null,
      assignmentHistory,
      activities,
    };
  }

  async updateLeadInfo(id: string, dto: UpdateLeadInfoDto) {
    const fullName = dto.fullName.trim();
    if (!fullName) {
      throw new BadRequestException('Lead name is required');
    }

    const updateValues = {
      full_name: fullName,
      updated_at: new Date(),
      ...(dto.phone !== undefined ? { phone: dto.phone?.trim() || null } : {}),
      ...(dto.email !== undefined ? { email: dto.email?.trim() || null } : {}),
    };

    const updatedLead = await this.kysely.db
      .updateTable('leads')
      .set(updateValues)
      .where('id', '=', id as any)
      .returningAll()
      .executeTakeFirst();

    if (!updatedLead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    return updatedLead;
  }

  async qualifyLead(id: string, dto: UpdateLeadQualityDto) {
    const lead = await this.kysely.db
      .selectFrom('leads')
      .select(['id', 'quality', 'status'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!lead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    if (dto.quality === LeadQuality.NOT_POTENTIAL && (!dto.notPotentialReason || dto.notPotentialReason.trim() === '')) {
      throw new BadRequestException('not_potential_reason is required when quality is NOT_POTENTIAL');
    }

    const [updatedLead] = await this.kysely.db
      .updateTable('leads')
      .set({
        quality: dto.quality,
        not_potential_reason: dto.quality === LeadQuality.NOT_POTENTIAL ? dto.notPotentialReason : null,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updatedLead;
  }

  async updateStatus(id: string, dto: UpdateLeadStatusDto, actor?: any) {
    const lead = await this.kysely.db
      .selectFrom('leads')
      .select(['id', 'status'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!lead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    if (dto.status === LeadStatus.CONVERTED) {
      const existingDeal = await this.kysely.db
        .selectFrom('deals')
        .select(['id', 'deal_name', 'status'])
        .where('lead_id', '=', id as any)
        .executeTakeFirst();

      if (existingDeal) {
        const res = await this.restoreConverted(id, actor);
        return res.lead;
      }
      throw new BadRequestException('Use POST /leads/:id/convert-to-deal to convert a Lead to a Deal');
    }

    if (dto.status === LeadStatus.FAILED) {
      throw new BadRequestException('Use POST /leads/:id/mark-failed with a failedReason to set status to FAILED');
    }

    const [updatedLead] = await this.kysely.db
      .updateTable('leads')
      .set({
        status: dto.status,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    if (actor?.employeeId) {
      await this.kysely.db
        .insertInto('audit_logs')
        .values({
          actor_employee_id: actor.employeeId as any,
          actor_type: 'USER',
          action: 'LEAD_STATUS_UPDATED',
          entity_type: 'LEAD',
          entity_id: id as any,
          payload_before_sanitized: JSON.stringify({ status: lead.status }),
          payload_after_sanitized: JSON.stringify({ status: dto.status }),
        })
        .execute();
    }

    return updatedLead;
  }

  async restoreConverted(id: string, actor?: any) {
    const lead = await this.kysely.db
      .selectFrom('leads')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!lead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    const existingDeal = await this.kysely.db
      .selectFrom('deals')
      .selectAll()
      .where('lead_id', '=', id as any)
      .executeTakeFirst();

    if (!existingDeal) {
      throw new BadRequestException(
        'Lead chưa có Deal liên kết. Vui lòng sử dụng chức năng "Chuyển đổi thành Deal" để tạo Deal mới.',
      );
    }

    let updatedLead = lead;
    if (lead.status !== LeadStatus.CONVERTED) {
      const [res] = await this.kysely.db
        .updateTable('leads')
        .set({
          status: LeadStatus.CONVERTED,
          updated_at: new Date(),
        })
        .where('id', '=', id as any)
        .returningAll()
        .execute();
      updatedLead = res;

      if (actor?.employeeId) {
        await this.kysely.db
          .insertInto('audit_logs')
          .values({
            actor_employee_id: actor.employeeId as any,
            actor_type: 'USER',
            action: 'LEAD_RESTORE_CONVERTED',
            entity_type: 'LEAD',
            entity_id: id as any,
            payload_before_sanitized: JSON.stringify({ status: lead.status }),
            payload_after_sanitized: JSON.stringify({ status: LeadStatus.CONVERTED, deal_id: existingDeal.id }),
          })
          .execute();
      }
    }

    return {
      success: true,
      lead: updatedLead,
      deal: existingDeal,
    };
  }

  async assignLead(id: string, dto: AssignLeadDto, currentEmployeeId?: string, actor?: any) {
    const lead = await this.kysely.db
      .selectFrom('leads')
      .select(['id', 'assigned_sale_id'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!lead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    // Validate target employee
    const targetEmployee = await this.kysely.db
      .selectFrom('employees as e')
      .leftJoin('positions as p', 'p.id', 'e.position_id')
      .select(['e.id', 'e.status', 'p.code as position_code'])
      .where('e.id', '=', dto.toSaleId as any)
      .executeTakeFirst();

    if (!targetEmployee || targetEmployee.status !== 'ACTIVE') {
      throw new BadRequestException(`Nhân viên được gán [${dto.toSaleId}] không tồn tại hoặc không ở trạng thái ACTIVE`);
    }

    const validSalePositions = ['SALE', 'SALES_LEADER', 'SALES_TEAM_LEADER', 'BOSS'];
    if (targetEmployee.position_code && !validSalePositions.includes(targetEmployee.position_code)) {
      throw new BadRequestException(`Nhân viên được gán [${dto.toSaleId}] không thuộc vị trí kinh doanh hợp lệ (SALE hoặc SALES_TEAM_LEADER)`);
    }

    // Authorization check
    if (actor) {
      const roles: string[] = actor.roles || [];
      const isElevated = roles.includes('ADMIN') || roles.includes('BOSS') || roles.includes('SUPER_ADMIN');
      const isSalesLeader = roles.includes('SALES_TEAM_LEADER');
      const isSale = roles.includes('SALE');

      if (isSale && !isElevated && !isSalesLeader) {
        throw new ForbiddenException('Nhân viên kinh doanh không có quyền tự phân công Lead');
      }

      if (isSalesLeader && !isElevated && actor.employeeId) {
        const teamMemberIds = await this.resolveTeamMemberIds(String(actor.employeeId));
        if (!teamMemberIds.includes(String(dto.toSaleId)) && String(dto.toSaleId) !== String(actor.employeeId)) {
          throw new ForbiddenException('Trưởng nhóm kinh doanh chỉ được phân công Lead cho thành viên trong nhóm phụ trách');
        }
      }
    }

    // Log assignment history & update lead within atomic transaction
    return await this.kysely.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('lead_assignment_history')
        .values({
          lead_id: id as any,
          from_sale_id: lead.assigned_sale_id ? (lead.assigned_sale_id as any) : null,
          to_sale_id: dto.toSaleId as any,
          assigned_by_employee_id: currentEmployeeId ? (currentEmployeeId as any) : null,
          reason: dto.reason || null,
        })
        .execute();

      // Update lead assigned_sale_id
      const [updatedLead] = await trx
        .updateTable('leads')
        .set({
          assigned_sale_id: dto.toSaleId as any,
          updated_at: new Date(),
        })
        .where('id', '=', id as any)
        .returningAll()
        .execute();

      if (this.notificationsService) {
        await this.notificationsService.createNotification(
          {
            employeeId: dto.toSaleId,
            eventType: 'LEAD_ASSIGNED',
            title: 'Lead được phân công cho bạn',
            content: `Lead ${updatedLead.full_name || `#${id}`} đã được phân công cho bạn phụ trách.`,
            deepLinkUrl: `/leads/${id}`,
            entityType: 'LEAD',
            entityId: String(id),
          },
          trx,
        );
      }

      return updatedLead;
    });
  }

  async markFailed(id: string, dto: MarkFailedDto) {
    if (!dto.failedReason || dto.failedReason.trim() === '') {
      throw new BadRequestException('failed_reason is required when marking lead as FAILED');
    }

    const lead = await this.kysely.db
      .selectFrom('leads')
      .select(['id', 'status'])
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!lead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    const [updatedLead] = await this.kysely.db
      .updateTable('leads')
      .set({
        status: LeadStatus.FAILED,
        failed_reason: dto.failedReason,
        updated_at: new Date(),
      })
      .where('id', '=', id as any)
      .returningAll()
      .execute();

    return updatedLead;
  }

  async convertToDeal(id: string, dto: ConvertLeadToDealDto, currentEmployeeId?: string, actor?: any) {
    const lead = await this.kysely.db
      .selectFrom('leads')
      .selectAll()
      .where('id', '=', id as any)
      .executeTakeFirst();

    if (!lead) {
      throw new NotFoundException(`Lead [${id}] not found`);
    }

    // BUSINESS RULE CHECK: quality MUST be POTENTIAL
    if (lead.quality !== LeadQuality.POTENTIAL) {
      throw new BadRequestException(
        `Cannot convert Lead [${id}] to Deal. Lead quality must be POTENTIAL, but is currently ${lead.quality}`,
      );
    }

    // BUSINESS RULE CHECK: Lead MUST NOT already have an existing deal
    const existingDeal = await this.kysely.db
      .selectFrom('deals')
      .select(['id', 'deal_name', 'status'])
      .where('lead_id', '=', id as any)
      .executeTakeFirst();

    if (existingDeal) {
      throw new BadRequestException(
        `Lead [${id}] đã có Deal liên kết (#${existingDeal.id} - "${existingDeal.deal_name}"). Vui lòng dùng chức năng "Đưa về Đã chuyển đổi" hoặc "Chỉnh sửa Deal".`,
      );
    }

    // BUSINESS RULE CHECK: status MUST NOT be CONVERTED
    if (lead.status === LeadStatus.CONVERTED) {
      throw new BadRequestException(`Lead [${id}] is already CONVERTED`);
    }

    const assignedSaleId = lead.assigned_sale_id || currentEmployeeId;
    if (!assignedSaleId) {
      throw new BadRequestException('Lead must be assigned to a Sale before converting to Deal');
    }

    return await this.kysely.db.transaction().execute(async (trx) => {
      // 1. Create or Find Account
      let account: any = await trx
        .selectFrom('accounts')
        .select(['id', 'company_name'])
        .where((eb) =>
          eb.or([
            eb('company_name', '=', dto.companyName),
            ...(dto.taxCode ? [eb('tax_code', '=', dto.taxCode)] : []),
          ]),
        )
        .executeTakeFirst();

      if (!account) {
        const [newAccount] = await trx
          .insertInto('accounts')
          .values({
            company_name: dto.companyName,
            tax_code: dto.taxCode || null,
            phone: dto.contactPhone || lead.phone || null,
            email: dto.contactEmail || lead.email || null,
          })
          .returningAll()
          .execute();
        account = newAccount;
      }

      // 2. Create or Find Contact under Account
      let contact: any = await trx
        .selectFrom('contacts')
        .selectAll()
        .where('account_id', '=', account.id)
        .where((eb) =>
          eb.or([
            eb('full_name', '=', dto.contactName),
            ...(dto.contactPhone ? [eb('phone', '=', dto.contactPhone)] : []),
            ...(dto.contactEmail ? [eb('email', '=', dto.contactEmail)] : []),
          ]),
        )
        .executeTakeFirst();

      if (!contact) {
        const [newContact] = await trx
          .insertInto('contacts')
          .values({
            account_id: account.id,
            full_name: dto.contactName,
            phone: dto.contactPhone || lead.phone || null,
            email: dto.contactEmail || lead.email || null,
            is_primary: true,
          })
          .returningAll()
          .execute();
        contact = newContact;
      }

      // 3. Create Deal
      let deal: any;
      try {
        const [newDeal] = await trx
          .insertInto('deals')
          .values({
            account_id: account.id,
            primary_contact_id: contact.id,
            lead_id: lead.id,
            assigned_sale_id: assignedSaleId as any,
            closing_sale_id: assignedSaleId as any,
            deal_name: dto.dealName,
            expected_value: dto.expectedValue || 0,
            status: 'OPEN',
          })
          .returningAll()
          .execute();
        deal = newDeal;
      } catch (dbErr: any) {
        if (dbErr?.code === '23505' || dbErr?.message?.includes('deals_lead_id_key')) {
          throw new ConflictException('Lead này đã được chuyển đổi thành Deal');
        }
        throw dbErr;
      }

      // 4. Transition Lead status to CONVERTED
      await trx
        .updateTable('leads')
        .set({
          status: LeadStatus.CONVERTED,
          updated_at: new Date(),
        })
        .where('id', '=', lead.id)
        .execute();

      // Audit log
      if (actor?.employeeId) {
        await trx
          .insertInto('audit_logs')
          .values({
            actor_employee_id: actor.employeeId as any,
            actor_type: 'USER',
            action: 'LEAD_CONVERTED_TO_DEAL',
            entity_type: 'LEAD',
            entity_id: lead.id as any,
            payload_after_sanitized: JSON.stringify({
              deal_id: deal.id,
              account_id: account.id,
              contact_id: contact.id,
            }),
          })
          .execute();
      }

      return {
        deal,
        account,
        contact,
        leadId: lead.id,
      };
    });
  }
}
