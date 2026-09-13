import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from './deals.service';
import { KyselyService } from '../../database/kysely.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { DealsController } from './deals.controller';

async function runDealIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING DEAL FOUNDATION INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule);

  const kysely = app.get(KyselyService);
  const leadsService = app.get(LeadsService);
  const dealsService = app.get(DealsService);
  const dealsController = app.get(DealsController);

  let passed = 0;
  let failed = 0;

  // Cleanup variables
  let testLeadPotentialId: string;
  let testLeadUnclassifiedId: string;
  let testDealId: string;
  let testDealId2: string;
  let testAccountId: string;
  let testSale1Id: string;
  let testSale2Id: string;

  try {
    // 0. Setup Test Fixtures
    // Query position for test employees
    const pos = await kysely.db.selectFrom('positions').select('id').executeTakeFirst();
    if (!pos) throw new Error('No positions found in database');

    const [sale1] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `TEST_DEAL_SALE1_${Date.now()}`,
        full_name: 'Deal Sale Rep 1',
        position_id: pos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();
    testSale1Id = String(sale1.id);

    const [sale2] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `TEST_DEAL_SALE2_${Date.now()}`,
        full_name: 'Deal Sale Rep 2',
        position_id: pos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();
    testSale2Id = String(sale2.id);

    // Create Potential Lead
    const lead1 = await leadsService.createLead({
      fullName: 'Potential Client Corp',
      phone: '0911223344',
      email: 'potential@client.com',
      assignedSaleId: testSale1Id,
    });
    await leadsService.qualifyLead(String(lead1.id), { quality: 'POTENTIAL' as any });
    testLeadPotentialId = String(lead1.id);

    // Create Unclassified Lead
    const lead2 = await leadsService.createLead({
      fullName: 'Unclassified Lead',
      phone: '0988776655',
    });
    testLeadUnclassifiedId = String(lead2.id);

    // --------------------------------------------------
    // DEAL-01: Create Deal from POTENTIAL Lead
    // --------------------------------------------------
    try {
      const result = await leadsService.convertToDeal(testLeadPotentialId, {
        companyName: `Deal01 Corp ${Date.now()}`,
        taxCode: `TAX${Date.now()}`,
        contactName: 'John Deal',
        dealName: 'Enterprise Software License',
        expectedValue: 50000000,
      });

      if (
        result.deal &&
        result.deal.status === 'OPEN' &&
        String(result.deal.assigned_sale_id) === testSale1Id &&
        result.account &&
        result.contact
      ) {
        testDealId = String(result.deal.id);
        testAccountId = String(result.account.id);
        console.log('✅ PASS: DEAL-01: Create Deal from POTENTIAL Lead');
        passed++;
      } else {
        throw new Error(`Unexpected result: ${JSON.stringify(result)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-01: Create Deal from POTENTIAL Lead', err.message);
      failed++;
    }

    // --------------------------------------------------
    // DEAL-02: Non-POTENTIAL create blocked
    // --------------------------------------------------
    try {
      await leadsService.convertToDeal(testLeadUnclassifiedId, {
        companyName: 'Blocked Corp',
        contactName: 'Jane Doe',
        dealName: 'Should Fail Deal',
      });
      console.error('❌ FAIL: DEAL-02: Non-POTENTIAL create blocked - Exception was not thrown');
      failed++;
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('POTENTIAL')) {
        console.log('✅ PASS: DEAL-02: Non-POTENTIAL create blocked');
        passed++;
      } else {
        console.error('❌ FAIL: DEAL-02: Non-POTENTIAL create blocked', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // DEAL-03: OPEN -> NEGOTIATING
    // --------------------------------------------------
    try {
      const updated = await dealsService.startNegotiation(testDealId);
      if (updated.status === 'NEGOTIATING') {
        console.log('✅ PASS: DEAL-03: OPEN -> NEGOTIATING');
        passed++;
      } else {
        throw new Error(`Expected NEGOTIATING but got ${updated.status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-03: OPEN -> NEGOTIATING', err.message);
      failed++;
    }

    // --------------------------------------------------
    // DEAL-04: Set closing sale
    // --------------------------------------------------
    try {
      const updated = await dealsService.setClosingSale(testDealId, { closingSaleId: testSale2Id });
      if (String(updated.closing_sale_id) === testSale2Id) {
        console.log('✅ PASS: DEAL-04: Set closing sale');
        passed++;
      } else {
        throw new Error(`Expected closing_sale_id ${testSale2Id} but got ${updated.closing_sale_id}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-04: Set closing sale', err.message);
      failed++;
    }

    // --------------------------------------------------
    // DEAL-05: LOST without reason blocked
    // --------------------------------------------------
    try {
      await dealsService.markLost(testDealId, { lostReason: '' });
      console.error('❌ FAIL: DEAL-05: LOST without reason blocked - Exception was not thrown');
      failed++;
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('lost_reason')) {
        console.log('✅ PASS: DEAL-05: LOST without reason blocked');
        passed++;
      } else {
        console.error('❌ FAIL: DEAL-05: LOST without reason blocked', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // DEAL-06: LOST with reason success
    // --------------------------------------------------
    try {
      // Create a temporary deal to test LOST
      const tempDeal = await dealsService.createDeal({
        accountId: testAccountId,
        assignedSaleId: testSale1Id,
        dealName: 'Temp Lost Deal',
      });
      const lostDeal = await dealsService.markLost(String(tempDeal.id), { lostReason: 'Competitor price lower' });
      if (lostDeal.status === 'LOST' && lostDeal.lost_reason === 'Competitor price lower' && lostDeal.lost_at) {
        console.log('✅ PASS: DEAL-06: LOST with reason success');
        passed++;
      } else {
        throw new Error(`Unexpected lost deal result: ${JSON.stringify(lostDeal)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-06: LOST with reason success', err.message);
      failed++;
    }

    // --------------------------------------------------
    // DEAL-07: WON without valid closing sale blocked
    // --------------------------------------------------
    try {
      const dealNoCloser = await dealsService.createDeal({
        accountId: testAccountId,
        assignedSaleId: testSale1Id,
        dealName: 'No Closer Deal',
      });
      await dealsService.markWon(String(dealNoCloser.id));
      console.error('❌ FAIL: DEAL-07: WON without valid closing sale blocked - Exception was not thrown');
      failed++;
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('closing_sale_id')) {
        console.log('✅ PASS: DEAL-07: WON without valid closing sale blocked');
        passed++;
      } else {
        console.error('❌ FAIL: DEAL-07: WON without valid closing sale blocked', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // DEAL-08: WON creates DRAFT Order when no active order
    // --------------------------------------------------
    let createdOrderId: string;
    try {
      const wonResult = await dealsService.markWon(testDealId);
      if (
        wonResult.deal.status === 'WON' &&
        wonResult.order &&
        wonResult.order.workflow_status === 'DRAFT' &&
        wonResult.orderItem
      ) {
        createdOrderId = String(wonResult.order.id);
        console.log('✅ PASS: DEAL-08: WON creates DRAFT Order when no active order');
        passed++;
      } else {
        throw new Error(`Unexpected WON result: ${JSON.stringify(wonResult)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-08: WON creates DRAFT Order when no active order', err.message);
      failed++;
    }

    // --------------------------------------------------
    // DEAL-09: WON reuses active Order instead of creating second
    // --------------------------------------------------
    try {
      // Create a second deal for same account
      const deal2 = await dealsService.createDeal({
        accountId: testAccountId,
        assignedSaleId: testSale1Id,
        dealName: 'Second Deal Same Account',
        expectedValue: 30000000,
      });
      testDealId2 = String(deal2.id);
      await dealsService.setClosingSale(testDealId2, { closingSaleId: testSale1Id });

      const wonResult2 = await dealsService.markWon(testDealId2);
      if (String(wonResult2.order.id) === createdOrderId) {
        console.log('✅ PASS: DEAL-09: WON reuses active Order instead of creating second');
        passed++;
      } else {
        throw new Error(`Expected order ID ${createdOrderId} but got ${wonResult2.order.id}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-09: WON reuses active Order instead of creating second', err.message);
      failed++;
    }

    // --------------------------------------------------
    // DEAL-10: Order Item preserves deal_id + closing_sale_id
    // --------------------------------------------------
    try {
      const detail: any = await dealsService.findDealById(testDealId2);
      if (
        detail.orderItems &&
        detail.orderItems.length > 0 &&
        String(detail.orderItems[0].deal_id) === testDealId2 &&
        String(detail.orderItems[0].closing_sale_id) === testSale1Id
      ) {
        console.log('✅ PASS: DEAL-10: Order Item preserves deal_id + closing_sale_id');
        passed++;
      } else {
        throw new Error(`Order items mismatch: ${JSON.stringify(detail.orderItems)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-10: Order Item preserves deal_id + closing_sale_id', err.message);
      failed++;
    }

    // --------------------------------------------------
    // DEAL-11: Sale object-level unauthorized access blocked
    // --------------------------------------------------
    try {
      // sale2 tries to view testDealId (assigned to sale1)
      await dealsController.findDealById(testDealId, {
        employeeId: testSale2Id,
        roles: ['SALE'],
        permissions: [],
      });
      console.error('❌ FAIL: DEAL-11: Sale object-level unauthorized access blocked - Exception was not thrown');
      failed++;
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        console.log('✅ PASS: DEAL-11: Sale object-level unauthorized access blocked');
        passed++;
      } else {
        console.error('❌ FAIL: DEAL-11: Sale object-level unauthorized access blocked', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // DEAL-12: Concurrent / duplicate active-order protection verified
    // --------------------------------------------------
    try {
      // Verify idx_one_active_order_per_account constraint by attempting a direct duplicate active order insert
      let constraintBlocked = false;
      try {
        await kysely.db
          .insertInto('orders')
          .values({
            account_id: testAccountId as any,
            order_code: `TEST_CONCURRENT_${Date.now()}`,
            workflow_status: 'DRAFT',
          })
          .execute();
      } catch (err: any) {
        if (err.code === '23505' || err.message.includes('idx_one_active_order_per_account')) {
          constraintBlocked = true;
        }
      }

      if (constraintBlocked) {
        console.log('✅ PASS: DEAL-12: Concurrent/duplicate active-order protection verified');
        passed++;
      } else {
        throw new Error('Database index idx_one_active_order_per_account failed to block duplicate active order!');
      }
    } catch (err: any) {
      console.error('❌ FAIL: DEAL-12: Concurrent/duplicate active-order protection verified', err.message);
      failed++;
    }

  } finally {
    // Clean up test data
    try {
      if (testAccountId) {
        await kysely.db.deleteFrom('orders').where('account_id', '=', testAccountId as any).execute();
        await kysely.db.deleteFrom('contacts').where('account_id', '=', testAccountId as any).execute();
        await kysely.db.deleteFrom('deals').where('account_id', '=', testAccountId as any).execute();
        await kysely.db.deleteFrom('accounts').where('id', '=', testAccountId as any).execute();
      }
      if (testLeadPotentialId) {
        await kysely.db.deleteFrom('leads').where('id', '=', testLeadPotentialId as any).execute();
      }
      if (testLeadUnclassifiedId) {
        await kysely.db.deleteFrom('leads').where('id', '=', testLeadUnclassifiedId as any).execute();
      }
      if (testSale1Id) {
        await kysely.db.deleteFrom('employees').where('id', '=', testSale1Id as any).execute();
      }
      if (testSale2Id) {
        await kysely.db.deleteFrom('employees').where('id', '=', testSale2Id as any).execute();
      }
    } catch (cleanupErr) {
      // ignore cleanup errors
    }

    await app.close();
  }

  console.log('==================================================');
  console.log(`DEAL INTEGRATION TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runDealIntegrationTests().catch((err) => {
  console.error('❌ Deal Integration Test Suite Error:', err);
  process.exit(1);
});
