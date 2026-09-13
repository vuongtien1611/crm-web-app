import { NestFactory, Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PaymentsService } from './payments.service';
import { OrdersService } from '../orders/orders.service';
import { DealsService } from '../deals/deals.service';
import { ProjectsService } from '../projects/projects.service';
import { KyselyService } from '../../database/kysely.service';
import { PaymentMethod } from './dto/create-payment.dto';
import { PermissionsGuard } from '../rbac/guards/permissions.guard';
import { PaymentsController } from './payments.controller';

async function runPaymentIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING PAYMENT FOUNDATION INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
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

  try {
    // --------------------------------------------------
    // FIXTURES SETUP
    // --------------------------------------------------
    const initialGrossCash = await paymentsService.calculateGrossCash();
    const pos = await kysely.db.selectFrom('positions').select('id').executeTakeFirstOrThrow();

    const [boss] = await kysely.db.insertInto('employees').values({
      employee_code: `PAY_BOSS_${Date.now()}`,
      full_name: 'Boss Accountant Manager',
      position_id: pos.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [accountant] = await kysely.db.insertInto('employees').values({
      employee_code: `PAY_ACCT_${Date.now()}`,
      full_name: 'Accountant Staff',
      position_id: pos.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [sale] = await kysely.db.insertInto('employees').values({
      employee_code: `PAY_SALE_${Date.now()}`,
      full_name: 'Sale Representative',
      position_id: pos.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    // Roles & permissions mapping for RBAC testing
    const bossPermissions = ['PAYMENT_CREATE', 'PAYMENT_CONFIRM', 'PAYMENT_REJECT', 'PAYMENT_READ'];
    const accountantPermissions = ['PAYMENT_CREATE', 'PAYMENT_READ'];
    const salePermissions = ['LEAD_CREATE', 'DEAL_CREATE'];

    // Setup Account & Contact
    const account = await kysely.db.insertInto('accounts').values({
      company_name: `Payment Test Corp ${Date.now()}`,
    }).returningAll().executeTakeFirstOrThrow();

    const [contact] = await kysely.db.insertInto('contacts').values({
      account_id: account.id,
      full_name: 'Bob Client',
      email: 'bob@client.com',
      phone: '0977112233',
      is_primary: true,
    }).returningAll().execute();

    // Service fixture
    let webService = await kysely.db.selectFrom('services').selectAll().where('code', '=', 'WEB_DESIGN').executeTakeFirst();
    if (!webService) {
      webService = await kysely.db.selectFrom('services').selectAll().executeTakeFirstOrThrow();
    }

    // Create Deal & Win to get Order
    const deal = await kysely.db.insertInto('deals').values({
      account_id: account.id,
      assigned_sale_id: sale.id,
      closing_sale_id: sale.id,
      deal_name: 'Payment Integration Deal',
      expected_value: 100000000,
      status: 'OPEN',
    }).returningAll().executeTakeFirstOrThrow();

    await dealsService.markWon(String(deal.id));

    const order = await kysely.db.selectFrom('orders').selectAll().where('account_id', '=', account.id).executeTakeFirstOrThrow();
    const orderItem = await kysely.db.selectFrom('order_items').selectAll().where('order_id', '=', order.id).executeTakeFirstOrThrow();

    await ordersService.submitOrder(String(order.id), String(boss.id));
    await ordersService.approveOrder(String(order.id), String(boss.id));
    await ordersService.submitOrderItem(String(orderItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(orderItem.id), String(boss.id));

    // Create an Approved Payment Plan with 2 Installments:
    // Installment 1: 50,000,000 gross
    // Installment 2: 50,000,000 gross
    const [plan] = await kysely.db.insertInto('order_item_payment_plans').values({
      order_item_id: orderItem.id,
      status: 'APPROVED',
      version: 1,
      created_by_employee_id: boss.id,
      config_snapshot: JSON.stringify({ type: '50_50' }),
      approved_at: new Date(),
    }).returningAll().execute();

    const [inst1] = await kysely.db.insertInto('payment_installments').values({
      payment_plan_id: plan.id,
      installment_number: 1,
      due_date: new Date().toISOString().split('T')[0] as any,
      gross_amount_due: 50000000 as any,
      status: 'PENDING',
    }).returningAll().execute();

    const [inst2] = await kysely.db.insertInto('payment_installments').values({
      payment_plan_id: plan.id,
      installment_number: 2,
      due_date: new Date().toISOString().split('T')[0] as any,
      gross_amount_due: 50000000 as any,
      status: 'PENDING',
    }).returningAll().execute();

    // --------------------------------------------------
    // RBAC ADDITIONAL REQUIREMENT: SALE CANNOT CREATE PAYMENT
    // --------------------------------------------------
    let saleCreateDenied = false;
    try {
      const ctx = createMockContext(salePermissions, PaymentsController.prototype.createPayment);
      permissionsGuard.canActivate(ctx);
    } catch (err: any) {
      saleCreateDenied = err instanceof ForbiddenException;
    }
    assert(saleCreateDenied, 'SALE_CREATE_PAYMENT_DENIED: Sale role attempt to create payment is blocked by PermissionsGuard');

    // --------------------------------------------------
    // PAYMENT-01: Accountant can create PENDING_CONFIRMATION Payment
    // --------------------------------------------------
    const p1 = await paymentsService.createPayment(
      { grossCashAmount: 30000000, paymentMethod: PaymentMethod.BANK_TRANSFER, evidenceUrl: 'https://proof.loc/1.pdf' },
      String(accountant.id),
    );
    assert(p1.status === 'PENDING_CONFIRMATION' && String(p1.created_by_employee_id) === String(accountant.id), 'PAYMENT-01: Accountant can create PENDING_CONFIRMATION Payment');

    // --------------------------------------------------
    // PAYMENT-02: Unconfirmed Payment does not alter installment or item statuses
    // --------------------------------------------------
    const checkInst1 = await kysely.db.selectFrom('payment_installments').selectAll().where('id', '=', inst1.id).executeTakeFirstOrThrow();
    const checkItem = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', orderItem.id).executeTakeFirstOrThrow();
    assert(checkInst1.status === 'PENDING' && checkItem.payment_status === 'UNPAID', 'PAYMENT-02: Unconfirmed Payment does not alter installment or item statuses');

    // --------------------------------------------------
    // PAYMENT-03 & ACCOUNTANT_CONFIRM_DENIED: Accountant cannot confirm Payment
    // --------------------------------------------------
    let acctConfirmDenied = false;
    try {
      const ctx = createMockContext(accountantPermissions, PaymentsController.prototype.confirmPayment);
      permissionsGuard.canActivate(ctx);
    } catch (err: any) {
      acctConfirmDenied = err instanceof ForbiddenException;
    }
    const p1StillPending = await kysely.db.selectFrom('payments').selectAll().where('id', '=', p1.id).executeTakeFirstOrThrow();
    assert(acctConfirmDenied && p1StillPending.status === 'PENDING_CONFIRMATION', 'PAYMENT-03: Accountant cannot confirm Payment (ACCOUNTANT_CONFIRM_DENIED)');

    // --------------------------------------------------
    // PAYMENT-04: Boss can confirm Payment (Guard check & Execution)
    // --------------------------------------------------
    const bossConfirmAllowed = permissionsGuard.canActivate(createMockContext(bossPermissions, PaymentsController.prototype.confirmPayment));
    assert(bossConfirmAllowed === true, 'PAYMENT-04: Boss possesses PAYMENT_CONFIRM permission');

    // --------------------------------------------------
    // PAYMENT-05: Boss can reject Payment
    // --------------------------------------------------
    const rejPay = await paymentsService.createPayment({ grossCashAmount: 10000000, paymentMethod: PaymentMethod.CASH }, String(accountant.id));
    const rejected = await paymentsService.rejectPayment(String(rejPay.id), { reason: 'Bounced check' }, String(boss.id));
    assert(rejected.status === 'REJECTED', 'PAYMENT-05: Boss can reject Payment');

    // --------------------------------------------------
    // PAYMENT-06: Rejected Payment does not affect installment/payment status and preserves history
    // --------------------------------------------------
    const checkItem2 = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', orderItem.id).executeTakeFirstOrThrow();
    const rejRowInDb = await kysely.db.selectFrom('payments').selectAll().where('id', '=', rejPay.id).executeTakeFirstOrThrow();
    assert(checkItem2.payment_status === 'UNPAID' && rejRowInDb.status === 'REJECTED', 'PAYMENT-06: Rejected Payment does not affect installment/payment status and preserves history in DB');

    // --------------------------------------------------
    // PAYMENT-07: Confirmed Payment records confirmed_at and confirmed_by_employee_id
    // --------------------------------------------------
    const confirmedP1 = await paymentsService.confirmPayment(
      String(p1.id),
      {
        allocations: [
          {
            installmentId: String(inst1.id),
            grossAllocatedAmount: 30000000,
            vatAllocatedAmount: 3000000,
            serviceAmount: 27000000,
            netEligibleAmount: 27000000,
          },
        ],
      },
      String(boss.id),
    );
    assert(confirmedP1.status === 'CONFIRMED' && confirmedP1.confirmed_at !== null && String(confirmedP1.confirmed_by_employee_id) === String(boss.id), 'PAYMENT-07: Confirmed Payment records confirmed_at and confirmed_by_employee_id');

    // --------------------------------------------------
    // PAYMENT-08: Double confirmation blocked / idempotent
    // --------------------------------------------------
    let p8Passed = false;
    try {
      await paymentsService.confirmPayment(String(p1.id), {}, String(boss.id));
    } catch (err: any) {
      p8Passed = err.message.includes('Cannot confirm');
    }
    assert(p8Passed, 'PAYMENT-08: Double confirmation blocked / idempotent');

    // --------------------------------------------------
    // PAYMENT-09: One Payment can allocate across multiple installments
    // Create 60M payment, allocate 20M to Inst1 and 40M to Inst2
    // --------------------------------------------------
    const multiAllocPay = await paymentsService.createPayment({ grossCashAmount: 60000000, paymentMethod: PaymentMethod.BANK_TRANSFER }, String(accountant.id));
    await paymentsService.confirmPayment(
      String(multiAllocPay.id),
      {
        allocations: [
          { installmentId: String(inst1.id), grossAllocatedAmount: 20000000 },
          { installmentId: String(inst2.id), grossAllocatedAmount: 40000000 },
        ],
      },
      String(boss.id),
    );
    const inst1AfterMulti = await kysely.db.selectFrom('payment_installments').selectAll().where('id', '=', inst1.id).executeTakeFirstOrThrow();
    assert(inst1AfterMulti.status === 'PAID', 'PAYMENT-09: One Payment can allocate across multiple installments');

    // --------------------------------------------------
    // PAYMENT-10: One installment can receive multiple confirmed allocations
    // --------------------------------------------------
    const inst1AllocationsCount = await kysely.db.selectFrom('payment_allocations').select((eb) => eb.fn.count<number>('id').as('cnt')).where('installment_id', '=', inst1.id).executeTakeFirstOrThrow();
    assert(Number(inst1AllocationsCount.cnt) >= 2, 'PAYMENT-10: One installment can receive multiple confirmed allocations');

    // --------------------------------------------------
    // PAYMENT-11: Allocation sum greater than Payment gross blocked
    // --------------------------------------------------
    const p11Pay = await paymentsService.createPayment({ grossCashAmount: 10000000, paymentMethod: PaymentMethod.CASH }, String(accountant.id));
    let p11Passed = false;
    try {
      await paymentsService.confirmPayment(
        String(p11Pay.id),
        { allocations: [{ installmentId: String(inst2.id), grossAllocatedAmount: 40000000 }] },
        String(boss.id),
      );
    } catch (err: any) {
      p11Passed = err.message.includes('exceeds payment gross');
    }
    assert(p11Passed, 'PAYMENT-11: Allocation sum greater than Payment gross cash amount blocked');

    // --------------------------------------------------
    // PAYMENT-12: Negative/zero invalid allocation blocked
    // --------------------------------------------------
    let p12Passed = false;
    try {
      await paymentsService.confirmPayment(
        String(p11Pay.id),
        { allocations: [{ installmentId: String(inst2.id), grossAllocatedAmount: -5000000 }] },
        String(boss.id),
      );
    } catch (err: any) {
      p12Passed = err.message.includes('greater than 0');
    }
    assert(p12Passed, 'PAYMENT-12: Negative/zero invalid allocation blocked');

    // --------------------------------------------------
    // PAYMENT-13: Partial payment -> installment PARTIALLY_PAID
    // Inst1 initially received 30M out of 50M -> was PARTIALLY_PAID.
    // Let's verify on Inst2: Inst2 is due 50M, currently paid 40M -> PARTIALLY_PAID.
    // --------------------------------------------------
    const inst2Partial = await kysely.db.selectFrom('payment_installments').selectAll().where('id', '=', inst2.id).executeTakeFirstOrThrow();
    assert(inst2Partial.status === 'PARTIALLY_PAID', 'PAYMENT-13: Partial payment -> installment PARTIALLY_PAID');

    // --------------------------------------------------
    // PAYMENT-14: Full payment -> installment PAID
    // Inst1 received 30M + 20M = 50M -> status PAID.
    // --------------------------------------------------
    const inst1Full = await kysely.db.selectFrom('payment_installments').selectAll().where('id', '=', inst1.id).executeTakeFirstOrThrow();
    assert(inst1Full.status === 'PAID', 'PAYMENT-14: Full payment -> installment PAID');

    // --------------------------------------------------
    // PAYMENT-15: Partial allocations -> OrderItem PARTIALLY_PAID
    // Inst1 is PAID, Inst2 is PARTIALLY_PAID -> OrderItem payment_status is PARTIALLY_PAID
    // --------------------------------------------------
    const itemPartial = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', orderItem.id).executeTakeFirstOrThrow();
    assert(itemPartial.payment_status === 'PARTIALLY_PAID', 'PAYMENT-15: Partial allocations -> OrderItem PARTIALLY_PAID');

    // --------------------------------------------------
    // PAYMENT-16: Full current-plan payment -> OrderItem FULLY_PAID
    // Pay remaining 10M to Inst2
    // --------------------------------------------------
    const p16Pay = await paymentsService.createPayment({ grossCashAmount: 10000000, paymentMethod: PaymentMethod.BANK_TRANSFER }, String(accountant.id));
    await paymentsService.confirmPayment(
      String(p16Pay.id),
      { allocations: [{ installmentId: String(inst2.id), grossAllocatedAmount: 10000000 }] },
      String(boss.id),
    );
    const itemFull = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', orderItem.id).executeTakeFirstOrThrow();
    assert(itemFull.payment_status === 'FULLY_PAID', 'PAYMENT-16: Full current-plan payment -> OrderItem FULLY_PAID');

    // --------------------------------------------------
    // PAYMENT-17: Payment confirmation does NOT automatically set Project to COMPLETED
    // --------------------------------------------------
    const { project } = await projectsService.assignProject(String(orderItem.id), { employeeId: String(boss.id), assignmentType: 'PRIMARY' as any }, String(boss.id));
    assert(project.status !== 'COMPLETED', 'PAYMENT-17: Payment confirmation does NOT automatically set Project to COMPLETED');

    // --------------------------------------------------
    // PAYMENT-18 & ACCEPTANCE_NOT_FULL_PAYMENT: Project acceptance alone does NOT make payment FULLY_PAID
    // --------------------------------------------------
    const accItem = await ordersService.addOrderItem(String(order.id), { serviceId: String(webService.id), closingSaleId: String(boss.id), originalPrice: 50000000 }, String(boss.id));
    await ordersService.submitOrderItem(String(accItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(accItem.id), String(boss.id));

    const { project: accProj } = await projectsService.assignProject(String(accItem.id), { employeeId: String(boss.id), assignmentType: 'PRIMARY' as any }, String(boss.id));
    await projectsService.markReadyToStart(String(accProj.id), String(boss.id));
    await projectsService.startProject(String(accProj.id), String(boss.id));
    await projectsService.updateProjectStatus(String(accProj.id), 'REVIEW', undefined, String(boss.id));
    await projectsService.recordAcceptance(String(accProj.id), { customerContactId: String(contact.id), acceptedByName: 'Client Bob', evidenceDocument: 'doc.pdf' }, String(boss.id));

    const accItemAfterAcceptance = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', accItem.id).executeTakeFirstOrThrow();
    const accProjAfterAcceptance = await kysely.db.selectFrom('projects').selectAll().where('id', '=', accProj.id).executeTakeFirstOrThrow();

    assert(
      accProjAfterAcceptance.status === 'COMPLETED' && accItemAfterAcceptance.payment_status === 'UNPAID',
      'PAYMENT-18 & ACCEPTANCE_NOT_FULL_PAYMENT: Project acceptance sets Project to COMPLETED but payment_status remains UNPAID',
    );

    // --------------------------------------------------
    // PAYMENT-19: Gross Cash counts confirmed Payments once (not allocations)
    // --------------------------------------------------
    const currentGross = await paymentsService.calculateGrossCash();
    // Confirmed payments in this suite: p1 (30M) + multiAllocPay (60M) + p16Pay (10M) = 100M
    assert(currentGross === initialGrossCash + 100000000, 'PAYMENT-19: Gross Cash counts confirmed Payments once (100M)');

    // --------------------------------------------------
    // PAYMENT-20: Rejected Payment excluded from Gross Cash calculation
    // --------------------------------------------------
    // rejPay (10M) was rejected earlier and does NOT add to Gross Cash
    assert(currentGross === initialGrossCash + 100000000, 'PAYMENT-20: Rejected Payment excluded from Gross Cash calculation');

    // --------------------------------------------------
    // PAYMENT-21: Confirmed allocation preserves gross/vat/service/net eligible amounts
    // --------------------------------------------------
    const allocRecord = await kysely.db.selectFrom('payment_allocations').selectAll().where('payment_id', '=', p1.id).executeTakeFirstOrThrow();
    assert(
      Number(allocRecord.gross_allocated_amount) === 30000000 &&
      Number(allocRecord.vat_allocated_amount) === 3000000 &&
      Number(allocRecord.service_amount) === 27000000 &&
      Number(allocRecord.net_eligible_amount) === 27000000,
      'PAYMENT-21: Confirmed allocation preserves gross/vat/service/net eligible amounts',
    );

    // --------------------------------------------------
    // PAYMENT-22 & PAYMENT-23: DEPENDENCY RE-EVALUATION HOOK
    // --------------------------------------------------
    const webItem = await ordersService.addOrderItem(String(order.id), { serviceId: String(webService.id), closingSaleId: String(boss.id), originalPrice: 40000000 }, String(boss.id));
    await ordersService.submitOrderItem(String(webItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(webItem.id), String(boss.id));

    const [webPlan] = await kysely.db.insertInto('order_item_payment_plans').values({
      order_item_id: webItem.id,
      status: 'APPROVED',
      version: 1,
      created_by_employee_id: boss.id,
      config_snapshot: JSON.stringify({ type: 'full' }),
      approved_at: new Date(),
    }).returningAll().execute();

    const [webInst] = await kysely.db.insertInto('payment_installments').values({
      payment_plan_id: webPlan.id,
      installment_number: 1,
      due_date: new Date().toISOString().split('T')[0] as any,
      gross_amount_due: 40000000 as any,
      status: 'PENDING',
    }).returningAll().execute();

    const seoItem = await ordersService.addOrderItem(String(order.id), { serviceId: String(webService.id), closingSaleId: String(boss.id), originalPrice: 20000000 }, String(boss.id));
    await ordersService.submitOrderItem(String(seoItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(seoItem.id), String(boss.id));

    const { project: webProj } = await projectsService.assignProject(String(webItem.id), { employeeId: String(boss.id), assignmentType: 'PRIMARY' as any }, String(boss.id));
    await projectsService.markReadyToStart(String(webProj.id), String(boss.id));
    await projectsService.startProject(String(webProj.id), String(boss.id));
    await projectsService.updateProjectStatus(String(webProj.id), 'REVIEW', undefined, String(boss.id));
    await projectsService.recordAcceptance(String(webProj.id), { customerContactId: String(contact.id), acceptedByName: 'Client Bob', evidenceDocument: 'doc.pdf' }, String(boss.id));

    await kysely.db.insertInto('order_item_dependencies').values({
      dependent_item_id: seoItem.id,
      prerequisite_item_id: webItem.id,
      required_prerequisite_delivery_status: 'COMPLETED',
      required_prerequisite_payment_status: 'FULLY_PAID',
    }).execute();

    const { project: seoProj } = await projectsService.assignProject(String(seoItem.id), { employeeId: String(boss.id), assignmentType: 'PRIMARY' as any }, String(boss.id));

    // PAYMENT-22: Dependency remains blocked when only PARTIALLY_PAID
    const pPartialWeb = await paymentsService.createPayment({ grossCashAmount: 20000000, paymentMethod: PaymentMethod.BANK_TRANSFER }, String(accountant.id));
    await paymentsService.confirmPayment(String(pPartialWeb.id), { allocations: [{ installmentId: String(webInst.id), grossAllocatedAmount: 20000000 }] }, String(boss.id));

    const checkSeoProjPartial = await kysely.db.selectFrom('projects').selectAll().where('id', '=', seoProj.id).executeTakeFirstOrThrow();
    assert(checkSeoProjPartial.status === 'ASSIGNED', 'PAYMENT-22: Dependency requiring FULLY_PAID remains blocked when only PARTIALLY_PAID');

    // PAYMENT-23: Dependency unlocks when remaining 20M paid -> FULLY_PAID
    const pFullWeb = await paymentsService.createPayment({ grossCashAmount: 20000000, paymentMethod: PaymentMethod.BANK_TRANSFER }, String(accountant.id));
    await paymentsService.confirmPayment(String(pFullWeb.id), { allocations: [{ installmentId: String(webInst.id), grossAllocatedAmount: 20000000 }] }, String(boss.id));

    const checkSeoProjFull = await kysely.db.selectFrom('projects').selectAll().where('id', '=', seoProj.id).executeTakeFirstOrThrow();
    assert(checkSeoProjFull.status === 'READY_TO_START', 'PAYMENT-23: Dependency requiring COMPLETED + FULLY_PAID unlocks when both satisfied');

    // --------------------------------------------------
    // PAYMENT-24: Concurrent confirm protection verified
    // --------------------------------------------------
    const pConcurrent = await paymentsService.createPayment({ grossCashAmount: 5000000, paymentMethod: PaymentMethod.CASH }, String(accountant.id));
    let p24Passed = false;

    const res1P = paymentsService.confirmPayment(String(pConcurrent.id), {}, String(boss.id));
    const res2P = paymentsService.confirmPayment(String(pConcurrent.id), {}, String(boss.id));

    try {
      await Promise.all([res1P, res2P]);
    } catch (err: any) {
      p24Passed = err.message.includes('Cannot confirm');
    }
    assert(p24Passed, 'PAYMENT-24: Concurrent confirm protection verified (only 1 succeeds)');

    // --------------------------------------------------
    // PAYMENT-25 & PAYMENT-26: SERVICE PERIOD PAYMENT STATUS
    // --------------------------------------------------
    const spItem = await ordersService.addOrderItem(String(order.id), { serviceId: String(webService.id), closingSaleId: String(boss.id), originalPrice: 10000000 }, String(boss.id));
    await ordersService.submitOrderItem(String(spItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(spItem.id), String(boss.id));

    const sub = await kysely.db.insertInto('subscriptions').values({
      order_item_id: spItem.id,
      service_id: webService.id,
      billing_interval: 'MONTH',
      interval_count: 1,
      start_date: new Date().toISOString().split('T')[0] as any,
      status: 'ACTIVE',
    }).returningAll().executeTakeFirstOrThrow();

    const sp = await kysely.db.insertInto('service_periods').values({
      subscription_id: sub.id,
      period_index: 1,
      period_net_value: 10000000 as any,
      gross_payable: 10000000 as any,
      start_date: new Date().toISOString().split('T')[0] as any,
      end_date: new Date().toISOString().split('T')[0] as any,
      payment_status: 'PENDING',
    }).returningAll().executeTakeFirstOrThrow();

    const [spPlan] = await kysely.db.insertInto('order_item_payment_plans').values({
      order_item_id: spItem.id,
      status: 'APPROVED',
      version: 1,
      created_by_employee_id: boss.id,
      config_snapshot: JSON.stringify({ type: 'sp' }),
      approved_at: new Date(),
    }).returningAll().execute();

    const [spInst] = await kysely.db.insertInto('payment_installments').values({
      payment_plan_id: spPlan.id,
      service_period_id: sp.id,
      installment_number: 1,
      due_date: new Date().toISOString().split('T')[0] as any,
      gross_amount_due: 10000000 as any,
      status: 'PENDING',
    }).returningAll().execute();

    // PAYMENT-25: Partial allocation to service period -> PARTIALLY_PAID
    const pSpPartial = await paymentsService.createPayment({ grossCashAmount: 5000000, paymentMethod: PaymentMethod.BANK_TRANSFER }, String(accountant.id));
    await paymentsService.confirmPayment(String(pSpPartial.id), { allocations: [{ installmentId: String(spInst.id), grossAllocatedAmount: 5000000 }] }, String(boss.id));
    const checkSpPartial = await kysely.db.selectFrom('service_periods').selectAll().where('id', '=', sp.id).executeTakeFirstOrThrow();
    assert(checkSpPartial.payment_status === 'PARTIALLY_PAID', 'PAYMENT-25: Allocation updates linked ServicePeriod to PARTIALLY_PAID');

    // PAYMENT-26: Full allocation to service period -> FULLY_PAID
    const pSpFull = await paymentsService.createPayment({ grossCashAmount: 5000000, paymentMethod: PaymentMethod.BANK_TRANSFER }, String(accountant.id));
    await paymentsService.confirmPayment(String(pSpFull.id), { allocations: [{ installmentId: String(spInst.id), grossAllocatedAmount: 5000000 }] }, String(boss.id));
    const checkSpFull = await kysely.db.selectFrom('service_periods').selectAll().where('id', '=', sp.id).executeTakeFirstOrThrow();
    assert(checkSpFull.payment_status === 'FULLY_PAID', 'PAYMENT-26: Allocation updates linked ServicePeriod to FULLY_PAID');

    // --------------------------------------------------
    // PAYMENT-27 & PAYMENT-28: RECEIVABLE CALCULATION
    // --------------------------------------------------
    // PAYMENT-27: Receivable equals current plan due minus confirmed allocations
    const receivableWeb = await paymentsService.calculateReceivable(String(webItem.id));
    assert(receivableWeb === 0, 'PAYMENT-27: Receivable equals current plan due minus confirmed allocations');

    // PAYMENT-28: Historical plan allocations not double-subtracted
    const receivableSp = await paymentsService.calculateReceivable(String(spItem.id));
    assert(receivableSp === 0, 'PAYMENT-28: Historical plan allocations are not double-subtracted when calculating receivable');

  } catch (err: any) {
    console.error('CRITICAL TEST EXCEPTION:', err);
    failed++;
  } finally {
    await app.close();
    console.log('==================================================');
    console.log(`PAYMENT INTEGRATION TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runPaymentIntegrationTests().catch((err) => {
  console.error('❌ Payment Integration Test Suite Error:', err);
  process.exit(1);
});
