import { NestFactory } from '@nestjs/core';
import * as assert from 'assert';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { CommissionPolicyMatcherService } from './services/commission-policy-matcher.service';
import { CommissionEligibilityService } from './services/commission-eligibility.service';
import { DealsService } from '../deals/deals.service';
import { ProjectsService } from '../projects/projects.service';
import { PaymentsService } from '../payments/payments.service';
import { sql } from 'kysely';

async function runSeoCommissionTest() {
  console.log('====================================================');
  console.log('STARTING CFG-001: SEO COMMISSION VERIFICATION SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get(KyselyService);
  const policyMatcher = app.get(CommissionPolicyMatcherService);
  const eligibilityService = app.get(CommissionEligibilityService);
  const dealsService = app.get(DealsService);
  const projectsService = app.get(ProjectsService);
  const paymentsService = app.get(PaymentsService);
  const db = kysely.db;

  const runId = Date.now().toString().slice(-6);

  try {
    const seoPos = await db.selectFrom('positions').selectAll().where('code', '=', 'SEO').executeTakeFirstOrThrow();
    const saleRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const serviceSeo = await db.selectFrom('services').selectAll().where('code', '=', 'SEO').executeTakeFirst();
    const serviceId = serviceSeo ? serviceSeo.id : 2;

    // 1. POLICY MATCHER TESTS
    console.log('\n--- 1. Testing Policy Matcher for SEO ---');
    // 1 Primary SEO
    const policy1 = await policyMatcher.matchPolicy({
      policyType: 'PROJECT_DELIVERY',
      positionId: seoPos.id,
      serviceId: serviceId,
      assigneeCount: 1,
    });
    assert.strictEqual(Number(policy1.rate), 0.03, '1 Primary SEO must match 3% policy');
    console.log('✅ PASS: Policy Matcher matches 1 Primary SEO -> 3% (0.0300)');

    // 2 Primary SEOs
    const policy2 = await policyMatcher.matchPolicy({
      policyType: 'PROJECT_DELIVERY',
      positionId: seoPos.id,
      serviceId: serviceId,
      assigneeCount: 2,
    });
    assert.strictEqual(Number(policy2.rate), 0.02, '2 Primary SEOs must match 2% policy');
    console.log('✅ PASS: Policy Matcher matches 2 Primary SEOs -> 2% each (0.0200)');

    // 2. END-TO-END COMMISSION CALCULATION TEST
    console.log('\n--- 2. Testing Commission Eligibility for SEO Project ---');
    // Create SEO Team
    const [team] = await db
      .insertInto('teams')
      .values({ code: `T-SEO-${runId}`, name: `SEO Test Team ${runId}`, department: 'SEO' as any })
      .returningAll()
      .execute();

    const [saleEmp] = await db
      .insertInto('employees')
      .values({ employee_code: `EMP-S-${runId}`, full_name: `Sale User ${runId}`, position_id: salePos.id, status: 'ACTIVE' })
      .returningAll()
      .execute();

    // Create 2 Primary SEOs and 1 Support SEO
    const createSeoEmp = async (name: string) => {
      const [emp] = await db
        .insertInto('employees')
        .values({
          employee_code: `EMP-SEO-${name}-${runId}`,
          full_name: `SEO ${name} ${runId}`,
          position_id: seoPos.id,
          status: 'ACTIVE',
        })
        .returningAll()
        .execute();

      await db
        .insertInto('team_memberships')
        .values({
          team_id: team.id,
          employee_id: emp.id as any,
          is_leader: false,
          effective_range: sql`tstzrange(NOW() - interval '5 days', NULL, '[)')` as any,
        })
        .execute();
      return emp;
    };

    const seoPrimary1 = await createSeoEmp('PrimaryOne');
    const seoPrimary2 = await createSeoEmp('PrimaryTwo');
    const seoSupport = await createSeoEmp('SupportOnly');

    // Create Account & Contact & Deal -> Mark WON -> Generates Order & OrderItem
    const [account] = await db
      .insertInto('accounts')
      .values({ company_name: `SEO Customer ${runId}` })
      .returningAll()
      .execute();

    const [contact] = await db
      .insertInto('contacts')
      .values({ account_id: account.id, full_name: `SEO Contact ${runId}` })
      .returningAll()
      .execute();

    const deal = await dealsService.createDeal({
      accountId: account.id,
      primaryContactId: contact.id,
      dealName: `Deal SEO ${runId}`,
      assignedSaleId: String(saleEmp.id),
      expectedValue: 10000000,
    });

    await dealsService.setClosingSale(String(deal.id), { closingSaleId: String(saleEmp.id) });
    const wonRes = await dealsService.markWon(String(deal.id));

    const orderItem = wonRes.orderItem;
    const orderItemId = String(orderItem.id);

    // Update order_item service_id to serviceId (SEO) and approval_status to APPROVED
    await db
      .updateTable('order_items')
      .set({
        service_id: serviceId as any,
        approval_status: 'APPROVED',
        delivery_status: 'READY_FOR_ASSIGNMENT',
      })
      .where('id', '=', orderItem.id)
      .execute();

    // Assign Project to seoPrimary1
    const assignRes = await projectsService.assignProject(
      orderItemId,
      { employeeId: String(seoPrimary1.id), assignmentType: 'PRIMARY' as any },
      String(saleEmp.id),
    );
    const projectId = String(assignRes.project.id);

    // Add seoPrimary2 as second PRIMARY
    await projectsService.addAssignment(
      projectId,
      { employeeId: String(seoPrimary2.id), assignmentType: 'PRIMARY' as any },
      String(saleEmp.id),
    );

    // Add seoSupport as SUPPORT
    await projectsService.addAssignment(
      projectId,
      { employeeId: String(seoSupport.id), assignmentType: 'SUPPORT' as any },
      String(saleEmp.id),
    );

    await projectsService.markReadyToStart(projectId, String(saleEmp.id));
    await projectsService.startProject(projectId, String(saleEmp.id));

    // Create Payment Plan + Installment + Payment
    const [paymentPlan] = await db
      .insertInto('order_item_payment_plans')
      .values({
        order_item_id: orderItem.id,
        created_by_employee_id: saleEmp.id,
        config_snapshot: {},
        status: 'APPROVED',
      })
      .returningAll()
      .execute();

    const [installment] = await db
      .insertInto('payment_installments')
      .values({
        payment_plan_id: paymentPlan.id,
        installment_number: 1,
        due_date: '2026-11-20' as any,
        gross_amount_due: 11000000 as any,
        status: 'PENDING',
      })
      .returningAll()
      .execute();

    const payment = await paymentsService.createPayment(
      {
        grossCashAmount: 11000000,
        paymentMethod: 'BANK_TRANSFER' as any,
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 11000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(saleEmp.id),
    );

    await paymentsService.confirmPayment(
      String(payment.id),
      {
        allocations: [
          {
            installmentId: String(installment.id),
            grossAllocatedAmount: 11000000,
            closingSaleId: String(saleEmp.id),
          },
        ],
      },
      String(saleEmp.id),
    );

    // Record Customer Acceptance
    await projectsService.recordAcceptance(
      projectId,
      {
        customerContactId: String(contact.id),
        acceptedByName: 'Client Director',
        evidenceDocument: 'https://storage.local/acceptance.pdf',
      },
      String(saleEmp.id),
    );

    // Re-evaluate commissions
    await db.transaction().execute(async (trx) => {
      await eligibilityService.evaluateOrderItemCommissions(trx, orderItemId, String(saleEmp.id));
    });

    // Check generated commissions
    const comms = await db
      .selectFrom('commissions')
      .selectAll()
      .where('order_item_id', '=', orderItem.id as any)
      .where('commission_type', '=', 'PROJECT_DELIVERY')
      .execute();

    console.log(`Found ${comms.length} PROJECT_DELIVERY commission records for SEO`);

    // Invariant 1: Exactly 2 commissions created (for the 2 PRIMARY SEOs)
    assert.strictEqual(comms.length, 2, 'Must create exactly 2 delivery commissions for 2 PRIMARY SEOs');

    // Invariant 2: Each Primary SEO receives 2% (200,000 on 10M service base amount)
    const commP1 = comms.find((c) => String(c.beneficiary_employee_id) === String(seoPrimary1.id));
    const commP2 = comms.find((c) => String(c.beneficiary_employee_id) === String(seoPrimary2.id));
    assert.ok(commP1, 'Primary SEO 1 must receive commission');
    assert.ok(commP2, 'Primary SEO 2 must receive commission');
    assert.strictEqual(Number(commP1!.calculated_amount), 200000, 'Primary SEO 1 must receive exactly 2% (200,000 VND)');
    assert.strictEqual(Number(commP2!.calculated_amount), 200000, 'Primary SEO 2 must receive exactly 2% (200,000 VND)');

    // Invariant 3: SUPPORT SEO receives 0% (NO commission record generated)
    const commSupport = comms.find((c) => String(c.beneficiary_employee_id) === String(seoSupport.id));
    assert.strictEqual(commSupport, undefined, 'SUPPORT SEO must receive 0% (zero commission records)');

    console.log('✅ PASS: 2 Primary SEOs received 2% each (200,000 VND)');
    console.log('✅ PASS: 1 Support SEO received 0% (zero commission record)');

    console.log('\n====================================================');
    console.log('CFG-001 SEO COMMISSION VERIFIED SUCCESSFULLY (PASS)');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

runSeoCommissionTest().catch((err) => {
  console.error('❌ SEO COMMISSION TEST FAILED:', err);
  process.exit(1);
});
