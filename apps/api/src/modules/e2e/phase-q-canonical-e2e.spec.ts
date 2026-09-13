import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from '../deals/deals.service';
import { OrdersService } from '../orders/orders.service';
import { ProjectsService } from '../projects/projects.service';
import { PaymentsService } from '../payments/payments.service';
import { CommissionsService } from '../commissions/commissions.service';
import { KpiService } from '../kpi/kpi.service';
import { PayrollService } from '../payroll/payroll.service';
import { ExpensesService } from '../expenses/expenses.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { StorageService } from '../storage/storage.service';
import { AcquisitionService } from '../acquisition/acquisition.service';
import { SalesActivitiesService } from '../sales-activities/sales-activities.service';
import { ActivityType } from '../sales-activities/dto/create-sales-activity.dto';
import { LeadQuality } from '../leads/dto/update-lead-quality.dto';
import { AssignmentType } from '../projects/dto/assign-project.dto';
import { sql } from 'kysely';

function assert(condition: boolean, testName: string, failureReason?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName} - ${failureReason || 'Assertion failed'}`);
    throw new Error(`Test assertion failed: ${testName} (${failureReason})`);
  }
}

export async function runPhaseQCanonicalSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE Q: FULL CANONICAL END-TO-END WORKFLOW');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const kysely = app.get(KyselyService);
  const db = kysely.db;
  const acqService = app.get(AcquisitionService);
  const leadsService = app.get(LeadsService);
  const salesActivitiesService = app.get(SalesActivitiesService);
  const dealsService = app.get(DealsService);
  const ordersService = app.get(OrdersService);
  const projectsService = app.get(ProjectsService);
  const paymentsService = app.get(PaymentsService);
  const commissionsService = app.get(CommissionsService);
  const kpiService = app.get(KpiService);
  const payrollService = app.get(PayrollService);
  const expensesService = app.get(ExpensesService);
  const dashboardService = app.get(DashboardService);
  const storageService = app.get(StorageService);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    // ----------------------------------------------------------------
    // SECTION A: EMPLOYEE / TEAM FIXTURES
    // ----------------------------------------------------------------
    console.log('\n--- SECTION A: EMPLOYEE / TEAM SETUP ---');

    const posBoss = await db.selectFrom('positions').selectAll().where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const posSale = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const posSaleLeader = await db.selectFrom('positions').selectAll().where('code', '=', 'SALES_TEAM_LEADER').executeTakeFirstOrThrow();
    const posDev = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();

    const [bossEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-Q-BOSS-${runId}`,
        full_name: `Boss General ${runId}`,
        position_id: posBoss.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [leaderEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-Q-LEAD-${runId}`,
        full_name: `Sale Leader Carol ${runId}`,
        position_id: posSaleLeader.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [saleEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-Q-SALE-${runId}`,
        full_name: `Sale Representative Alice ${runId}`,
        position_id: posSale.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [devEmp] = await db
      .insertInto('employees')
      .values({
        employee_code: `EMP-Q-DEV-${runId}`,
        full_name: `Dev Engineer Bob ${runId}`,
        position_id: posDev.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Create Team & Temporal Memberships
    const [team] = await db
      .insertInto('teams')
      .values({
        code: `TEAM-Q-${runId}`,
        name: `Enterprise Sales Team ${runId}`,
        department: 'SALES',
      })
      .returningAll()
      .execute();

    await db
      .insertInto('team_memberships')
      .values({
        team_id: team.id,
        employee_id: leaderEmp.id,
        is_leader: true,
        effective_range: '[2020-01-01,)' as any,
      })
      .execute();

    await db
      .insertInto('team_memberships')
      .values({
        team_id: team.id,
        employee_id: saleEmp.id,
        is_leader: false,
        effective_range: '[2020-01-01,)' as any,
      })
      .execute();

    // Verify Temporal Memberships
    const activeMembers = await db
      .selectFrom('team_memberships')
      .selectAll()
      .where('team_id', '=', team.id)
      .execute();

    assert(activeMembers.length === 2, 'Q-E2E-A01: Team created with 2 temporal members (1 leader, 1 member)');
    const foundLeader = activeMembers.find((m) => m.employee_id === leaderEmp.id && m.is_leader);
    assert(!!foundLeader, 'Q-E2E-A02: Sales Team Leader accurately registered with is_leader = true');

    // Setup base salary for employees for payroll verification
    await db.insertInto('salary_history').values({
      employee_id: saleEmp.id,
      base_salary: 15000000 as any,
      effective_range: '[2020-01-01,)' as any,
    }).execute();

    await db.insertInto('salary_history').values({
      employee_id: devEmp.id,
      base_salary: 20000000 as any,
      effective_range: '[2020-01-01,)' as any,
    }).execute();

    // Ensure DEV position has PROJECT_DELIVERY KPI policy
    const existingDevKpiPolicy = await db
      .selectFrom('kpi_policies')
      .selectAll()
      .where('position_id', '=', posDev.id)
      .where('metric_type', '=', 'PROJECT_DELIVERY')
      .executeTakeFirst();

    if (!existingDevKpiPolicy) {
      await db.insertInto('kpi_policies').values({
        policy_name: `Dev Project Delivery Policy ${runId}`,
        position_id: posDev.id,
        metric_type: 'PROJECT_DELIVERY',
        effective_range: '[2020-01-01,)' as any,
      }).execute();
    }

    // ----------------------------------------------------------------
    // SECTION B: ACQUISITION & LEAD ASSIGNMENT
    // ----------------------------------------------------------------
    console.log('\n--- SECTION B: ACQUISITION & LEAD INGESTION ---');

    const [platform] = await db
      .insertInto('platforms')
      .values({
        code: `PL_Q_${runId}`,
        name: `Meta Ads Q ${runId}`,
        is_active: true,
      })
      .returningAll()
      .execute();

    const [channel] = await db
      .insertInto('channels')
      .values({
        code: `CH_Q_${runId}`,
        name: `Inbound Form Q ${runId}`,
        is_active: true,
      })
      .returningAll()
      .execute();

    // Assign Market mapping to Sale Alice
    await acqService.assignMarket(String(saleEmp.id), String(platform.id), String(channel.id));

    // Create Lead via Inbound Acquisition (actor has roles: ['BOSS'])
    const lead = await leadsService.createLead(
      {
        fullName: `Khách Hàng Tiềm Năng ${runId}`,
        phone: `0912${String(runId).slice(0, 6)}`,
        email: `lead_${runId}@canonical-test.vn`,
        platformId: String(platform.id),
        channelId: String(channel.id),
        creatorEmployeeId: String(bossEmp.id),
      },
      { employeeId: String(bossEmp.id), roles: ['BOSS'] },
    );

    assert(String(lead.assigned_sale_id) === String(saleEmp.id), 'Q-E2E-B01: Lead auto-assigned to Sale Alice via acquisition channel mapping');

    const assignmentHist = await db
      .selectFrom('lead_assignment_history')
      .selectAll()
      .where('lead_id', '=', lead.id)
      .execute();
    assert(assignmentHist.length >= 1, 'Q-E2E-B02: Lead assignment logged to lead_assignment_history');

    // ----------------------------------------------------------------
    // SECTION C: LEAD QUALIFICATION & CONVERT TO DEAL
    // ----------------------------------------------------------------
    console.log('\n--- SECTION C: LEAD QUALIFICATION & DEAL CONVERSION ---');

    // Record sales activity (Call / Consultation)
    await salesActivitiesService.createActivity(
      String(saleEmp.id),
      {
        leadId: String(lead.id),
        activityType: ActivityType.CALL,
        resultNote: 'Khách hàng có nhu cầu thiết kế website doanh nghiệp gói 15M',
      },
    );

    // Update Lead quality to POTENTIAL
    const qualifiedLead = await leadsService.qualifyLead(String(lead.id), { quality: LeadQuality.POTENTIAL });
    assert(qualifiedLead.quality === 'POTENTIAL', 'Q-E2E-C01: Lead qualified to POTENTIAL');

    // Convert Lead to Deal (15,000,000 contract value - within canonical 10M-15M price band)
    const convertResult = await leadsService.convertToDeal(
      String(lead.id),
      {
        companyName: `Công Ty Cổ Phần Công Nghệ F8-${runId}`,
        contactName: `Nguyễn Văn Đại Diện ${runId}`,
        dealName: `Hợp Đồng Phần Mềm Web ${runId}`,
        expectedValue: 15000000,
      },
      String(saleEmp.id),
    );

    const deal = convertResult.deal;
    const account = convertResult.account;
    const contact = convertResult.contact;

    assert(!!deal && deal.status === 'OPEN', 'Q-E2E-C02: Lead converted to Deal in OPEN status');
    assert(!!account && !!contact, 'Q-E2E-C03: Account and Contact entities materialized atomically');

    const leadAfterConvert = await db.selectFrom('leads').selectAll().where('id', '=', lead.id).executeTakeFirstOrThrow();
    assert(leadAfterConvert.status === 'CONVERTED', 'Q-E2E-C04: Source Lead status transitioned to CONVERTED');

    // ----------------------------------------------------------------
    // SECTION D: DEAL NEGOTIATION & MARK WON (SNAPSHOT CLOSING SALE)
    // ----------------------------------------------------------------
    console.log('\n--- SECTION D: DEAL NEGOTIATION & MARK WON ---');

    await dealsService.startNegotiation(String(deal.id));
    await dealsService.setClosingSale(String(deal.id), { closingSaleId: String(saleEmp.id) });

    const wonResult = await dealsService.markWon(String(deal.id));
    const order = wonResult.order;
    const orderItem = wonResult.orderItem;

    assert(!!order && order.workflow_status === 'DRAFT', 'Q-E2E-D01: Deal WON generated DRAFT Order');
    assert(!!orderItem, 'Q-E2E-D02: OrderItem created with Deal association');
    assert(String(orderItem.closing_sale_id) === String(saleEmp.id), 'Q-E2E-D03: closing_sale_id correctly snapshotted onto OrderItem');

    // ----------------------------------------------------------------
    // SECTION E: ORDER SUBMISSION & BOSS APPROVAL
    // ----------------------------------------------------------------
    console.log('\n--- SECTION E: ORDER SUBMIT & BOSS APPROVAL ---');

    const orderId = String(order.id);
    const orderItemId = String(orderItem.id);

    // Submit Order & OrderItem
    await ordersService.submitOrder(orderId, String(saleEmp.id));
    await ordersService.approveOrder(orderId, String(bossEmp.id));
    await ordersService.submitOrderItem(orderItemId, String(saleEmp.id));
    await ordersService.approveOrderItem(orderItemId, String(bossEmp.id));

    const approvedItem = await db.selectFrom('order_items').selectAll().where('id', '=', orderItem.id).executeTakeFirstOrThrow();
    assert(approvedItem.approval_status === 'APPROVED', 'Q-E2E-E01: OrderItem approval_status is APPROVED');
    assert(approvedItem.delivery_status === 'READY_FOR_ASSIGNMENT' || approvedItem.delivery_status === 'PENDING', 'Q-E2E-E02: OrderItem delivery_status is eligible for project assignment');

    // ----------------------------------------------------------------
    // SECTION F: PROJECT ASSIGNMENT, START & PROGRESS
    // ----------------------------------------------------------------
    console.log('\n--- SECTION F: PROJECT ASSIGNMENT & LIFECYCLE ---');

    const { project, assignment } = await projectsService.assignProject(
      orderItemId,
      { employeeId: String(devEmp.id), assignmentType: AssignmentType.PRIMARY },
      String(bossEmp.id),
    );

    assert(project.status === 'ASSIGNED', 'Q-E2E-F01: Project created in ASSIGNED status');
    assert(assignment.assignment_type === 'PRIMARY' && assignment.is_active, 'Q-E2E-F02: Dev Bob assigned as PRIMARY');

    const projectId = String(project.id);
    await projectsService.markReadyToStart(projectId, String(bossEmp.id));
    const startedProj = await projectsService.startProject(projectId, String(bossEmp.id));
    assert(startedProj.status === 'IN_PROGRESS' && !!startedProj.started_at, 'Q-E2E-F03: Project explicitly started to IN_PROGRESS');

    // Tasks and progress
    const task1 = await projectsService.createTask(projectId, { title: 'Develop Core Architecture', weight: 50 }, String(devEmp.id));
    const task2 = await projectsService.createTask(projectId, { title: 'Implement Business Modules', weight: 50 }, String(devEmp.id));

    await projectsService.startTask(String(task1.id), String(devEmp.id));
    await projectsService.completeTask(String(task1.id), String(devEmp.id));
    await projectsService.startTask(String(task2.id), String(devEmp.id));
    await projectsService.completeTask(String(task2.id), String(devEmp.id));

    const projDetail = await projectsService.findProjectById(projectId);
    assert(Number(projDetail.materialized_progress_percent) === 100, 'Q-E2E-F04: Derived task progress reached 100%');

    // ----------------------------------------------------------------
    // SECTION G: CUSTOMER ACCEPTANCE WITH EVIDENCE
    // ----------------------------------------------------------------
    console.log('\n--- SECTION G: CUSTOMER ACCEPTANCE & STORAGE EVIDENCE ---');

    await projectsService.updateProjectStatus(projectId, 'REVIEW', undefined, String(bossEmp.id));

    // Upload canonical acceptance evidence via StorageService
    const acceptanceDocBuffer = Buffer.from('%PDF-1.4\n%Acceptance Document\n%%EOF');
    const uploadRes = await storageService.uploadFile({
      entityType: 'projects',
      entityId: project.id,
      filename: `acceptance_evidence_${runId}.pdf`,
      buffer: acceptanceDocBuffer,
      claimedMimeType: 'application/pdf',
    });

    assert(!!uploadRes.objectKey, 'Q-E2E-G01: Canonical acceptance evidence document uploaded via StorageService');

    // Record Customer Acceptance
    const { project: completedProj, acceptance } = await projectsService.recordAcceptance(
      projectId,
      {
        customerContactId: String(contact.id),
        acceptedByName: 'Tổng Giám Đốc F8',
        evidenceDocument: uploadRes.objectKey,
      },
      String(bossEmp.id),
    );

    assert(completedProj.status === 'COMPLETED' && !!completedProj.completed_at, 'Q-E2E-G02: Customer acceptance transitions Project to COMPLETED');
    assert(!!acceptance && acceptance.accepted_by_name === 'Tổng Giám Đốc F8', 'Q-E2E-G03: project_acceptances row logged with verified details');

    const itemAfterAcceptance = await db.selectFrom('order_items').selectAll().where('id', '=', orderItem.id).executeTakeFirstOrThrow();
    assert(itemAfterAcceptance.delivery_status === 'COMPLETED', 'Q-E2E-G04: OrderItem delivery_status transitioned to COMPLETED');

    // ----------------------------------------------------------------
    // SECTION H: PAYMENT INGESTION & BOSS CONFIRMATION
    // ----------------------------------------------------------------
    console.log('\n--- SECTION H: PAYMENT INGESTION & BOSS CONFIRMATION ---');

    // Create payment plan & installment for 15M
    const [plan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        created_by_employee_id: bossEmp.id,
        config_snapshot: { type: 'FULL_UPFRONT' },
        status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [installment] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: plan.id,
        installment_number: 1,
        due_date: new Date().toISOString().split('T')[0] as any,
        gross_amount_due: 15000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    // Create payment with bank receipt evidence
    const paymentReceiptBuffer = Buffer.from('%PDF-1.4\n%Payment Receipt\n%%EOF');
    const payUploadRes = await storageService.uploadFile({
      entityType: 'payments',
      entityId: 99999,
      filename: `payment_proof_${runId}.pdf`,
      buffer: paymentReceiptBuffer,
      claimedMimeType: 'application/pdf',
    });

    const payment = await paymentsService.createPayment(
      {
        grossCashAmount: 15000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        evidenceUrl: payUploadRes.objectKey,
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 15000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(saleEmp.id),
    );

    assert(payment.status === 'PENDING_CONFIRMATION', 'Q-E2E-H01: Payment created in PENDING_CONFIRMATION status');

    // Boss confirms payment
    const confirmedPayment = await paymentsService.confirmPayment(
      String(payment.id),
      {
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 15000000,
            vatAllocatedAmount: 0,
            serviceAmount: 15000000,
            netEligibleAmount: 15000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(bossEmp.id),
    );

    assert(confirmedPayment.status === 'CONFIRMED' && !!confirmedPayment.confirmed_at, 'Q-E2E-H02: Boss confirmed Payment');

    const updatedInst = await db.selectFrom('payment_installments').selectAll().where('id', '=', installment.id).executeTakeFirstOrThrow();
    assert(updatedInst.status === 'PAID', 'Q-E2E-H03: Installment status transitioned to PAID');

    const updatedItemPaid = await db.selectFrom('order_items').selectAll().where('id', '=', orderItem.id).executeTakeFirstOrThrow();
    assert(updatedItemPaid.payment_status === 'FULLY_PAID', 'Q-E2E-H04: OrderItem payment_status updated to FULLY_PAID');

    // ----------------------------------------------------------------
    // SECTION I: COMMISSION EVALUATION & RELEASE
    // ----------------------------------------------------------------
    console.log('\n--- SECTION I: COMMISSION EVALUATION & APPROVAL ---');

    const itemComms = await db.selectFrom('commissions').selectAll().where('order_item_id', '=', orderItem.id).execute();
    const saleComm = itemComms.find((c) => c.commission_type === 'SALE' && c.beneficiary_employee_id === saleEmp.id);
    assert(!!saleComm && saleComm.status === 'RELEASED', 'Q-E2E-I01: Sale commission released upon FULLY_PAID + Customer Acceptance');
    assert(Number(saleComm?.calculated_amount) === 1500000, 'Q-E2E-I02: Sale commission computed accurately (10% of 15M = 1.5M)');

    const devComm = itemComms.find((c) => c.commission_type === 'PROJECT_DELIVERY' && c.beneficiary_employee_id === devEmp.id);
    assert(!!devComm && devComm.status === 'CALCULATED', 'Q-E2E-I03: Dev technical commission generated in CALCULATED status');
    assert(Number(devComm?.calculated_amount) === 450000, 'Q-E2E-I04: Dev technical commission computed accurately (3% of 15M = 450k)');

    // Boss approves Dev commission
    const approvedDevComm = await commissionsService.approveCommission(String(devComm!.id), String(bossEmp.id));
    assert(approvedDevComm.status === 'APPROVED' && !!approvedDevComm.approved_at, 'Q-E2E-I05: Boss approved Dev Technical Commission');

    // ----------------------------------------------------------------
    // SECTION J: KPI EVALUATION (Q-KPI-01, Q-KPI-02)
    // ----------------------------------------------------------------
    console.log('\n--- SECTION J: KPI EVALUATION ---');

    // Q-KPI-01: 15M confirmed allocation -> Sale CASH_REVENUE event with exact 15M eligible revenue (NO POINTS)
    const saleKpiEvents = await db
      .selectFrom('kpi_events')
      .selectAll()
      .where('employee_id', '=', saleEmp.id)
      .where('source_type', '=', 'PAYMENT_ALLOCATION')
      .execute();
    assert(saleKpiEvents.length >= 1, 'Q-E2E-J01 / Q-KPI-01: Sale CASH_REVENUE KPI event created from confirmed payment allocation');
    const saleEvent = saleKpiEvents[0];
    assert(saleEvent.metric_type === 'CASH_REVENUE', 'Q-KPI-01: Sale KPI metric is strictly CASH_REVENUE');
    assert(Number(saleEvent.eligible_revenue) === 15000000 && Number(saleEvent.metric_value) === 15000000, 'Q-KPI-01: Sale KPI records exact 15M eligible cash revenue');
    assert(saleEvent.kpi_points === null || saleEvent.kpi_points === undefined || Number(saleEvent.kpi_points) === 0, 'Q-KPI-01: Sale KPI awards zero points (points = 0), evaluating against cash revenue tiers only');

    // Q-KPI-02: Verify all frozen Sale KPI tiers in database
    const salePolicy = await db
      .selectFrom('kpi_policies')
      .selectAll()
      .where('position_id', '=', posSale.id)
      .where('metric_type', '=', 'CASH_REVENUE')
      .executeTakeFirst();
    assert(!!salePolicy, 'Q-KPI-02: Sale CASH_REVENUE KPI policy exists in database');

    const saleTiers = await db
      .selectFrom('kpi_policy_tiers')
      .selectAll()
      .where('kpi_policy_id', '=', salePolicy!.id)
      .orderBy('min_threshold', 'asc')
      .execute();

    assert(saleTiers.length >= 4, 'Q-KPI-02: Sale KPI policy contains all 4 canonical reward tiers');
    // Tier 1: 0 - 120M -> 0 reward
    assert(Number(saleTiers[0].min_threshold) === 0 && Number(saleTiers[0].max_threshold) === 120000000 && Number(saleTiers[0].reward_amount) === 0, 'Q-KPI-02: Tier 1 (0 - 120M) verified with 0đ reward');
    // Tier 2: 120M - 150M -> 1,000,000 reward
    assert(Number(saleTiers[1].min_threshold) === 120000000 && Number(saleTiers[1].max_threshold) === 150000000 && Number(saleTiers[1].reward_amount) === 1000000, 'Q-KPI-02: Tier 2 (120M - 150M) verified with 1,000,000đ reward');
    // Tier 3: 150M - 200M -> 2,000,000 reward
    assert(Number(saleTiers[2].min_threshold) === 150000000 && Number(saleTiers[2].max_threshold) === 200000000 && Number(saleTiers[2].reward_amount) === 2000000, 'Q-KPI-02: Tier 3 (150M - 200M) verified with 2,000,000đ reward');
    // Tier 4: >= 200M -> 3,000,000 reward
    assert(Number(saleTiers[3].min_threshold) === 200000000 && Number(saleTiers[3].reward_amount) === 3000000, 'Q-KPI-02: Tier 4 (>= 200M) verified with 3,000,000đ reward');

    // Monthly evaluation of 15M allocation against tiers yields Tier 1 (0đ reward)
    const saleKpiMonthly = await kpiService.getEmployeeKpiSummary(String(saleEmp.id), saleEvent.target_kpi_period);
    assert(saleKpiMonthly.totalEligibleRevenue === 15000000, 'Q-KPI-01: Monthly KPI reflects 15M total revenue');
    assert(saleKpiMonthly.rewardBonus === 0, 'Q-KPI-01: 15M revenue is in Tier 1 (< 120M) with 0đ reward bonus');

    // Verify Dev KPI events
    const devKpiEvents = await db
      .selectFrom('kpi_events')
      .selectAll()
      .where('employee_id', '=', devEmp.id)
      .where('source_type', '=', 'PROJECT_ACCEPTANCE')
      .execute();
    assert(devKpiEvents.length >= 1 && Number(devKpiEvents[0].kpi_points) === 2, 'Q-E2E-J02: Dev PROJECT_ACCEPTANCE KPI event created with 2 points from 15M price band');

    // ----------------------------------------------------------------
    // SECTION K: PAYROLL CALCULATION, APPROVAL & LOCK
    // ----------------------------------------------------------------
    console.log('\n--- SECTION K: PAYROLL CALCULATION, APPROVAL & LOCK ---');

    const periodKey = `2026-09-Q-${runId}`;
    const [period] = await db
      .insertInto('payroll_periods')
      .values({
        period_key: periodKey,
        start_date: '2026-09-01' as any,
        end_date: '2026-09-30' as any,
        status: 'OPEN',
      })
      .returningAll()
      .execute();

    // Calculate payroll period
    await payrollService.calculatePayrollPeriod(String(period.id), String(bossEmp.id));

    const payrolls = await db.selectFrom('payrolls').selectAll().where('payroll_period_id', '=', period.id).execute();
    assert(payrolls.length >= 2, 'Q-E2E-K01: Payroll calculated rows for active employees');

    const salePayroll = payrolls.find((p) => p.employee_id === saleEmp.id);
    assert(!!salePayroll, 'Q-E2E-K02: Sale Alice payroll generated');
    assert(Number(salePayroll?.released_commission_amount) >= 1500000, 'Q-E2E-K03: Sale Alice payroll contains 1.5M released commission');

    // Boss approves payroll period
    const approvedPeriod = await payrollService.approvePeriod(String(period.id), String(bossEmp.id));
    assert(approvedPeriod.status === 'APPROVED', 'Q-E2E-K04: Payroll period approved by Boss');

    // Boss locks payroll period
    const lockedPeriod = await payrollService.lockPeriod(String(period.id), String(bossEmp.id));
    assert(lockedPeriod.status === 'LOCKED', 'Q-E2E-K05: Payroll period successfully LOCKED and made immutable');

    // ----------------------------------------------------------------
    // SECTION L: EXPENSE GENERATION & DEDUPLICATION
    // ----------------------------------------------------------------
    console.log('\n--- SECTION L: PAYROLL EXPENSE DEDUPLICATION ---');

    const expenses = await db
      .selectFrom('expenses')
      .selectAll()
      .where('source_payroll_period_id', '=', period.id)
      .where('source_type', '=', 'PAYROLL')
      .execute();

    assert(expenses.length === 1, 'Q-E2E-L01: Canonical salary expense automatically created upon payroll lock');
    assert(Number(expenses[0].amount) > 0, 'Q-E2E-L02: Payroll expense amount reflects total payable net salaries');

    // Deduplication check: call processPayrollExpense again to verify idempotency
    const duplicateCall = await expensesService.processPayrollExpense(
      { payroll_period_id: period.id as any },
      String(bossEmp.id),
    );
    assert(String(duplicateCall.id) === String(expenses[0].id), 'Q-E2E-L03: Payroll expense generation is strictly idempotent (deduplicated)');

    // ----------------------------------------------------------------
    // SECTION M: EXECUTIVE DASHBOARD & REPORTS REFLECTION
    // ----------------------------------------------------------------
    console.log('\n--- SECTION M: EXECUTIVE DASHBOARD REPORTING ---');

    const dashboard = await dashboardService.getExecutiveDashboard('2026-09');
    assert(dashboard.cashReceivable.grossCashConfirmedTotal >= 15000000, 'Q-E2E-M01: Executive Dashboard reflects canonical confirmed gross cash');
    assert(dashboard.sales.totalLeads >= 1, 'Q-E2E-M02: Executive Dashboard reflects sales leads');
    assert(dashboard.delivery.completedProjects >= 1, 'Q-E2E-M03: Executive Dashboard reflects completed delivery projects');
    assert(dashboard.people.totalActiveEmployees >= 4, 'Q-E2E-M04: Executive Dashboard reflects active team headcount');

    console.log('====================================================');
    console.log('PHASE Q CANONICAL E2E WORKFLOW: ALL TESTS PASSED! ✅');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runPhaseQCanonicalSuite().catch((err) => {
    console.error('❌ Phase Q Canonical E2E suite error:', err);
    process.exit(1);
  });
}
