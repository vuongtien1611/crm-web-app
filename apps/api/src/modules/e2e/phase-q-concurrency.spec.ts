import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from '../deals/deals.service';
import { OrdersService } from '../orders/orders.service';
import { ProjectsService } from '../projects/projects.service';
import { PaymentsService } from '../payments/payments.service';
import { PayrollService } from '../payroll/payroll.service';
import { LeadQuality } from '../leads/dto/update-lead-quality.dto';
import { AssignmentType } from '../projects/dto/assign-project.dto';

function assert(condition: boolean, testName: string, failureReason?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName} - ${failureReason || 'Assertion failed'}`);
    throw new Error(`Concurrency test failed: ${testName} (${failureReason})`);
  }
}

export async function runPhaseQConcurrencySuite() {
  console.log('====================================================');
  console.log('STARTING PHASE Q: CONCURRENCY HARDENING SUITE');
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

  const runId = Math.floor(Math.random() * 1000000);

  try {
    // ----------------------------------------------------------------
    // FIXTURES SETUP
    // ----------------------------------------------------------------
    const posBoss = await db.selectFrom('positions').selectAll().where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const posSale = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const posDev = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();

    const [boss] = await db.insertInto('employees').values({ employee_code: `CON-BOSS-${runId}`, full_name: `Con Boss ${runId}`, position_id: posBoss.id, status: 'ACTIVE' }).returningAll().execute();
    const [sale] = await db.insertInto('employees').values({ employee_code: `CON-SALE-${runId}`, full_name: `Con Sale ${runId}`, position_id: posSale.id, status: 'ACTIVE' }).returningAll().execute();
    const [dev1] = await db.insertInto('employees').values({ employee_code: `CON-DEV1-${runId}`, full_name: `Con Dev 1 ${runId}`, position_id: posDev.id, status: 'ACTIVE' }).returningAll().execute();
    const [dev2] = await db.insertInto('employees').values({ employee_code: `CON-DEV2-${runId}`, full_name: `Con Dev 2 ${runId}`, position_id: posDev.id, status: 'ACTIVE' }).returningAll().execute();
    const [dev3] = await db.insertInto('employees').values({ employee_code: `CON-DEV3-${runId}`, full_name: `Con Dev 3 ${runId}`, position_id: posDev.id, status: 'ACTIVE' }).returningAll().execute();
    const [dev4] = await db.insertInto('employees').values({ employee_code: `CON-DEV4-${runId}`, full_name: `Con Dev 4 ${runId}`, position_id: posDev.id, status: 'ACTIVE' }).returningAll().execute();

    // ----------------------------------------------------------------
    // Q-CON-01: 2 concurrent requests convert same Lead -> Deal
    // Expectation: Exactly 1 Deal created (database UNIQUE(lead_id) protects race condition)
    // ----------------------------------------------------------------
    console.log('\n--- Q-CON-01: Concurrent Convert Same Lead to Deal ---');

    const leadCon = await leadsService.createLead(
      { fullName: `Race Lead ${runId}`, phone: '0979998888', assignedSaleId: String(sale.id) },
      { employeeId: String(boss.id), roles: ['BOSS'] },
    );
    await leadsService.qualifyLead(String(leadCon.id), { quality: LeadQuality.POTENTIAL });

    const [res1, res2] = await Promise.allSettled([
      leadsService.convertToDeal(String(leadCon.id), { companyName: `Race Corp 1 ${runId}`, contactName: 'Contact 1', dealName: `Race Deal 1 ${runId}` }, String(sale.id)),
      leadsService.convertToDeal(String(leadCon.id), { companyName: `Race Corp 2 ${runId}`, contactName: 'Contact 2', dealName: `Race Deal 2 ${runId}` }, String(sale.id)),
    ]);

    const dealsForLead = await db.selectFrom('deals').selectAll().where('lead_id', '=', leadCon.id).execute();
    assert(dealsForLead.length === 1, 'Q-CON-01: Concurrent conversion results in exactly 1 canonical Deal (no duplicate deals created)');
    assert(
      (res1.status === 'fulfilled' && res2.status === 'rejected') ||
      (res1.status === 'rejected' && res2.status === 'fulfilled'),
      'Q-CON-01: One concurrent conversion succeeds while the other is rejected',
    );

    // ----------------------------------------------------------------
    // Q-CON-02: 2 concurrent approve/order actions
    // Expectation: State transition valid, no duplicate audit or corrupt status
    // ----------------------------------------------------------------
    console.log('\n--- Q-CON-02: Concurrent Approve Order Actions ---');

    const dealWon = dealsForLead[0];
    await dealsService.startNegotiation(String(dealWon.id));
    await dealsService.setClosingSale(String(dealWon.id), { closingSaleId: String(sale.id) });
    const wonResult = await dealsService.markWon(String(dealWon.id));
    const orderId = String(wonResult.order.id);
    const orderItemId = String(wonResult.orderItem.id);

    await ordersService.submitOrder(orderId, String(sale.id));

    const [appr1, appr2] = await Promise.allSettled([
      ordersService.approveOrder(orderId, String(boss.id)),
      ordersService.approveOrder(orderId, String(boss.id)),
    ]);

    const orderRow = await db.selectFrom('orders').selectAll().where('id', '=', wonResult.order.id).executeTakeFirstOrThrow();
    assert(orderRow.workflow_status === 'APPROVED', 'Q-CON-02: Order workflow_status is reliably APPROVED under concurrent approval');

    // ----------------------------------------------------------------
    // Q-CON-03: 2 concurrent create Project for same approved OrderItem
    // Expectation: Exactly 1 canonical Project created (UNIQUE(order_item_id) enforced)
    // ----------------------------------------------------------------
    console.log('\n--- Q-CON-03: Concurrent Project Creation for Same OrderItem ---');

    await ordersService.submitOrderItem(orderItemId, String(sale.id));
    await ordersService.approveOrderItem(orderItemId, String(boss.id));

    const [projRes1, projRes2] = await Promise.allSettled([
      projectsService.assignProject(orderItemId, { employeeId: String(dev1.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id)),
      projectsService.assignProject(orderItemId, { employeeId: String(dev2.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id)),
    ]);

    const projectsCreated = await db.selectFrom('projects').selectAll().where('order_item_id', '=', wonResult.orderItem.id).execute();
    assert(projectsCreated.length === 1, 'Q-CON-03: Concurrent project assignments create exactly 1 canonical Project');
    assert(
      (projRes1.status === 'fulfilled' && projRes2.status === 'rejected') ||
      (projRes1.status === 'rejected' && projRes2.status === 'fulfilled'),
      'Q-CON-03: Race condition handled: exactly one creator succeeds',
    );

    const projectCanonical = projectsCreated[0];
    const projectId = String(projectCanonical.id);

    // ----------------------------------------------------------------
    // Q-CON-04: 2 concurrent Payment confirmations
    // Expectation: Allocation not duplicated, serialized via forUpdate
    // ----------------------------------------------------------------
    console.log('\n--- Q-CON-04: Concurrent Payment Confirmations ---');

    const [plan] = await db.insertInto('order_item_payment_plans').values({
      order_item_id: wonResult.orderItem.id,
      created_by_employee_id: boss.id,
      config_snapshot: {},
      status: 'APPROVED',
    }).returningAll().execute();

    const [inst] = await db.insertInto('payment_installments').values({
      payment_plan_id: plan.id,
      installment_number: 1,
      due_date: new Date().toISOString().split('T')[0] as any,
      gross_amount_due: 15000000 as any,
      status: 'PENDING',
    }).returningAll().execute();

    const payCon = await paymentsService.createPayment(
      {
        grossCashAmount: 15000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        allocations: [{ installmentId: String(inst.id), grossAllocatedAmount: 15000000, closingSaleId: String(sale.id) }],
      },
      String(sale.id),
    );

    const [payConf1, payConf2] = await Promise.allSettled([
      paymentsService.confirmPayment(
        String(payCon.id),
        { allocations: [{ installmentId: String(inst.id), grossAllocatedAmount: 15000000, vatAllocatedAmount: 0, serviceAmount: 15000000, netEligibleAmount: 15000000, closingSaleId: String(sale.id) }] },
        String(boss.id),
      ),
      paymentsService.confirmPayment(
        String(payCon.id),
        { allocations: [{ installmentId: String(inst.id), grossAllocatedAmount: 15000000, vatAllocatedAmount: 0, serviceAmount: 15000000, netEligibleAmount: 15000000, closingSaleId: String(sale.id) }] },
        String(boss.id),
      ),
    ]);

    const allocations = await db.selectFrom('payment_allocations').selectAll().where('payment_id', '=', payCon.id).execute();
    assert(allocations.length === 1, 'Q-CON-04: Exactly 1 set of allocations created (no double allocation under concurrent confirm)');
    assert(
      (payConf1.status === 'fulfilled' && payConf2.status === 'rejected') ||
      (payConf1.status === 'rejected' && payConf2.status === 'fulfilled'),
      'Q-CON-04: Second concurrent payment confirm rejected idempotently',
    );

    // ----------------------------------------------------------------
    // Q-CON-05: 2 concurrent assignee replacement requests
    // Expectation: Temporal history not corrupted, max 2 active primary maintained
    // ----------------------------------------------------------------
    console.log('\n--- Q-CON-05: Concurrent Assignee Replacement Requests ---');

    // Currently dev1 or dev2 is PRIMARY
    const initialAssignment = await db.selectFrom('project_assignments').selectAll().where('project_id', '=', projectCanonical.id).where('is_active', '=', true).executeTakeFirstOrThrow();
    const activeDevId = String(initialAssignment.employee_id);

    const [rep1, rep2] = await Promise.allSettled([
      projectsService.replaceAssignee(projectId, { oldEmployeeId: activeDevId, newEmployeeId: String(dev3.id), replacementReason: 'Concurrent Swap 1' }, String(boss.id)),
      projectsService.replaceAssignee(projectId, { oldEmployeeId: activeDevId, newEmployeeId: String(dev4.id), replacementReason: 'Concurrent Swap 2' }, String(boss.id)),
    ]);

    const activePrimaries = await db
      .selectFrom('project_assignments')
      .selectAll()
      .where('project_id', '=', projectCanonical.id)
      .where('assignment_type', '=', 'PRIMARY')
      .where('is_active', '=', true)
      .execute();

    assert(activePrimaries.length <= 2, 'Q-CON-05a: Active PRIMARY count strictly <= 2 under concurrent replacement');
    assert(
      (rep1.status === 'fulfilled' && rep2.status === 'rejected') ||
      (rep1.status === 'rejected' && rep2.status === 'fulfilled'),
      'Q-CON-05b: Race on same replaced assignee safely resolves one winner',
    );

    // ----------------------------------------------------------------
    // Q-CON-06: 2 concurrent payroll calculate/lock operations
    // Expectation: No inconsistent rows, clean single locked state
    // ----------------------------------------------------------------
    console.log('\n--- Q-CON-06: Concurrent Payroll Calculate & Lock ---');

    const periodKeyCon = `2026-09-CON-${runId}`;
    const [periodCon] = await db
      .insertInto('payroll_periods')
      .values({
        period_key: periodKeyCon,
        start_date: '2026-09-01' as any,
        end_date: '2026-09-30' as any,
        status: 'OPEN',
      })
      .returningAll()
      .execute();

    // 2 concurrent calculations
    const [calc1, calc2] = await Promise.allSettled([
      payrollService.calculatePayrollPeriod(String(periodCon.id), String(boss.id)),
      payrollService.calculatePayrollPeriod(String(periodCon.id), String(boss.id)),
    ]);

    const periodPayrolls = await db.selectFrom('payrolls').selectAll().where('payroll_period_id', '=', periodCon.id).execute();
    const uniqueEmployees = new Set(periodPayrolls.map((p) => p.employee_id));
    assert(periodPayrolls.length === uniqueEmployees.size, 'Q-CON-06a: No duplicate employee payroll rows generated under concurrent calculation');

    // Approve then test concurrent lock
    await payrollService.approvePeriod(String(periodCon.id), String(boss.id));

    const [lock1, lock2] = await Promise.allSettled([
      payrollService.lockPeriod(String(periodCon.id), String(boss.id)),
      payrollService.lockPeriod(String(periodCon.id), String(boss.id)),
    ]);

    const lockedPeriodCheck = await db.selectFrom('payroll_periods').selectAll().where('id', '=', periodCon.id).executeTakeFirstOrThrow();
    assert(lockedPeriodCheck.status === 'LOCKED', 'Q-CON-06b: Period status is reliably LOCKED');
    assert(
      (lock1.status === 'fulfilled' && lock2.status === 'rejected') ||
      (lock1.status === 'rejected' && lock2.status === 'fulfilled'),
      'Q-CON-06c: Exactly one concurrent lock operation succeeds',
    );

    console.log('====================================================');
    console.log('PHASE Q CONCURRENCY HARDENING: ALL 6 TESTS PASSED! ✅');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runPhaseQConcurrencySuite().catch((err) => {
    console.error('❌ Phase Q Concurrency suite error:', err);
    process.exit(1);
  });
}
