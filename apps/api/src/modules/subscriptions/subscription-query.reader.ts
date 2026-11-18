import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { KyselyService } from '../../database/kysely.service';
import { sql, RawBuilder } from 'kysely';
import { QuerySubscriptionDto } from './dto/query-subscription.dto';

interface SubscriptionInstallmentRow {
  id: string | number;
  installment_number: number;
  service_period_id: string | number | null;
  due_date: string;
  gross_amount_due: number | string;
  status: string;
}

@Injectable()
export class SubscriptionQueryReader {
  constructor(private readonly kysely: KyselyService) {}

  async getCurrentLedTeams(employeeId: string | number) {
    return await this.kysely.db
      .selectFrom('team_memberships')
      .innerJoin('teams', 'teams.id', 'team_memberships.team_id')
      .selectAll('teams')
      .where('team_memberships.employee_id', '=', employeeId as any)
      .where('team_memberships.is_leader', '=', true)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .execute();
  }

  async getCurrentTeamMembers(teamId: string | number) {
    return await this.kysely.db
      .selectFrom('team_memberships')
      .innerJoin('employees', 'employees.id', 'team_memberships.employee_id')
      .selectAll('employees')
      .where('team_memberships.team_id', '=', teamId as any)
      .where(sql`team_memberships.effective_range @> NOW()` as any)
      .execute();
  }

  async resolveSubscriptionScope(user: any): Promise<{
    isGlobal: boolean;
    saleIds: string[];
    techMemberIds: string[];
    isAccountant: boolean;
    denyAll: boolean;
  }> {
    if (!user) {
      return { isGlobal: false, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: true };
    }
    const roles: string[] = user.roles || [];
    const permissions: string[] = user.permissions || [];
    const employeeId = user.employeeId ? String(user.employeeId) : undefined;

    // 1. ADMIN & BOSS (Global executive access)
    if (roles.includes('ADMIN') || roles.includes('BOSS')) {
      return { isGlobal: true, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: false };
    }

    if (!employeeId) {
      return { isGlobal: false, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: true };
    }

    const saleIds = new Set<string>();
    const techMemberIds = new Set<string>();
    let isAccountant = false;

    // 2. SALE: Own closed order items
    if (roles.includes('SALE')) {
      saleIds.add(employeeId);
    }

    // 3. TEAM LEADERS: Sales, Dev, SEO (Temporal membership @> NOW())
    const ledTeams = await this.getCurrentLedTeams(employeeId);
    for (const team of ledTeams) {
      const members = await this.getCurrentTeamMembers(team.id);
      const memberIds = members.map((m) => String(m.id));
      memberIds.push(employeeId);

      if (team.department === 'SALES' && roles.includes('SALES_TEAM_LEADER')) {
        for (const mid of memberIds) saleIds.add(mid);
      } else if (team.department === 'DEV' && roles.includes('DEV_TEAM_LEADER')) {
        for (const mid of memberIds) techMemberIds.add(mid);
      } else if (team.department === 'SEO' && roles.includes('SEO_TEAM_LEADER')) {
        for (const mid of memberIds) techMemberIds.add(mid);
      }
    }

    // 4. ACCOUNTANT: Bound to subscriptions with approved payment plans / installments
    if (roles.includes('ACCOUNTANT')) {
      isAccountant = true;
    }

    const hasAnyAccess =
      saleIds.size > 0 || techMemberIds.size > 0 || isAccountant;

    if (!hasAnyAccess) {
      return { isGlobal: false, saleIds: [], techMemberIds: [], isAccountant: false, denyAll: true };
    }

    return {
      isGlobal: false,
      saleIds: Array.from(saleIds),
      techMemberIds: Array.from(techMemberIds),
      isAccountant,
      denyAll: false,
    };
  }

  private applyScopeFilter(baseQuery: any, scope: any) {
    if (scope.isGlobal) return baseQuery;
    if (scope.denyAll) return baseQuery.where(sql`1 = 0`);

    const conditions: RawBuilder<any>[] = [];

    // Sales filter: oi.closing_sale_id IN (...)
    if (scope.saleIds && scope.saleIds.length > 0) {
      conditions.push(sql`oi.closing_sale_id IN (${sql.join(scope.saleIds.map((id: string) => sql`${id}::bigint`))})`);
    }

    // Tech filter: Dev/SEO team members assigned to service periods or linked project
    if (scope.techMemberIds && scope.techMemberIds.length > 0) {
      const techIdsSql = sql.join(scope.techMemberIds.map((id: string) => sql`${id}::bigint`));
      conditions.push(
        sql`(
          EXISTS (
            SELECT 1 FROM service_periods sp
            JOIN service_period_assignments spa ON spa.service_period_id = sp.id
            WHERE sp.subscription_id = s.id
              AND spa.employee_id IN (${techIdsSql})
              AND spa.is_active = true
          )
          OR EXISTS (
            SELECT 1 FROM projects p
            JOIN project_assignments pa ON pa.project_id = p.id
            WHERE p.order_item_id = s.order_item_id
              AND pa.employee_id IN (${techIdsSql})
              AND pa.is_active = true
          )
        )`,
      );
    }

    // Accountant filter: Subscriptions having approved payment plan or payment allocations
    if (scope.isAccountant) {
      conditions.push(
        sql`(
          EXISTS (
            SELECT 1 FROM order_item_payment_plans oipp
            WHERE oipp.order_item_id = s.order_item_id
              AND oipp.status = 'APPROVED'
          )
          OR EXISTS (
            SELECT 1 FROM payment_installments pi
            JOIN payment_allocations pa ON pa.installment_id = pi.id
            WHERE pi.service_period_id IN (SELECT id FROM service_periods WHERE subscription_id = s.id)
          )
        )`,
      );
    }

    if (conditions.length === 0) {
      return baseQuery.where(sql`1 = 0`);
    }

    if (conditions.length === 1) {
      return baseQuery.where(conditions[0]);
    } else {
      const combined = conditions.reduce((prev, curr) => sql`${prev} OR ${curr}`);
      return baseQuery.where(sql`(${combined})`);
    }
  }

  /**
   * PHASE J: QUERY SUBSCRIPTIONS LIST (With search, filters, pagination, summary, and object authorization)
   */
  async findSubscriptions(query: QuerySubscriptionDto, user?: any) {
    const db = this.kysely.db;
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query.limit) || 10));
    const offset = (page - 1) * limit;

    const scope = await this.resolveSubscriptionScope(user);

    let baseQuery = db
      .selectFrom('subscriptions as s')
      .innerJoin('order_items as oi', 'oi.id', 's.order_item_id')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as acc', 'acc.id', 'o.account_id')
      .innerJoin('services as srv', 'srv.id', 's.service_id')
      .leftJoin('contacts as ct', 'ct.id', 'o.primary_contact_id');

    // Apply Object Authorization Scope
    baseQuery = this.applyScopeFilter(baseQuery, scope);

    if (query.status) {
      baseQuery = baseQuery.where('s.status', '=', query.status as any);
    }
    if (query.billing_interval) {
      baseQuery = baseQuery.where('s.billing_interval', '=', query.billing_interval as any);
    }
    if (query.search) {
      const searchPattern = `%${query.search.trim().toLowerCase()}%`;
      baseQuery = baseQuery.where((eb) =>
        eb.or([
          eb(sql`lower(acc.company_name)`, 'like', searchPattern),
          eb(sql`lower(srv.name)`, 'like', searchPattern),
          eb(sql`lower(o.order_code)`, 'like', searchPattern),
        ]),
      );
    }

    // Total count
    const countRes = await baseQuery
      .select((eb) => eb.fn.count('s.id').as('count'))
      .executeTakeFirst();
    const total = Number(countRes?.count || 0);

    // Rows
    const rows = await baseQuery
      .select([
        's.id',
        's.order_item_id',
        's.billing_interval',
        's.interval_count',
        sql<string>`to_char(s.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string | null>`to_char(s.end_date, 'YYYY-MM-DD')`.as('end_date'),
        sql<string | null>`to_char(s.renewal_date, 'YYYY-MM-DD')`.as('renewal_date'),
        's.auto_renew',
        's.status',
        's.created_at',
        'oi.id as order_item_id',
        'oi.net_service_value',
        'o.id as order_id',
        'o.order_code',
        'acc.id as account_id',
        'acc.company_name',
        'acc.phone as account_phone',
        'acc.email as account_email',
        'srv.id as service_id',
        'srv.name as service_name',
        'srv.code as service_code',
        'ct.full_name as contact_name',
      ])
      .orderBy('s.created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute();

    // Summary aggregates (Scoped strictly to actor's authorized subscriptions)
    let summaryBase = db
      .selectFrom('subscriptions as s')
      .innerJoin('order_items as oi', 'oi.id', 's.order_item_id');

    summaryBase = this.applyScopeFilter(summaryBase, scope);

    const summaryRows = await summaryBase
      .select([
        's.status',
        (eb) => eb.fn.count('s.id').as('cnt'),
      ])
      .groupBy('s.status')
      .execute();

    const summary = {
      totalActive: 0,
      totalPaused: 0,
      totalExpired: 0,
      totalCancelled: 0,
      totalCount: 0,
    };
    for (const r of summaryRows) {
      const c = Number(r.cnt || 0);
      summary.totalCount += c;
      if (r.status === 'ACTIVE') summary.totalActive = c;
      else if (r.status === 'PAUSED') summary.totalPaused = c;
      else if (r.status === 'EXPIRED') summary.totalExpired = c;
      else if (r.status === 'CANCELLED') summary.totalCancelled = c;
    }

    // Enhance with periods for returned rows
    const subIds = rows.map((r) => r.id);
    const periodsMap = new Map<string, any[]>();
    if (subIds.length > 0) {
      const periods = await db
        .selectFrom('service_periods as sp')
        .select([
          'sp.id',
          'sp.subscription_id',
          'sp.period_index',
          sql<string>`to_char(sp.start_date, 'YYYY-MM-DD')`.as('start_date'),
          sql<string>`to_char(sp.end_date, 'YYYY-MM-DD')`.as('end_date'),
          'sp.execution_status',
          'sp.payment_status',
          'sp.gross_payable',
        ])
        .where('sp.subscription_id', 'in', subIds as any)
        .orderBy('sp.period_index', 'asc')
        .execute();

      for (const p of periods) {
        const sid = String(p.subscription_id);
        if (!periodsMap.has(sid)) periodsMap.set(sid, []);
        periodsMap.get(sid)!.push(p);
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const data = rows.map((r) => {
      const pList = periodsMap.get(String(r.id)) || [];
      const totalPeriods = pList.length;

      // Find current period: period covering today, or latest period
      let currentPeriod = pList.find((p) => p.start_date <= todayStr && p.end_date >= todayStr);
      if (!currentPeriod && pList.length > 0) {
        currentPeriod = pList[pList.length - 1];
      }

      // Next period
      let nextPeriod = null;
      if (currentPeriod) {
        nextPeriod = pList.find((p) => p.period_index === currentPeriod.period_index + 1) || null;
      }

      return {
        id: String(r.id),
        orderItemId: String(r.order_item_id),
        orderId: String(r.order_id),
        orderCode: r.order_code,
        customer: {
          id: String(r.account_id),
          name: r.company_name,
          phone: r.account_phone,
          email: r.account_email,
          contactName: r.contact_name,
        },
        service: {
          id: String(r.service_id),
          name: r.service_name,
          code: r.service_code,
        },
        netServiceValue: Number(r.net_service_value || 0),
        billingInterval: r.billing_interval,
        intervalCount: Number(r.interval_count || 1),
        startDate: r.start_date,
        endDate: r.end_date,
        renewalDate: r.renewal_date,
        autoRenew: Boolean(r.auto_renew),
        status: r.status,
        totalPeriods,
        currentPeriod: currentPeriod
          ? {
              id: String(currentPeriod.id),
              periodIndex: Number(currentPeriod.period_index),
              startDate: currentPeriod.start_date,
              endDate: currentPeriod.end_date,
              executionStatus: currentPeriod.execution_status,
              paymentStatus: currentPeriod.payment_status,
              grossPayable: Number(currentPeriod.gross_payable || 0),
            }
          : null,
        nextPeriod: nextPeriod
          ? {
              id: String(nextPeriod.id),
              periodIndex: Number(nextPeriod.period_index),
              startDate: nextPeriod.start_date,
              endDate: nextPeriod.end_date,
            }
          : null,
        paymentStatus: currentPeriod ? currentPeriod.payment_status : 'PENDING',
        acceptanceStatus: currentPeriod ? currentPeriod.execution_status : 'PENDING',
        createdAt: r.created_at,
      };
    });

    return {
      data,
      total,
      page,
      limit,
      summary,
    };
  }

  /**
   * PHASE J: GET SUBSCRIPTION BY ID (With all relations & backend object authorization)
   */
  async getSubscriptionById(id: string, user?: any) {
    const db = this.kysely.db;
    const scope = await this.resolveSubscriptionScope(user);

    const sub = await db
      .selectFrom('subscriptions as s')
      .innerJoin('order_items as oi', 'oi.id', 's.order_item_id')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as acc', 'acc.id', 'o.account_id')
      .innerJoin('services as srv', 'srv.id', 's.service_id')
      .leftJoin('contacts as ct', 'ct.id', 'o.primary_contact_id')
      .leftJoin('employees as emp_sale', 'emp_sale.id', 'oi.closing_sale_id')
      .select([
        's.id',
        's.order_item_id',
        's.billing_interval',
        's.interval_count',
        sql<string>`to_char(s.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string | null>`to_char(s.end_date, 'YYYY-MM-DD')`.as('end_date'),
        sql<string | null>`to_char(s.renewal_date, 'YYYY-MM-DD')`.as('renewal_date'),
        's.auto_renew',
        's.status',
        's.previous_subscription_id',
        's.created_at',
        's.updated_at',
        'oi.id as order_item_id',
        'oi.net_service_value',
        'oi.vat_amount',
        'oi.approval_status as item_approval_status',
        'oi.delivery_status as item_delivery_status',
        'oi.payment_status as item_payment_status',
        'o.id as order_id',
        'o.order_code',
        'o.workflow_status as order_workflow_status',
        'acc.id as account_id',
        'acc.company_name',
        'acc.tax_code',
        'acc.address as account_address',
        'acc.phone as account_phone',
        'acc.email as account_email',
        'acc.website as account_website',
        'srv.id as service_id',
        'srv.name as service_name',
        'srv.code as service_code',
        'ct.id as contact_id',
        'ct.full_name as contact_name',
        'ct.position as contact_position',
        'ct.phone as contact_phone',
        'ct.email as contact_email',
        'emp_sale.id as sale_id',
        'emp_sale.full_name as sale_name',
        'emp_sale.employee_code as sale_code',
      ])
      .where('s.id', '=', id as any)
      .executeTakeFirst();

    if (!sub) {
      throw new NotFoundException(`Subscription #${id} not found`);
    }

    // Check authorization if not global
    if (scope.denyAll) {
      throw new ForbiddenException('Bạn không có quyền truy cập hợp đồng định kỳ này');
    }

    let isTechOnlyViewer = false;

    if (!scope.isGlobal) {
      let authorizedViaSale = false;
      let authorizedViaTech = false;
      let authorizedViaAccountant = false;

      // Check sale scope
      if (scope.saleIds.length > 0 && sub.sale_id && scope.saleIds.includes(String(sub.sale_id))) {
        authorizedViaSale = true;
      }

      // Check tech scope (DEV / SEO)
      if (scope.techMemberIds.length > 0) {
        const hasPeriodAssignment = await db
          .selectFrom('service_periods as sp')
          .innerJoin('service_period_assignments as spa', 'spa.service_period_id', 'sp.id')
          .select('spa.id')
          .where('sp.subscription_id', '=', id as any)
          .where('spa.employee_id', 'in', scope.techMemberIds as any)
          .where('spa.is_active', '=', true)
          .executeTakeFirst();

        if (hasPeriodAssignment) {
          authorizedViaTech = true;
        } else {
          const hasPrjAssignment = await db
            .selectFrom('projects as p')
            .innerJoin('project_assignments as pa', 'pa.project_id', 'p.id')
            .select('pa.id')
            .where('p.order_item_id', '=', sub.order_item_id as any)
            .where('pa.employee_id', 'in', scope.techMemberIds as any)
            .where('pa.is_active', '=', true)
            .executeTakeFirst();

          if (hasPrjAssignment) {
            authorizedViaTech = true;
          }
        }
      }

      // Check accountant scope
      if (scope.isAccountant) {
        const hasApprovedPlan = await db
          .selectFrom('order_item_payment_plans as oipp')
          .select('oipp.id')
          .where('oipp.order_item_id', '=', sub.order_item_id as any)
          .where('oipp.status', '=', 'APPROVED')
          .executeTakeFirst();

        if (hasApprovedPlan) {
          authorizedViaAccountant = true;
        } else {
          const hasAllocations = await db
            .selectFrom('payment_installments as pi')
            .innerJoin('payment_allocations as pa', 'pa.installment_id', 'pi.id')
            .innerJoin('service_periods as sp', 'sp.id', 'pi.service_period_id')
            .select('pa.id')
            .where('sp.subscription_id', '=', id as any)
            .executeTakeFirst();

          if (hasAllocations) {
            authorizedViaAccountant = true;
          }
        }
      }

      const authorized = authorizedViaSale || authorizedViaTech || authorizedViaAccountant;
      if (!authorized) {
        throw new ForbiddenException('Bạn không có quyền xem chi tiết hợp đồng định kỳ này');
      }

      if (authorizedViaTech && !authorizedViaSale && !authorizedViaAccountant) {
        isTechOnlyViewer = true;
      }
    }

    // Periods
    const periods = await db
      .selectFrom('service_periods as sp')
      .select([
        'sp.id',
        'sp.period_index',
        'sp.period_net_value',
        'sp.vat_rate',
        'sp.vat_amount',
        'sp.gross_payable',
        sql<string>`to_char(sp.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string>`to_char(sp.end_date, 'YYYY-MM-DD')`.as('end_date'),
        'sp.execution_status',
        'sp.payment_status',
        'sp.created_at',
      ])
      .where('sp.subscription_id', '=', id as any)
      .orderBy('sp.period_index', 'asc')
      .execute();

    const periodIds = periods.map((p) => p.id);

    // Assignments
    const assignmentsMap = new Map<string, any[]>();
    if (periodIds.length > 0) {
      const assignments = await db
        .selectFrom('service_period_assignments as spa')
        .innerJoin('employees as e', 'e.id', 'spa.employee_id')
        .select([
          'spa.id',
          'spa.service_period_id',
          'spa.employee_id',
          'spa.assignment_type',
          'spa.is_active',
          'spa.assigned_at',
          'spa.unassigned_at',
          'spa.replacement_reason',
          'e.employee_code',
          'e.full_name',
        ])
        .where('spa.service_period_id', 'in', periodIds as any)
        .orderBy('spa.assigned_at', 'desc')
        .execute();

      for (const a of assignments) {
        const pid = String(a.service_period_id);
        if (!assignmentsMap.has(pid)) assignmentsMap.set(pid, []);
        assignmentsMap.get(pid)!.push({
          id: String(a.id),
          employeeId: String(a.employee_id),
          employeeCode: a.employee_code,
          fullName: a.full_name,
          assignmentType: a.assignment_type,
          isActive: Boolean(a.is_active),
          assignedAt: a.assigned_at,
          unassignedAt: a.unassigned_at,
          replacementReason: a.replacement_reason,
        });
      }
    }

    // Acceptances
    const acceptancesMap = new Map<string, any>();
    if (periodIds.length > 0) {
      const acceptances = await db
        .selectFrom('service_period_acceptances as spa')
        .leftJoin('employees as rec_emp', 'rec_emp.id', 'spa.recorded_by_employee_id')
        .select([
          'spa.id',
          'spa.service_period_id',
          'spa.accepted_by_name',
          'spa.accepted_at',
          'spa.evidence_document',
          'rec_emp.full_name as recorded_by_employee_name',
        ])
        .where('spa.service_period_id', 'in', periodIds as any)
        .execute();

      for (const acc of acceptances) {
        acceptancesMap.set(String(acc.service_period_id), {
          id: String(acc.id),
          acceptedByName: acc.accepted_by_name,
          acceptedAt: acc.accepted_at,
          evidenceDocument: acc.evidence_document,
          recordedByEmployeeName: acc.recorded_by_employee_name,
        });
      }
    }

    // Linked Payment Plan & Installments (Redacted for Tech Leader Data Minimization)
    let paymentPlan: any = null;
    let installments: SubscriptionInstallmentRow[] = [];

    if (!isTechOnlyViewer) {
      paymentPlan = await db
        .selectFrom('order_item_payment_plans as oipp')
        .select([
          'oipp.id',
          'oipp.version',
          'oipp.status',
          'oipp.approved_at',
        ])
        .where('oipp.order_item_id', '=', sub.order_item_id as any)
        .where('oipp.status', '=', 'APPROVED')
        .executeTakeFirst();

      if (paymentPlan) {
        installments = await db
          .selectFrom('payment_installments as pi')
          .select([
            'pi.id',
            'pi.installment_number',
            'pi.service_period_id',
            sql<string>`to_char(pi.due_date, 'YYYY-MM-DD')`.as('due_date'),
            'pi.gross_amount_due',
            'pi.status',
          ])
          .where('pi.payment_plan_id', '=', paymentPlan.id as any)
          .orderBy('pi.installment_number', 'asc')
          .execute();
      }
    }

    // Linked Project
    const project = await db
      .selectFrom('projects as p')
      .select([
        'p.id',
        'p.project_name',
        'p.status',
        'p.materialized_progress_percent',
        'p.started_at',
        'p.completed_at',
      ])
      .where('p.order_item_id', '=', sub.order_item_id as any)
      .executeTakeFirst();

    // Renewal history
    const renewalHistory = await db
      .selectFrom('subscriptions as s')
      .select([
        's.id',
        's.status',
        sql<string>`to_char(s.start_date, 'YYYY-MM-DD')`.as('start_date'),
        sql<string | null>`to_char(s.end_date, 'YYYY-MM-DD')`.as('end_date'),
      ])
      .where('s.previous_subscription_id', '=', id as any)
      .execute();

    return {
      id: String(sub.id),
      orderItemId: String(sub.order_item_id),
      orderId: String(sub.order_id),
      orderCode: sub.order_code,
      orderWorkflowStatus: sub.order_workflow_status,
      customer: {
        id: String(sub.account_id),
        name: sub.company_name,
        taxCode: sub.tax_code,
        address: sub.account_address,
        phone: sub.account_phone,
        email: sub.account_email,
        website: sub.account_website,
        contactName: sub.contact_name,
        contactPosition: sub.contact_position,
        contactPhone: sub.contact_phone,
        contactEmail: sub.contact_email,
      },
      service: {
        id: String(sub.service_id),
        name: sub.service_name,
        code: sub.service_code,
      },
      closingSale: sub.sale_id
        ? {
            id: String(sub.sale_id),
            fullName: sub.sale_name,
            employeeCode: sub.sale_code,
          }
        : null,
      netServiceValue: Number(sub.net_service_value || 0),
      vatAmount: Number(sub.vat_amount || 0),
      itemApprovalStatus: sub.item_approval_status,
      itemDeliveryStatus: sub.item_delivery_status,
      itemPaymentStatus: sub.item_payment_status,
      billingInterval: sub.billing_interval,
      intervalCount: Number(sub.interval_count || 1),
      startDate: sub.start_date,
      endDate: sub.end_date,
      renewalDate: sub.renewal_date,
      autoRenew: Boolean(sub.auto_renew),
      status: sub.status,
      previousSubscriptionId: sub.previous_subscription_id
        ? String(sub.previous_subscription_id)
        : null,
      createdAt: sub.created_at,
      updatedAt: sub.updated_at,
      periods: periods.map((p) => ({
        id: String(p.id),
        periodIndex: Number(p.period_index),
        periodNetValue: Number(p.period_net_value),
        vatRate: Number(p.vat_rate),
        vatAmount: Number(p.vat_amount),
        grossPayable: Number(p.gross_payable),
        startDate: p.start_date,
        endDate: p.end_date,
        executionStatus: p.execution_status,
        paymentStatus: p.payment_status,
        createdAt: p.created_at,
        assignments: assignmentsMap.get(String(p.id)) || [],
        acceptance: acceptancesMap.get(String(p.id)) || null,
      })),
      paymentPlan: paymentPlan
        ? {
            id: String(paymentPlan.id),
            version: Number(paymentPlan.version),
            status: paymentPlan.status,
            approvedAt: paymentPlan.approved_at,
            installments: installments.map((ins) => ({
              id: String(ins.id),
              installmentNumber: Number(ins.installment_number),
              servicePeriodId: ins.service_period_id ? String(ins.service_period_id) : null,
              dueDate: ins.due_date,
              grossAmountDue: Number(ins.gross_amount_due),
              status: ins.status,
            })),
          }
        : null,
      linkedProject: project
        ? {
            id: String(project.id),
            projectName: project.project_name,
            status: project.status,
            progressPercent: Number(project.materialized_progress_percent),
            startedAt: project.started_at,
            completedAt: project.completed_at,
          }
        : null,
      renewalHistory: renewalHistory.map((rh) => ({
        id: String(rh.id),
        status: rh.status,
        startDate: rh.start_date,
        endDate: rh.end_date,
      })),
    };
  }

  async findEligibleOrderItems() {
    const rows = await this.kysely.db
      .selectFrom('order_items as oi')
      .innerJoin('orders as o', 'o.id', 'oi.order_id')
      .innerJoin('accounts as acc', 'acc.id', 'o.account_id')
      .innerJoin('services as srv', 'srv.id', 'oi.service_id')
      .leftJoin('subscriptions as s', 's.order_item_id', 'oi.id')
      .select([
        'oi.id as order_item_id',
        'oi.approval_status as item_approval_status',
        'oi.net_service_value',
        'o.order_code',
        'o.workflow_status as order_workflow_status',
        'acc.company_name',
        'srv.name as service_name',
        'srv.code as service_code',
      ])
      .where('srv.service_type', '=', 'RECURRING')
      .where('s.id', 'is', null)
      .where('oi.approval_status', '=', 'APPROVED')
      .where('o.workflow_status', 'in', ['APPROVED', 'IN_PROGRESS', 'COMPLETED'])
      .orderBy('oi.id', 'desc')
      .execute();

    return rows.map((row) => ({
      orderItemId: String(row.order_item_id),
      orderCode: row.order_code,
      orderStatus: row.order_workflow_status,
      itemApprovalStatus: row.item_approval_status,
      customerName: row.company_name,
      serviceName: row.service_name,
      serviceCode: row.service_code,
      netServiceValue: Number(row.net_service_value),
    }));
  }
}
