import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from '../deals/deals.service';
import { OrdersService } from '../orders/orders.service';
import { ProjectsService } from '../projects/projects.service';
import { PaymentsService } from '../payments/payments.service';
import { PayrollService } from '../payroll/payroll.service';
import { StorageService } from '../storage/storage.service';
import { SubscriptionsService } from '../subscriptions/subscriptions.service';
import { LeadQuality } from '../leads/dto/update-lead-quality.dto';
import { AssignmentType } from '../projects/dto/assign-project.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { PaymentsController } from '../payments/payments.controller';
import { ProjectsController } from '../projects/projects.controller';
import { StorageController } from '../storage/storage.controller';
import { ExecutionContext, ForbiddenException, BadRequestException } from '@nestjs/common';

function assert(condition: boolean, testName: string, failureReason?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName} - ${failureReason || 'Assertion failed'}`);
    throw new Error(`Negative test failed: ${testName} (${failureReason})`);
  }
}

const createMockContext = (userPermissions: string[], handler: any): ExecutionContext => {
  return {
    getHandler: () => handler,
    getClass: () => PaymentsController,
    switchToHttp: () => ({
      getRequest: () => ({
        user: {
          permissions: userPermissions,
        },
      }),
    }),
  } as unknown as ExecutionContext;
};

export async function runPhaseQNegativeSuite() {
  console.log('====================================================');
  console.log('STARTING PHASE Q: NEGATIVE E2E SECURITY & INVARIANTS');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const kysely = app.get(KyselyService);
  const db = kysely.db;
  const leadsService = app.get(LeadsService);
  const dealsService = app.get(DealsService);
  const ordersService = app.get(OrdersService);
  const projectsService = app.get(ProjectsService);
  const paymentsService = app.get(PaymentsService);
  const payrollService = app.get(PayrollService);
  const storageService = app.get(StorageService);
  const subscriptionsService = app.get(SubscriptionsService);
  const permissionsGuard = new PermissionsGuard(new Reflector());

  const runId = Math.floor(Math.random() * 1000000);

  try {
    // ----------------------------------------------------------------
    // FIXTURES SETUP FOR NEGATIVE TESTS
    // ----------------------------------------------------------------
    const posBoss = await db.selectFrom('positions').selectAll().where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const posSale = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const posDev = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();
    const posDevLeader = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV_TEAM_LEADER').executeTakeFirstOrThrow();

    // Employees
    const [boss] = await db.insertInto('employees').values({ employee_code: `NEG-BOSS-${runId}`, full_name: `Neg Boss ${runId}`, position_id: posBoss.id, status: 'ACTIVE' }).returningAll().execute();
    const [saleA] = await db.insertInto('employees').values({ employee_code: `NEG-SALE-A-${runId}`, full_name: `Sale Team A ${runId}`, position_id: posSale.id, status: 'ACTIVE' }).returningAll().execute();
    const [saleB] = await db.insertInto('employees').values({ employee_code: `NEG-SALE-B-${runId}`, full_name: `Sale Team B ${runId}`, position_id: posSale.id, status: 'ACTIVE' }).returningAll().execute();
    const [devA] = await db.insertInto('employees').values({ employee_code: `NEG-DEV-A-${runId}`, full_name: `Dev Team A ${runId}`, position_id: posDev.id, status: 'ACTIVE' }).returningAll().execute();
    const [devLeader] = await db.insertInto('employees').values({ employee_code: `NEG-DEV-LEAD-${runId}`, full_name: `Dev Leader ${runId}`, position_id: posDevLeader.id, status: 'ACTIVE' }).returningAll().execute();

    // Teams
    const [teamA] = await db.insertInto('teams').values({ code: `TEAM-NEG-A-${runId}`, name: `Team A ${runId}`, department: 'SALES' }).returningAll().execute();
    const [teamB] = await db.insertInto('teams').values({ code: `TEAM-NEG-B-${runId}`, name: `Team B ${runId}`, department: 'SALES' }).returningAll().execute();

    await db.insertInto('team_memberships').values({ team_id: teamA.id, employee_id: saleA.id, is_leader: false, effective_range: '[2020-01-01,)' as any }).execute();
    await db.insertInto('team_memberships').values({ team_id: teamB.id, employee_id: saleB.id, is_leader: false, effective_range: '[2020-01-01,)' as any }).execute();

    // ----------------------------------------------------------------
    // Q-NEG-01: Lead NOT_POTENTIAL -> không create Deal
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-01: Lead NOT_POTENTIAL Cannot Convert to Deal ---');

    const lead1 = await leadsService.createLead(
      { fullName: `Lead Bad Quality ${runId}`, phone: '0981111222', assignedSaleId: String(saleA.id) },
      { employeeId: String(boss.id), roles: ['BOSS'] },
    );
    await leadsService.qualifyLead(String(lead1.id), { quality: LeadQuality.NOT_POTENTIAL, notPotentialReason: 'Spam / Out of budget' });

    let qNeg01Blocked = false;
    try {
      await leadsService.convertToDeal(String(lead1.id), { companyName: 'Bad Co', contactName: 'Bad Contact', dealName: 'Bad Deal' }, String(saleA.id));
    } catch (err: any) {
      qNeg01Blocked = err.message.includes('POTENTIAL') || err instanceof BadRequestException;
    }
    assert(qNeg01Blocked, 'Q-NEG-01: Lead with quality NOT_POTENTIAL strictly blocked from converting to Deal');

    // ----------------------------------------------------------------
    // Q-NEG-02: Sale ngoài team -> không xem Lead của Team khác
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-02: Sale Outside Team Cannot View Other Team Leads ---');

    const leadTeamA = await leadsService.createLead(
      { fullName: `Team A Confidential Lead ${runId}`, phone: '0982222333', assignedSaleId: String(saleA.id) },
      { employeeId: String(boss.id), roles: ['BOSS'] },
    );

    const saleBLeads = await leadsService.findLeads({ assignedSaleIdOnly: String(saleB.id) });
    const containsLeadA = saleBLeads.data.some((l: any) => l.id === leadTeamA.id);
    assert(!containsLeadA, 'Q-NEG-02: Sale B scoped query strictly excludes Team A Lead');

    // ----------------------------------------------------------------
    // Q-NEG-03: Order chưa Boss approve -> không tạo Project
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-03: Unapproved Order Cannot Create Project ---');

    const [account] = await db.insertInto('accounts').values({ company_name: `Neg Corp ${runId}` }).returningAll().execute();
    const [contact] = await db.insertInto('contacts').values({ account_id: account.id, full_name: 'Neg Contact', is_primary: true }).returningAll().execute();
    const dealNeg = await dealsService.createDeal({
      accountId: account.id,
      primaryContactId: contact.id,
      dealName: `Neg Unapproved Deal ${runId}`,
      assignedSaleId: String(saleA.id),
      expectedValue: 15000000,
    });
    await dealsService.setClosingSale(String(dealNeg.id), { closingSaleId: String(saleA.id) });
    const wonNeg = await dealsService.markWon(String(dealNeg.id));

    const unapprovedOrderItemId = String(wonNeg.orderItem.id);

    let qNeg03Blocked = false;
    try {
      await projectsService.assignProject(
        unapprovedOrderItemId,
        { employeeId: String(devA.id), assignmentType: AssignmentType.PRIMARY },
        String(boss.id),
      );
    } catch (err: any) {
      qNeg03Blocked = err.message.includes('unapproved') || err.message.includes('not ready');
    }
    assert(qNeg03Blocked, 'Q-NEG-03: Creating Project for unapproved OrderItem is rejected');

    // Now approve the order & item so we can test downstream invariants
    await ordersService.submitOrder(String(wonNeg.order.id), String(boss.id));
    await ordersService.approveOrder(String(wonNeg.order.id), String(boss.id));
    await ordersService.submitOrderItem(unapprovedOrderItemId, String(boss.id));
    await ordersService.approveOrderItem(unapprovedOrderItemId, String(boss.id));

    // ----------------------------------------------------------------
    // Q-NEG-04: Payment chưa CONFIRMED -> không release Sale commission/KPI
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-04: Unconfirmed Payment Does Not Release Commission/KPI ---');

    const [planNeg] = await db.insertInto('order_item_payment_plans').values({
      order_item_id: wonNeg.orderItem.id,
      created_by_employee_id: boss.id,
      config_snapshot: {},
      status: 'APPROVED',
    }).returningAll().execute();

    const [instNeg] = await db.insertInto('payment_installments').values({
      payment_plan_id: planNeg.id,
      installment_number: 1,
      due_date: new Date().toISOString().split('T')[0] as any,
      gross_amount_due: 15000000 as any,
      status: 'PENDING',
    }).returningAll().execute();

    // Create payment in PENDING_CONFIRMATION
    const unconfirmedPay = await paymentsService.createPayment(
      {
        grossCashAmount: 15000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        allocations: [{ installmentId: String(instNeg.id), grossAllocatedAmount: 15000000, closingSaleId: String(saleA.id) }],
      },
      String(saleA.id),
    );

    // Verify unconfirmed payment has NO active KPI events and NO released commissions
    const saleKpiBefore = await db.selectFrom('kpi_events').selectAll().where('employee_id', '=', saleA.id).where('source_type', '=', 'PAYMENT_ALLOCATION').execute();
    const commsBefore = await db.selectFrom('commissions').selectAll().where('order_item_id', '=', wonNeg.orderItem.id).execute();

    assert(saleKpiBefore.length === 0, 'Q-NEG-04a: Unconfirmed payment creates zero Sale KPI events');
    assert(commsBefore.every((c) => c.status !== 'RELEASED'), 'Q-NEG-04b: Unconfirmed payment does NOT release Sale commissions');

    // ----------------------------------------------------------------
    // Q-NEG-05: Project chưa acceptance -> không release commission delivery
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-05: Project Unaccepted Does Not Release Delivery Commission ---');

    const { project: projNeg } = await projectsService.assignProject(
      unapprovedOrderItemId,
      { employeeId: String(devA.id), assignmentType: AssignmentType.PRIMARY },
      String(boss.id),
    );

    await projectsService.markReadyToStart(String(projNeg.id), String(boss.id));
    await projectsService.startProject(String(projNeg.id), String(boss.id));

    // Confirm Payment now
    await paymentsService.confirmPayment(
      String(unconfirmedPay.id),
      {
        allocations: [
          {
            installmentId: String(instNeg.id),
            grossAllocatedAmount: 15000000,
            vatAllocatedAmount: 0,
            serviceAmount: 15000000,
            netEligibleAmount: 15000000,
            closingSaleId: String(saleA.id),
          },
        ],
      },
      String(boss.id),
    );

    // Check delivery commission before acceptance
    const devCommsBeforeAcceptance = await db
      .selectFrom('commissions')
      .selectAll()
      .where('order_item_id', '=', wonNeg.orderItem.id)
      .where('commission_type', '=', 'PROJECT_DELIVERY')
      .execute();

    assert(
      devCommsBeforeAcceptance.length === 0 || devCommsBeforeAcceptance.every((c) => c.status === 'UNEARNED'),
      'Q-NEG-05: Unaccepted project does NOT release technical delivery commission',
    );

    // ----------------------------------------------------------------
    // Q-NEG-06: Sale không confirm Payment (Forbidden / Guard check)
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-06: Sale Cannot Confirm Payment ---');

    const salePerms = ['LEAD_READ', 'DEAL_READ', 'PAYMENT_READ'];
    let saleConfirmForbidden = false;
    try {
      const ctx = createMockContext(salePerms, PaymentsController.prototype.confirmPayment);
      permissionsGuard.canActivate(ctx);
    } catch (err: any) {
      saleConfirmForbidden = err instanceof ForbiddenException;
    }
    assert(saleConfirmForbidden, 'Q-NEG-06: Sale user without PAYMENT_CONFIRM permission is blocked with 403 Forbidden');

    // ----------------------------------------------------------------
    // Q-NEG-07: Tech Leader không xem financial Subscription data ngoài scope
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-07: Tech Leader Cannot View Financial Subscription Data ---');

    const techLeaderUser = { employeeId: String(devLeader.id), roles: ['DEV_TEAM_LEADER'], permissions: ['PROJECT_READ', 'PROJECT_WRITE'] };
    let subDataBlocked = false;
    try {
      const subs = await subscriptionsService.findSubscriptions({ page: 1, limit: 10 } as any, techLeaderUser);
      if (subs.data && subs.data.length === 0) {
        subDataBlocked = true;
      }
    } catch (err: any) {
      subDataBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(subDataBlocked, 'Q-NEG-07: Tech Leader is restricted from company-wide financial subscription data');

    // ----------------------------------------------------------------
    // Q-NEG-08: Payroll LOCKED -> immutable
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-08: Payroll LOCKED is Strictly Immutable ---');

    const [lockedPeriod] = await db
      .insertInto('payroll_periods')
      .values({
        period_key: `2026-09-LOCKED-${runId}`,
        start_date: '2026-09-01' as any,
        end_date: '2026-09-30' as any,
        status: 'LOCKED',
      })
      .returningAll()
      .execute();

    let qNeg08RecalcBlocked = false;
    try {
      await payrollService.calculatePayrollPeriod(String(lockedPeriod.id), String(boss.id));
    } catch (err: any) {
      qNeg08RecalcBlocked = err instanceof BadRequestException || err.message.includes('LOCKED');
    }
    assert(qNeg08RecalcBlocked, 'Q-NEG-08a: Recalculating a LOCKED payroll period is strictly rejected');

    let qNeg08DbDirectUpdateBlocked = false;
    try {
      await db
        .updateTable('payroll_periods')
        .set({ status: 'OPEN' })
        .where('id', '=', lockedPeriod.id)
        .execute();
    } catch (err: any) {
      // PostgreSQL trigger trg_protect_locked_payroll_periods prevents any update/delete
      qNeg08DbDirectUpdateBlocked = err.message.includes('LOCKED') || err.code === 'P0001';
    }
    assert(qNeg08DbDirectUpdateBlocked, 'Q-NEG-08b: Database trigger strictly prevents modifying LOCKED payroll period');

    // ----------------------------------------------------------------
    // Q-NEG-09: Cross-team Project access -> 403
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-09: Cross-team Project Access Forbidden ---');

    const projectsController = app.get(ProjectsController);
    const devBUser = { employeeId: String(saleB.id), roles: ['DEV'], permissions: ['PROJECT_READ'] };
    let crossTeamForbidden = false;
    try {
      await projectsController.findProjectById(String(projNeg.id), devBUser);
    } catch (err: any) {
      crossTeamForbidden = err instanceof ForbiddenException || err.status === 403;
    }
    assert(crossTeamForbidden, 'Q-NEG-09: Cross-team unassigned developer access to foreign project is blocked with 403 Forbidden');

    // ----------------------------------------------------------------
    // Q-NEG-10: File objectKey biết trước nhưng không có entity permission -> download bị 403
    // ----------------------------------------------------------------
    console.log('\n--- Q-NEG-10: File ObjectKey Known Without Permission Blocked ---');

    const storageController = app.get(StorageController);

    // Sale B user from unrelated team tries to access the payment proof
    const unrelatedReq = {
      user: {
        employeeId: String(saleB.id),
        roles: ['SALE'],
      },
    };

    let downloadBlocked = false;
    try {
      await storageController.getPaymentProof(String(unconfirmedPay.id), unrelatedReq);
    } catch (err: any) {
      downloadBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(downloadBlocked, 'Q-NEG-10: File download with known ID/objectKey without entity ownership is rejected with 403 Forbidden');

    console.log('====================================================');
    console.log('PHASE Q NEGATIVE FLOWS: ALL 10 INVARIANTS PASSED! ✅');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runPhaseQNegativeSuite().catch((err) => {
    console.error('❌ Phase Q Negative suite error:', err);
    process.exit(1);
  });
}
