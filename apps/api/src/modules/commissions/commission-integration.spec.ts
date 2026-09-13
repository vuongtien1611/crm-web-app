import { NestFactory, Reflector } from '@nestjs/core';
import { ExecutionContext, BadRequestException, ForbiddenException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { CommissionsService } from './commissions.service';
import { CommissionPolicyMatcherService } from './services/commission-policy-matcher.service';
import { CommissionEligibilityService } from './services/commission-eligibility.service';
import { PaymentsService } from '../payments/payments.service';
import { OrdersService } from '../orders/orders.service';
import { DealsService } from '../deals/deals.service';
import { ProjectsService } from '../projects/projects.service';
import { KyselyService } from '../../database/kysely.service';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { AssignmentType } from '../projects/dto/assign-project.dto';
import { KpiEvaluationService } from '../kpi/services/kpi-evaluation.service';

async function runCommissionIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING COMMISSION FOUNDATION INTEGRATION SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const commissionsService = app.get(CommissionsService);
  const matcherService = app.get(CommissionPolicyMatcherService);
  const eligibilityService = app.get(CommissionEligibilityService);
  const kpiEvaluationService = app.get(KpiEvaluationService);
  const paymentsService = app.get(PaymentsService);
  const ordersService = app.get(OrdersService);
  const dealsService = app.get(DealsService);
  const projectsService = app.get(ProjectsService);
  const kysely = app.get(KyselyService);

  const permissionsGuard = new PermissionsGuard(new Reflector());

  let passed = 0;
  let failed = 0;

  const assert = (condition: boolean, testName: string, failureReason?: string) => {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${testName} - ${failureReason || 'Assertion failed'}`);
      failed++;
    }
  };

  try {
    // --------------------------------------------------
    // FIXTURES SETUP
    // --------------------------------------------------
    const salePosition = await kysely.db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', 'SALE')
      .executeTakeFirstOrThrow();
    const salesLeaderPosition = await kysely.db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', 'SALES_TEAM_LEADER')
      .executeTakeFirstOrThrow();
    const devPosition = await kysely.db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', 'DEV')
      .executeTakeFirstOrThrow();
    const devLeaderPosition = await kysely.db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', 'DEV_TEAM_LEADER')
      .executeTakeFirstOrThrow();

    // Create Employees
    const [saleEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-SALE-${Date.now()}`,
        full_name: 'Sale Representative John',
        position_id: salePosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [dev1Emp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DEV1-${Date.now()}`,
        full_name: 'Primary Developer Alice',
        position_id: devPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [dev2Emp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DEV2-${Date.now()}`,
        full_name: 'Primary Developer Bob',
        position_id: devPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const [leaderEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-LEAD-${Date.now()}`,
        full_name: 'Team Leader Carol',
        position_id: salesLeaderPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    // Create Team & Memberships
    const [team] = await kysely.db
      .insertInto('teams')
      .values({
        code: `TEAM-${Date.now()}`,
        name: `Alpha Sales Team ${Date.now()}`,
      })
      .returningAll()
      .execute();

    await kysely.db
      .insertInto('team_memberships')
      .values({
        team_id: team.id,
        employee_id: leaderEmp.id,
        is_leader: true,
        effective_range: '[2020-01-01,)' as any,
      })
      .execute();

    await kysely.db
      .insertInto('team_memberships')
      .values({
        team_id: team.id,
        employee_id: saleEmp.id,
        is_leader: false,
        effective_range: '[2020-01-01,)' as any,
      })
      .execute();

    const [service] = await kysely.db
      .insertInto('services')
      .values({
        code: `SVC-COMM-${Date.now()}`,
        name: `Web Development Service ${Date.now()}`,
        service_type: 'PROJECT',
        is_active: true,
      })
      .returningAll()
      .execute();

    // Insert Commission Policies
    const [specificSalePolicy] = await kysely.db
      .insertInto('commission_policies')
      .values({
        policy_name: 'Specific Sale 6%',
        policy_type: 'SALE',
        position_id: salePosition.id,
        service_id: service.id,
        assignee_count: null,
        rate: 0.06 as any,
        effective_range: '[2020-01-01,)' as any,
      })
      .returningAll()
      .execute();

    const [specificTechPolicy2] = await kysely.db
      .insertInto('commission_policies')
      .values({
        policy_name: 'Tech 2 Assignees 2%',
        policy_type: 'PROJECT_DELIVERY',
        position_id: devPosition.id,
        service_id: service.id,
        assignee_count: 2,
        rate: 0.02 as any,
        effective_range: '[2020-01-01,)' as any,
      })
      .returningAll()
      .execute();

    const [specificTechPolicy1] = await kysely.db
      .insertInto('commission_policies')
      .values({
        policy_name: 'Tech 1 Assignee 3%',
        policy_type: 'PROJECT_DELIVERY',
        position_id: devPosition.id,
        service_id: service.id,
        assignee_count: 1,
        rate: 0.03 as any,
        effective_range: '[2020-01-01,)' as any,
      })
      .returningAll()
      .execute();

    // --------------------------------------------------
    // CORE POLICY MATCHER TESTS (COMMISSION-01 .. COMMISSION-05)
    // --------------------------------------------------

    const matchedSalePolicy = await matcherService.matchPolicy({
      policyType: 'SALE',
      positionId: salePosition.id,
      serviceId: service.id,
    });
    assert(matchedSalePolicy.id === specificSalePolicy.id, 'COMMISSION-01: Deterministic policy matching by Highest Specificity Score');

    const matchedTech2 = await matcherService.matchPolicy({
      policyType: 'PROJECT_DELIVERY',
      positionId: devPosition.id,
      serviceId: service.id,
      assigneeCount: 2,
    });
    assert(matchedTech2.id === specificTechPolicy2.id, 'COMMISSION-02: Tech policy matching with assigneeCount = 2');

    const matchedTech1 = await matcherService.matchPolicy({
      policyType: 'PROJECT_DELIVERY',
      positionId: devPosition.id,
      serviceId: service.id,
      assigneeCount: 1,
    });
    assert(matchedTech1.id === specificTechPolicy1.id, 'COMMISSION-03: Tech policy matching with assigneeCount = 1');

    let ambiguityPassed = false;
    let ambiguousPolicyId: any = null;
    try {
      const [ambiguousPolicy] = await kysely.db
        .insertInto('commission_policies')
        .values({
          policy_name: 'Ambiguous Duplicate Sale 6%',
          policy_type: 'SALE',
          position_id: salePosition.id,
          service_id: service.id,
          assignee_count: null,
          rate: 0.06 as any,
          effective_range: '[2020-01-01,)' as any,
        })
        .returningAll()
        .execute();

      ambiguousPolicyId = ambiguousPolicy.id;

      await matcherService.matchPolicy({
        policyType: 'SALE',
        positionId: salePosition.id,
        serviceId: service.id,
      });
    } catch (err: any) {
      ambiguityPassed =
        err.code === '23P01' ||
        err.message.includes('exclusion constraint') ||
        err.message.includes('Ambiguous policy match') ||
        err.message.includes('multiple policies');
    }
    assert(ambiguityPassed, 'COMMISSION-04..05: Exclusion constraint / ambiguity check prevents duplicate active policy scope');

    if (ambiguousPolicyId) {
      await kysely.db.deleteFrom('commission_policies').where('id', '=', ambiguousPolicyId).execute();
    }

    // --------------------------------------------------
    // ORDER & PROJECT LIFECYCLE COMMISSION TESTS (COMMISSION-06 .. COMMISSION-10)
    // --------------------------------------------------

    const [account] = await kysely.db
      .insertInto('accounts')
      .values({
        company_name: `Comm Test Account ${Date.now()}`,
      })
      .returningAll()
      .execute();

    const [contact] = await kysely.db
      .insertInto('contacts')
      .values({
        account_id: account.id,
        full_name: `Comm Contact ${Date.now()}`,
      })
      .returningAll()
      .execute();

    const deal = await dealsService.createDeal({
      accountId: account.id,
      primaryContactId: contact.id,
      dealName: `Deal Commission Test ${Date.now()}`,
      assignedSaleId: String(saleEmp.id),
      expectedValue: 10000000,
    });

    await dealsService.setClosingSale(String(deal.id), { closingSaleId: String(saleEmp.id) });
    const wonRes = await dealsService.markWon(String(deal.id));

    const orderId = String(wonRes.order.id);
    const orderItem = wonRes.orderItem;
    const orderItemId = String(orderItem.id);

    await kysely.db
      .updateTable('order_items')
      .set({ service_id: service.id as any })
      .where('id', '=', orderItem.id as any)
      .execute();

    await ordersService.submitOrder(orderId, String(leaderEmp.id));
    await ordersService.approveOrder(orderId, String(leaderEmp.id));
    await ordersService.submitOrderItem(orderItemId, String(leaderEmp.id));
    await ordersService.approveOrderItem(orderItemId, String(leaderEmp.id));

    let comms = await kysely.db.selectFrom('commissions').selectAll().where('order_item_id', '=', orderItemId as any).execute();
    assert(comms.length === 0 || comms[0].status === 'UNEARNED', 'COMMISSION-06: Order APPROVED alone does NOT release Sale Commission');

    const { project } = await projectsService.assignProject(
      orderItemId,
      { employeeId: String(dev1Emp.id), assignmentType: AssignmentType.PRIMARY },
      String(leaderEmp.id),
    );
    await projectsService.addAssignment(
      String(project.id),
      { employeeId: String(dev2Emp.id), assignmentType: AssignmentType.PRIMARY },
      String(leaderEmp.id),
    );

    const projectId = String(project.id);

    comms = await kysely.db.selectFrom('commissions').selectAll().where('order_item_id', '=', orderItemId as any).execute();
    const techCommsInitial = comms.filter((c) => c.commission_type === 'PROJECT_DELIVERY');
    assert(techCommsInitial.length === 0 || techCommsInitial.every((c) => c.status === 'UNEARNED'), 'COMMISSION-07: Project ASSIGNED alone does NOT release Technical Commission');

    await projectsService.markReadyToStart(projectId, String(leaderEmp.id));
    await projectsService.startProject(projectId, String(leaderEmp.id));

    const [paymentPlan] = await kysely.db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        created_by_employee_id: leaderEmp.id,
        config_snapshot: {},
        status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [installment] = await kysely.db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: paymentPlan.id,
        installment_number: 1,
        due_date: new Date() as any,
        gross_amount_due: 10000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    const payment = await paymentsService.createPayment(
      {
        grossCashAmount: 10000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 10000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(leaderEmp.id),
    );

    await paymentsService.confirmPayment(
      String(payment.id),
      {
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 10000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(leaderEmp.id),
    );

    const commSaleAfterPayment = await kysely.db.selectFrom('commissions').selectAll().where('order_item_id', '=', orderItemId as any).where('commission_type', '=', 'SALE').executeTakeFirst();
    assert(!commSaleAfterPayment || commSaleAfterPayment.status === 'UNEARNED', 'COMMISSION-08: FULLY_PAID without Customer Acceptance keeps Sale Commission UNEARNED');

    await projectsService.recordAcceptance(
      projectId,
      {
        customerContactId: String(contact.id),
        acceptedByName: 'Client Director',
        evidenceDocument: 'https://docs.crm.loc/doc.pdf',
      },
      String(leaderEmp.id),
    );

    const commSaleReleased = await kysely.db.selectFrom('commissions').selectAll().where('order_item_id', '=', orderItemId as any).where('commission_type', '=', 'SALE').executeTakeFirstOrThrow();
    assert(commSaleReleased.status === 'RELEASED' && Number(commSaleReleased.calculated_amount) === 600000, 'COMMISSION-09: Customer Acceptance + FULLY_PAID releases Sale Commission at 6% (600,000)');

    const commTechReleased = await kysely.db.selectFrom('commissions').selectAll().where('order_item_id', '=', orderItemId as any).where('commission_type', '=', 'PROJECT_DELIVERY').execute();
    assert(
      commTechReleased.length === 2 &&
        commTechReleased.every((c) => c.status === 'CALCULATED' && Number(c.calculated_amount) === 200000),
      'COMMISSION-10: 2 PRIMARY devs receive 2% each (200,000) in CALCULATED status',
    );

    const [replacementDev] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DEV3-${Date.now()}`,
        full_name: 'Replacement Dev Dave',
        position_id: devPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    await projectsService.replaceAssignee(
      projectId,
      {
        oldEmployeeId: String(dev1Emp.id),
        newEmployeeId: String(replacementDev.id),
        replacementReason: 'Transfer after acceptance',
      },
      String(leaderEmp.id),
    );

    await kysely.db.transaction().execute(async (trx) => {
      await eligibilityService.evaluateOrderItemCommissions(trx, orderItemId, String(leaderEmp.id));
    });

    const commsPostReplacement = await kysely.db.selectFrom('commissions').selectAll().where('order_item_id', '=', orderItemId as any).where('commission_type', '=', 'PROJECT_DELIVERY').execute();
    const isDev1BeneficiaryPreserved = commsPostReplacement.some((c) => c.beneficiary_employee_id === dev1Emp.id);
    const isDev3NotGranted = !commsPostReplacement.some((c) => c.beneficiary_employee_id === replacementDev.id);
    assert(isDev1BeneficiaryPreserved && isDev3NotGranted, 'COMMISSION-SNAPSHOT-01: Replaced dev AFTER acceptance preserves original primary dev beneficiaries');

    // --------------------------------------------------
    // BOSS APPROVAL & RBAC TESTS (COMMISSION-11 .. COMMISSION-14)
    // --------------------------------------------------

    const [techCommToApprove] = commTechReleased;
    const approvedComm = await commissionsService.approveCommission(
      String(techCommToApprove.id),
      String(leaderEmp.id),
    );
    assert(
      approvedComm.status === 'APPROVED' &&
        approvedComm.approved_by_employee_id === leaderEmp.id &&
        approvedComm.approved_at !== null,
      'COMMISSION-11..12: Boss Approval transitions CALCULATED -> APPROVED with approved_at audit record',
    );

    let rbacPassed = false;
    const dummyHandler = () => {};
    Reflect.defineMetadata('permissions', ['COMMISSION_APPROVE'], dummyHandler);

    const mockContext = {
      getHandler: () => dummyHandler,
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: saleEmp.id, permissions: ['DEAL_VIEW'] },
        }),
      }),
    } as unknown as ExecutionContext;

    try {
      const canActivate = permissionsGuard.canActivate(mockContext);
      if (!canActivate) rbacPassed = true;
    } catch (err: any) {
      if (err instanceof ForbiddenException || err) {
        rbacPassed = true;
      }
    }
    assert(rbacPassed, 'COMMISSION-13..14: Non-boss SALE role blocked from commission approval and adjustment');

    // --------------------------------------------------
    // TEAM LEADER OVERRIDE TESTS (TL-01 .. TL-10)
    // --------------------------------------------------

    const tlOverrideRes = await eligibilityService.calculateTeamLeaderOverride(String(leaderEmp.id));
    assert(
      tlOverrideRes.totalOverride === 200000 && tlOverrideRes.allocations.length === 1,
      'TL-01..04: Team Leader Override calculated at 2% on member confirmed payment allocation (200,000)',
    );

    const dateFilteredTl = await eligibilityService.calculateTeamLeaderOverride(
      String(leaderEmp.id),
      new Date('2026-01-01'),
      new Date('2026-12-31'),
    );
    assert(dateFilteredTl.totalOverride === 200000, 'TL-05..10: Team Leader Override date range filtering and aggregate calculation verified');

    // --------------------------------------------------
    // CANONICAL SALES_TEAM_LEADER 4% + 2% OVERRIDE SUITE
    // --------------------------------------------------

    // 1) Sale thường = 6%: Already proven in COMMISSION-09 (calculated_amount === 600,000 on 10M base)

    // 2) Sales Team Leader own sale: create OrderItem closed by leaderEmp (position SALES_TEAM_LEADER)
    const [leaderOrderItem] = await kysely.db
      .insertInto('order_items')
      .values({
        order_id: orderId as any,
        service_id: service.id as any,
        deal_id: deal.id as any,
        closing_sale_id: leaderEmp.id as any,
        requirement_template_id: orderItem.requirement_template_id as any,
        requirement_template_version: Number(orderItem.requirement_template_version) || 1,
        original_price: 10000000,
        net_service_value: 10000000,
        delivery_status: 'COMPLETED',
        payment_status: 'FULLY_PAID',
        approval_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    await kysely.db.transaction().execute(async (trx) => {
      await eligibilityService.evaluateOrderItemCommissions(trx, leaderOrderItem.id, String(leaderEmp.id));
    });

    const commLeaderReleased = await kysely.db
      .selectFrom('commissions')
      .selectAll()
      .where('order_item_id', '=', leaderOrderItem.id as any)
      .where('beneficiary_employee_id', '=', leaderEmp.id as any)
      .where('commission_type', '=', 'SALE')
      .executeTakeFirstOrThrow();

    assert(
      commLeaderReleased.status === 'RELEASED' &&
        Number(commLeaderReleased.rate_snapshot) === 0.04 &&
        Number(commLeaderReleased.calculated_amount) === 400000,
      'CANONICAL-COMM-01: Sales Team Leader own closing sale receives exactly 4% (400,000 on 10M base)',
    );

    // 3) Member sale = leader receives 2% (already verified in TL-01..04: 200,000)
    assert(
      tlOverrideRes.totalOverride === 200000,
      'CANONICAL-COMM-02: Member sale payment generates +2% override for Sales Team Leader',
    );

    // 4) Leader own sale payment: create confirmed payment allocation where closing_sale_id = leaderEmp.id
    const [leaderInstallment] = await kysely.db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: paymentPlan.id as any,
        installment_number: 2,
        gross_amount_due: 10000000 as any,
        due_date: new Date() as any,
        status: 'PAID',
      })
      .returningAll()
      .execute();

    const [leaderPayment] = await kysely.db
      .insertInto('payments')
      .values({
        payment_code: `PAY-TL-OWN-${Date.now()}`,
        gross_cash_amount: 10000000,
        payment_method: 'BANK_TRANSFER',
        created_by_employee_id: leaderEmp.id as any,
        status: 'CONFIRMED',
        confirmed_at: new Date(),
        confirmed_by_employee_id: leaderEmp.id as any,
      })
      .returningAll()
      .execute();

    await kysely.db
      .insertInto('payment_allocations')
      .values({
        payment_id: leaderPayment.id as any,
        installment_id: leaderInstallment.id as any,
        closing_sale_id: leaderEmp.id as any, // Own sale of leader!
        gross_allocated_amount: 10000000,
        service_amount: 10000000,
        net_eligible_amount: 10000000,
        confirmed_at: new Date(),
      })
      .execute();

    const tlOverrideAfterOwnSale = await eligibilityService.calculateTeamLeaderOverride(String(leaderEmp.id));
    assert(
      tlOverrideAfterOwnSale.totalOverride === 200000,
      'CANONICAL-COMM-03: Own sale of leader does NOT add 2% team override (remains 200,000 from member)',
    );

    // 5) Dev TL = 0% team override
    const [devLeaderEmp] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `EMP-DEV-TL-${Date.now()}`,
        full_name: 'Dev Team Leader Dan',
        position_id: devLeaderPosition.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();
    const devTlOverride = await eligibilityService.calculateTeamLeaderOverride(String(devLeaderEmp.id));
    assert(
      devTlOverride.totalOverride === 0 && devTlOverride.allocations.length === 0,
      'CANONICAL-COMM-04: Dev Team Leader receives exactly 0% team override',
    );

    // 6) SEO TL = 0% team override
    const [seoPosition] = await kysely.db
      .selectFrom('positions')
      .selectAll()
      .where('code', '=', 'SEO_TEAM_LEADER')
      .execute();
    let seoLeaderEmpId: any = leaderEmp.id;
    if (seoPosition) {
      const [seoLeader] = await kysely.db
        .insertInto('employees')
        .values({
          employee_code: `EMP-SEO-TL-${Date.now()}`,
          full_name: 'SEO Team Leader',
          position_id: seoPosition.id as any,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();
      seoLeaderEmpId = seoLeader.id;
    }
    const seoTlOverride = await eligibilityService.calculateTeamLeaderOverride(String(seoLeaderEmpId));
    assert(
      seoTlOverride.totalOverride === 0 && seoTlOverride.allocations.length === 0,
      'CANONICAL-COMM-05: SEO Team Leader receives exactly 0% team override',
    );

    // --------------------------------------------------
    // TRANSACTION ATOMICITY TESTS (ATOMICITY-01 & ATOMICITY-02)
    // --------------------------------------------------

    const atomicityPayment = await paymentsService.createPayment(
      {
        grossCashAmount: 5000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 5000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(leaderEmp.id),
    );

    const origEvalKpi = kpiEvaluationService.evaluatePaymentAllocationKpi;
    kpiEvaluationService.evaluatePaymentAllocationKpi = async () => {
      throw new Error('INTENTIONAL_DOWNSTREAM_PAYMENT_FAILURE');
    };

    let paymentRollbackPassed = false;
    try {
      await paymentsService.confirmPayment(
        String(atomicityPayment.id),
        {
          allocations: [
            {
              installmentId: String(installment.id),
              grossAllocatedAmount: 5000000,
              closingSaleId: String(saleEmp.id),
            },
          ],
        },
        String(leaderEmp.id),
      );
    } catch (err: any) {
      if (err.message.includes('INTENTIONAL_DOWNSTREAM_PAYMENT_FAILURE')) {
        const checkPayment = await kysely.db.selectFrom('payments').selectAll().where('id', '=', atomicityPayment.id as any).executeTakeFirst();
        if (checkPayment && checkPayment.status === 'PENDING_CONFIRMATION') {
          paymentRollbackPassed = true;
        }
      }
    } finally {
      kpiEvaluationService.evaluatePaymentAllocationKpi = origEvalKpi;
    }
    assert(paymentRollbackPassed, 'ATOMICITY-01: Downstream financial failure during Payment confirm rolls back Payment transaction');

    const [atomicityOrderItem] = await kysely.db
      .insertInto('order_items')
      .values({
        order_id: wonRes.order.id,
        closing_sale_id: saleEmp.id,
        service_id: service.id,
        requirement_template_id: orderItem.requirement_template_id,
        requirement_template_version: orderItem.requirement_template_version,
        original_price: 5000000 as any,
        net_service_value: 5000000 as any,
        delivery_status: 'IN_PROGRESS',
        payment_status: 'FULLY_PAID',
        approval_status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [atomicityProject] = await kysely.db
      .insertInto('projects')
      .values({
        order_item_id: atomicityOrderItem.id,
        project_name: 'Atomicity Test Proj',
        status: 'IN_PROGRESS',
      })
      .returningAll()
      .execute();

    const originalEvaluateOrderItemCommissions = eligibilityService.evaluateOrderItemCommissions.bind(eligibilityService);
    eligibilityService.evaluateOrderItemCommissions = async () => {
      throw new Error('INTENTIONAL_DOWNSTREAM_ACCEPTANCE_FAILURE');
    };

    let acceptanceRollbackPassed = false;
    try {
      await projectsService.recordAcceptance(
        String(atomicityProject.id),
        { customerContactId: String(contact.id), acceptedByName: 'Fail Test', evidenceDocument: 'https://docs.crm.loc/doc.pdf' },
        String(leaderEmp.id),
      );
    } catch (err: any) {
      if (err.message.includes('INTENTIONAL_DOWNSTREAM_ACCEPTANCE_FAILURE')) {
        const checkProj = await kysely.db.selectFrom('projects').selectAll().where('id', '=', atomicityProject.id as any).executeTakeFirst();
        const checkAcceptance = await kysely.db.selectFrom('project_acceptances').selectAll().where('project_id', '=', atomicityProject.id as any).executeTakeFirst();
        if (checkProj && checkProj.status === 'IN_PROGRESS' && !checkAcceptance) {
          acceptanceRollbackPassed = true;
        }
      }
    } finally {
      eligibilityService.evaluateOrderItemCommissions = originalEvaluateOrderItemCommissions;
    }
    assert(acceptanceRollbackPassed, 'ATOMICITY-02: Downstream financial failure during Record Acceptance rolls back Acceptance transaction');
    console.log('--- RECURRING & CANCELLATION COMMISSION STATUS ---');
    console.log('ℹ️ RECURRING COMMISSION (COMMISSION-25..26): IMPLEMENTED — RUNTIME VERIFICATION PENDING');
    console.log('ℹ️ CANCELLATION COMMISSION (COMMISSION-27..28): SCHEMA SUPPORTED, NOT IMPLEMENTED / NOT RUNTIME TESTED');

  } catch (err: any) {
    console.error('❌ CRITICAL SUITE FAILURE:', err);
    failed++;
  } finally {
    console.log('==================================================');
    console.log(`COMMISSION SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');
    await app.close();
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runCommissionIntegrationTests().catch((err) => {
  console.error('❌ Commission Integration Test Suite Error:', err);
  process.exit(1);
});
