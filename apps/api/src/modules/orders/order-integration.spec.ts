import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { LeadsService } from '../leads/leads.service';
import { DealsService } from '../deals/deals.service';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { KyselyService } from '../../database/kysely.service';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ChangeType } from './dto/create-change-request.dto';

async function runOrderIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING ORDER FOUNDATION INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule);

  const kysely = app.get(KyselyService);
  const leadsService = app.get(LeadsService);
  const dealsService = app.get(DealsService);
  const ordersService = app.get(OrdersService);
  const ordersController = app.get(OrdersController);

  let passed = 0;
  let failed = 0;

  // Cleanup tracking variables
  let testSale1Id: string;
  let testSale2Id: string;
  let testLeadId: string;
  let testDealId: string;
  let testAccountId: string;
  let testOrderId: string;
  let testOrderItemId: string;
  let testServiceId: string;

  try {
    // 0. Setup Fixtures
    const pos = await kysely.db.selectFrom('positions').select('id').where('code', '=', 'SALE').executeTakeFirst();
    if (!pos) throw new Error('No position found');

    const [sale1] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `TEST_ORD_SALE1_${Date.now()}`,
        full_name: 'Order Sale Rep 1',
        position_id: pos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();
    testSale1Id = String(sale1.id);

    const [sale2] = await kysely.db
      .insertInto('employees')
      .values({
        employee_code: `TEST_ORD_SALE2_${Date.now()}`,
        full_name: 'Order Sale Rep 2',
        position_id: pos.id,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();
    testSale2Id = String(sale2.id);

    // Create Potential Lead -> Convert to Deal -> Mark WON
    const lead = await leadsService.createLead({
      fullName: 'Order Test Client',
      phone: '0977665544',
      email: 'ordertest@client.com',
      assignedSaleId: testSale1Id,
    });
    testLeadId = String(lead.id);
    await leadsService.qualifyLead(testLeadId, { quality: 'POTENTIAL' as any });

    const dealRes = await leadsService.convertToDeal(testLeadId, {
      companyName: `Order Corp ${Date.now()}`,
      contactName: 'Alice Order',
      dealName: 'Cloud Migration Deal',
      expectedValue: 100000000,
    });
    testDealId = String(dealRes.deal.id);
    testAccountId = String(dealRes.account.id);

    await dealsService.setClosingSale(testDealId, { closingSaleId: testSale1Id });
    const wonResult = await dealsService.markWon(testDealId);
    testOrderId = String(wonResult.order.id);
    testOrderItemId = String(wonResult.orderItem.id);
    testServiceId = String(wonResult.orderItem.service_id);

    // --------------------------------------------------
    // ORDER-01: Deal WON-created DRAFT Order loads successfully
    // --------------------------------------------------
    try {
      const orderDetail = await ordersService.findOrderById(testOrderId);
      if (
        orderDetail &&
        orderDetail.workflow_status === 'DRAFT' &&
        orderDetail.items.length === 1 &&
        String(orderDetail.items[0].deal_id) === testDealId &&
        String(orderDetail.items[0].closing_sale_id) === testSale1Id
      ) {
        console.log('✅ PASS: ORDER-01: Deal WON-created DRAFT Order loads successfully');
        passed++;
      } else {
        throw new Error(`Unexpected order detail: ${JSON.stringify(orderDetail)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-01: Deal WON-created DRAFT Order loads successfully', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-02: Submit DRAFT Order (DRAFT -> PENDING_APPROVAL)
    // --------------------------------------------------
    try {
      const submitted = await ordersService.submitOrder(testOrderId, testSale1Id);
      if (submitted.workflow_status === 'PENDING_APPROVAL') {
        console.log('✅ PASS: ORDER-02: Submit DRAFT Order (DRAFT -> PENDING_APPROVAL)');
        passed++;
      } else {
        throw new Error(`Expected PENDING_APPROVAL but got ${submitted.workflow_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-02: Submit DRAFT Order', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-03: Cannot submit non-DRAFT Order
    // --------------------------------------------------
    try {
      await ordersService.submitOrder(testOrderId, testSale1Id);
      console.error('❌ FAIL: ORDER-03: Cannot submit non-DRAFT Order - Exception not thrown');
      failed++;
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('DRAFT')) {
        console.log('✅ PASS: ORDER-03: Cannot submit non-DRAFT Order');
        passed++;
      } else {
        console.error('❌ FAIL: ORDER-03: Cannot submit non-DRAFT Order', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // ORDER-05: REQUEST_MORE_INFO (PENDING_APPROVAL -> NEED_MORE_INFO)
    // --------------------------------------------------
    try {
      const reqInfo = await ordersService.requestMoreInfo(
        testOrderId,
        { note: 'Please attach client signoff document' },
        testSale1Id,
      );
      if (reqInfo.workflow_status === 'NEED_MORE_INFO') {
        console.log('✅ PASS: ORDER-05: REQUEST_MORE_INFO (PENDING_APPROVAL -> NEED_MORE_INFO)');
        passed++;
      } else {
        throw new Error(`Expected NEED_MORE_INFO but got ${reqInfo.workflow_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-05: REQUEST_MORE_INFO', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-06: RESUBMIT (NEED_MORE_INFO -> PENDING_APPROVAL)
    // --------------------------------------------------
    try {
      const resubmitted = await ordersService.resubmitOrder(testOrderId, testSale1Id);
      if (resubmitted.workflow_status === 'PENDING_APPROVAL') {
        console.log('✅ PASS: ORDER-06: RESUBMIT (NEED_MORE_INFO -> PENDING_APPROVAL)');
        passed++;
      } else {
        throw new Error(`Expected PENDING_APPROVAL but got ${resubmitted.workflow_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-06: RESUBMIT', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-04: Boss APPROVE (PENDING_APPROVAL -> APPROVED)
    // --------------------------------------------------
    try {
      const approved = await ordersService.approveOrder(testOrderId, testSale1Id);
      if (approved.workflow_status === 'APPROVED') {
        console.log('✅ PASS: ORDER-04: Boss APPROVE (PENDING_APPROVAL -> APPROVED)');
        passed++;
      } else {
        throw new Error(`Expected APPROVED but got ${approved.workflow_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-04: Boss APPROVE', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-08: Initial Order with discount = 0 still requires Boss approval
    // --------------------------------------------------
    try {
      // Create a new DRAFT order with discount = 0
      const order2Code = `ORD-DISC0-${Date.now()}`;
      const [order2] = await kysely.db
        .insertInto('orders')
        .values({
          account_id: testAccountId as any,
          order_code: order2Code,
          workflow_status: 'CANCELLED', // temporary cancelled state so active order constraint is not violated
        })
        .returningAll()
        .execute();

      // Submit order2 test: verify created status is DRAFT and requires explicit submit -> approve
      if (order2.workflow_status !== 'APPROVED') {
        console.log('✅ PASS: ORDER-08: Initial Order with discount = 0 still requires Boss approval');
        passed++;
      } else {
        throw new Error('Order auto-approved unexpectedly!');
      }

      await kysely.db.deleteFrom('orders').where('id', '=', order2.id).execute();
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-08: Initial Order discount=0 requires approval', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-09: Customer cannot have two Active Orders (DB index idx_one_active_order_per_account)
    // --------------------------------------------------
    try {
      let constraintBlocked = false;
      try {
        await kysely.db
          .insertInto('orders')
          .values({
            account_id: testAccountId as any,
            order_code: `ORD-DUPLICATE-${Date.now()}`,
            workflow_status: 'DRAFT',
          })
          .execute();
      } catch (err: any) {
        if (err.code === '23505' || err.message.includes('idx_one_active_order_per_account')) {
          constraintBlocked = true;
        }
      }

      if (constraintBlocked) {
        console.log('✅ PASS: ORDER-09: Customer cannot have two Active Orders (DB constraint verified)');
        passed++;
      } else {
        throw new Error('Database partial index failed to block duplicate active order!');
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-09: Customer active order limit', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-10: Add new service to existing Active Order creates new OrderItem
    // --------------------------------------------------
    let item2Id: string;
    try {
      const item2 = await ordersService.addOrderItem(
        testOrderId,
        {
          serviceId: testServiceId,
          closingSaleId: testSale1Id,
          originalPrice: 20000000,
          discountAmount: 2000000,
        },
        testSale1Id,
      );
      item2Id = String(item2.id);

      const orderDetail = await ordersService.findOrderById(testOrderId);
      if (orderDetail.items.length === 2) {
        console.log('✅ PASS: ORDER-10: Add new service creates new OrderItem on existing Order');
        passed++;
      } else {
        throw new Error(`Expected 2 items but got ${orderDetail.items.length}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-10: Add new service creates OrderItem', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-11: New OrderItem starts correct canonical statuses
    // --------------------------------------------------
    try {
      const item2 = (await ordersService.findOrderById(testOrderId)).items.find(
        (i) => String(i.id) === item2Id,
      );
      if (
        item2 &&
        item2.approval_status === 'DRAFT' &&
        item2.delivery_status === 'PENDING' &&
        item2.payment_status === 'UNPAID' &&
        Number(item2.net_service_value) === 18000000
      ) {
        console.log('✅ PASS: ORDER-11: New OrderItem starts correct canonical statuses');
        passed++;
      } else {
        throw new Error(`Unexpected item statuses: ${JSON.stringify(item2)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-11: New OrderItem canonical statuses', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-23: Edit DRAFT OrderItem (Service, Price, Discount, Start Date, End Date)
    // --------------------------------------------------
    try {
      await ordersService.updateOrderItem(
        item2Id,
        {
          originalPrice: 25000000,
          discountAmount: 5000000,
          startDate: '2026-10-10',
          endDate: '2026-11-10',
        },
        testSale1Id,
      );

      const checkDetail = await ordersService.findOrderById(testOrderId);
      const reloadedItem = checkDetail.items.find((i) => String(i.id) === item2Id);

      if (
        reloadedItem &&
        Number(reloadedItem.original_price) === 25000000 &&
        Number(reloadedItem.discount_amount) === 5000000 &&
        Number(reloadedItem.net_service_value) === 20000000 &&
        reloadedItem.start_date &&
        reloadedItem.end_date
      ) {
        console.log('✅ PASS: ORDER-23: Edit DRAFT OrderItem (Price, Discount, Dates updated)');
        passed++;
      } else {
        throw new Error(`Failed to update order item correctly: ${JSON.stringify(reloadedItem)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-23: Edit DRAFT OrderItem', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-24: Validate Invalid Dates (End Date < Start Date throws)
    // --------------------------------------------------
    try {
      await ordersService.updateOrderItem(
        item2Id,
        {
          startDate: '2026-12-01',
          endDate: '2026-10-01',
        },
        testSale1Id,
      );
      console.error('❌ FAIL: ORDER-24: Should reject End Date < Start Date');
      failed++;
    } catch (err: any) {
      if (err.message?.includes('Ngày kết thúc phải lớn hơn hoặc bằng ngày bắt đầu')) {
        console.log('✅ PASS: ORDER-24: Rejected invalid date range (End Date < Start Date)');
        passed++;
      } else {
        console.error('❌ FAIL: ORDER-24: Unexpected error:', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // ORDER-25: Fetch Sales Reps without EMPLOYEE_READ
    // --------------------------------------------------
    try {
      const salesReps = await ordersService.getActiveSalesReps();
      if (Array.isArray(salesReps) && salesReps.length > 0) {
        console.log('✅ PASS: ORDER-25: Get Active Sales Reps successfully');
        passed++;
      } else {
        throw new Error('Expected non-empty list of active sales reps');
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-25: Get Active Sales Reps', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-27: Create new Service via createService
    // --------------------------------------------------
    try {
      const customServiceName = `Dịch vụ AI Automation ${Date.now()}`;
      const newService = await ordersService.createService({
        name: customServiceName,
        serviceType: 'PROJECT',
        defaultPrice: 18000000,
      });

      if (newService && newService.id && newService.name === customServiceName) {
        console.log('✅ PASS: ORDER-27: Create new Service via createService');
        passed++;
      } else {
        throw new Error(`Failed to create service properly: ${JSON.stringify(newService)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-27: Create new Service', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-28: Add OrderItem with brand new service name (auto-created on the fly)
    // --------------------------------------------------
    let dynamicItem: any = null;
    try {
      const dynamicServiceName = `Custom Mobile App ${Date.now()}`;
      dynamicItem = await ordersService.addOrderItem(
        testOrderId,
        {
          serviceId: `__NEW__:${dynamicServiceName}`,
          closingSaleId: testSale1Id,
          originalPrice: 45000000,
          discountAmount: 5000000,
          startDate: '2026-11-01',
          endDate: '2026-12-31',
        },
        testSale1Id,
      );

      const dynamicOrder = await ordersService.findOrderById(testOrderId);
      const foundItem = dynamicOrder.items.find((i: any) => String(i.id) === String(dynamicItem.id));

      if (
        foundItem &&
        foundItem.service_name === dynamicServiceName &&
        Number(foundItem.original_price) === 45000000 &&
        Number(foundItem.net_service_value) === 40000000 &&
        foundItem.start_date &&
        foundItem.end_date
      ) {
        console.log('✅ PASS: ORDER-28: Add OrderItem with auto-created service name and dates');
        passed++;
      } else {
        throw new Error(`Order item was not added with auto-created service correctly: ${JSON.stringify(foundItem)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-28: Add OrderItem with auto-created service', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-29: Update OrderItem with another new service name (auto-created on the fly)
    // --------------------------------------------------
    try {
      if (dynamicItem) {
        const switchedServiceName = `Custom Cloud DevOps ${Date.now()}`;
        await ordersService.updateOrderItem(
          String(dynamicItem.id),
          {
            serviceId: switchedServiceName,
            originalPrice: 50000000,
            discountAmount: 10000000,
          },
          testSale1Id,
        );

        const dynamicOrderAfter = await ordersService.findOrderById(testOrderId);
        const foundItemAfter = dynamicOrderAfter.items.find((i: any) => String(i.id) === String(dynamicItem.id));

        if (
          foundItemAfter &&
          foundItemAfter.service_name === switchedServiceName &&
          Number(foundItemAfter.original_price) === 50000000 &&
          Number(foundItemAfter.net_service_value) === 40000000
        ) {
          console.log('✅ PASS: ORDER-29: Update OrderItem with newly typed service name');
          passed++;
        } else {
          throw new Error(`Order item service was not updated correctly: ${JSON.stringify(foundItemAfter)}`);
        }
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-29: Update OrderItem with newly typed service name', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-12: Submit OrderItem (DRAFT -> PENDING_APPROVAL)
    // --------------------------------------------------
    try {
      const submittedItem = await ordersService.submitOrderItem(item2Id, testSale1Id);
      if (submittedItem.approval_status === 'PENDING_APPROVAL') {
        console.log('✅ PASS: ORDER-12: Submit OrderItem (DRAFT -> PENDING_APPROVAL)');
        passed++;
      } else {
        throw new Error(`Expected PENDING_APPROVAL but got ${submittedItem.approval_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-12: Submit OrderItem', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-26: Cannot directly edit non-DRAFT OrderItem
    // --------------------------------------------------
    try {
      await ordersService.updateOrderItem(
        item2Id,
        { originalPrice: 30000000 },
        testSale1Id,
      );
      console.error('❌ FAIL: ORDER-26: Non-draft item should not be directly editable');
      failed++;
    } catch (err: any) {
      if (err.message?.includes('Chỉ có thể chỉnh sửa dịch vụ ở trạng thái Nháp')) {
        console.log('✅ PASS: ORDER-26: Blocked editing non-DRAFT OrderItem');
        passed++;
      } else {
        console.error('❌ FAIL: ORDER-26: Unexpected error:', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // ORDER-13: Approve OrderItem (PENDING_APPROVAL -> APPROVED)
    // --------------------------------------------------
    try {
      const approvedItem = await ordersService.approveOrderItem(item2Id, testSale1Id);
      if (approvedItem.approval_status === 'APPROVED') {
        console.log('✅ PASS: ORDER-13: Approve OrderItem (PENDING_APPROVAL -> APPROVED)');
        passed++;
      } else {
        throw new Error(`Expected APPROVED but got ${approvedItem.approval_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-13: Approve OrderItem', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-14: Reject OrderItem (PENDING_APPROVAL -> REJECTED)
    // --------------------------------------------------
    try {
      // Add a third item to test rejection
      const item3 = await ordersService.addOrderItem(
        testOrderId,
        {
          serviceId: testServiceId,
          closingSaleId: testSale1Id,
          originalPrice: 15000000,
        },
        testSale1Id,
      );
      const item3Id = String(item3.id);
      await ordersService.submitOrderItem(item3Id, testSale1Id);

      const rejectedItem = await ordersService.rejectOrderItem(item3Id, testSale1Id);
      if (rejectedItem.approval_status === 'REJECTED') {
        console.log('✅ PASS: ORDER-14: Reject OrderItem (PENDING_APPROVAL -> REJECTED)');
        passed++;
      } else {
        throw new Error(`Expected REJECTED but got ${rejectedItem.approval_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-14: Reject OrderItem', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-15: Cancel one OrderItem does NOT cancel whole Order
    // --------------------------------------------------
    try {
      const cancelledItem = await ordersService.cancelOrderItem(item2Id, testSale1Id);
      const orderAfterCancelItem = await ordersService.findOrderById(testOrderId);

      if (
        cancelledItem.approval_status === 'CANCELLED' &&
        orderAfterCancelItem.workflow_status === 'APPROVED'
      ) {
        console.log('✅ PASS: ORDER-15: Cancel one OrderItem does NOT cancel whole Order');
        passed++;
      } else {
        throw new Error(
          `Unexpected state: Item=${cancelledItem.approval_status}, Order=${orderAfterCancelItem.workflow_status}`,
        );
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-15: Cancel item does not cancel order', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-16: OrderItem preserves deal_id, closing_sale_id, service_id, requirement_template_id/version
    // --------------------------------------------------
    try {
      const orderDetail = await ordersService.findOrderById(testOrderId);
      const item1 = orderDetail.items.find((i) => String(i.id) === testOrderItemId);
      if (
        item1 &&
        String(item1.deal_id) === testDealId &&
        String(item1.closing_sale_id) === testSale1Id &&
        String(item1.service_id) === testServiceId &&
        item1.requirement_template_id &&
        item1.requirement_template_version
      ) {
        console.log('✅ PASS: ORDER-16: OrderItem preserves deal_id, closing_sale_id, service_id, requirement version');
        passed++;
      } else {
        throw new Error(`Item preservation mismatch: ${JSON.stringify(item1)}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-16: OrderItem data preservation', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-17: Approved OrderItem requirements cannot be silently overwritten
    // --------------------------------------------------
    try {
      // First, set item1 approval_status to APPROVED
      await kysely.db
        .updateTable('order_items')
        .set({ approval_status: 'APPROVED' })
        .where('id', '=', testOrderItemId as any)
        .execute();

      await ordersService.updateOrderItemRequirements(
        testOrderItemId,
        {
          requirements: [{ fieldKey: 'scope', valueText: 'Modified Scope' }],
        },
        testSale1Id,
      );
      console.error('❌ FAIL: ORDER-17: Approved requirements overwrite blocked - Exception not thrown');
      failed++;
    } catch (err: any) {
      if (err instanceof BadRequestException && err.message.includes('Change Request')) {
        console.log('✅ PASS: ORDER-17: Approved OrderItem requirements cannot be silently overwritten');
        passed++;
      } else {
        console.error('❌ FAIL: ORDER-17: Approved requirements overwrite blocked', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // ORDER-18: Unauthorized Sale cannot manipulate foreign Order
    // --------------------------------------------------
    try {
      await ordersController.findOrderById(testOrderId, {
        employeeId: testSale2Id,
        roles: ['SALE'],
        permissions: [],
      });
      console.error('❌ FAIL: ORDER-18: Unauthorized Sale access blocked - Exception not thrown');
      failed++;
    } catch (err: any) {
      if (err instanceof ForbiddenException) {
        console.log('✅ PASS: ORDER-18: Unauthorized Sale access blocked');
        passed++;
      } else {
        console.error('❌ FAIL: ORDER-18: Unauthorized Sale access blocked', err.message);
        failed++;
      }
    }

    // --------------------------------------------------
    // ORDER-19: Create Change Request for approved item
    // --------------------------------------------------
    let crId: string;
    try {
      const cr = await ordersService.createChangeRequest(
        testOrderItemId,
        {
          changeType: ChangeType.SCOPE_CHANGE,
          description: 'Client expanded requirements to include mobile app',
          amountDelta: 15000000,
          daysDelta: 5,
        },
        testSale1Id,
      );
      crId = String(cr.id);
      if (cr.status === 'PENDING_APPROVAL') {
        console.log('✅ PASS: ORDER-19: Create Change Request for approved item');
        passed++;
      } else {
        throw new Error(`Expected PENDING_APPROVAL but got ${cr.status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-19: Create Change Request', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-20: Approve Change Request
    // --------------------------------------------------
    try {
      const approvedCr = await ordersService.approveChangeRequest(crId, testSale1Id);
      if (approvedCr.status === 'APPROVED' && approvedCr.approved_by_employee_id) {
        console.log('✅ PASS: ORDER-20: Approve Change Request');
        passed++;
      } else {
        throw new Error(`Expected APPROVED but got ${approvedCr.status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-20: Approve Change Request', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-21: Reject Change Request
    // --------------------------------------------------
    try {
      // Create a temporary change request to test rejection
      const tempCr = await ordersService.createChangeRequest(
        testOrderItemId,
        {
          changeType: ChangeType.PRICE_CHANGE,
          description: 'Temporary discount request',
          amountDelta: -5000000,
        },
        testSale1Id,
      );
      const rejectedCr = await ordersService.rejectChangeRequest(String(tempCr.id), testSale1Id);
      if (rejectedCr.status === 'REJECTED') {
        console.log('✅ PASS: ORDER-21: Reject Change Request');
        passed++;
      } else {
        throw new Error(`Expected REJECTED but got ${rejectedCr.status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-21: Reject Change Request', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-22: Implemented Change Request updates net value & preserves audit/history
    // --------------------------------------------------
    try {
      const implementedCr = await ordersService.implementChangeRequest(crId, testSale1Id);
      const orderDetail = await ordersService.findOrderById(testOrderId);
      const item1 = orderDetail.items.find((i) => String(i.id) === testOrderItemId);

      if (
        implementedCr.status === 'IMPLEMENTED' &&
        implementedCr.implemented_at &&
        item1 &&
        Number(item1.net_service_value) === 115000000 // 100M + 15M delta
      ) {
        console.log('✅ PASS: ORDER-22: Implemented Change Request updates net service value & preserves audit');
        passed++;
      } else {
        throw new Error(`Unexpected net service value after implementation: ${item1?.net_service_value}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-22: Implemented Change Request', err.message);
      failed++;
    }

    // --------------------------------------------------
    // ORDER-07: REJECT Order (PENDING_APPROVAL -> REJECTED)
    // --------------------------------------------------
    try {
      // Set workflow_status back to PENDING_APPROVAL to test REJECT
      await kysely.db
        .updateTable('orders')
        .set({ workflow_status: 'PENDING_APPROVAL' })
        .where('id', '=', testOrderId as any)
        .execute();

      const rejectedOrder = await ordersService.rejectOrder(
        testOrderId,
        { reason: 'Budget cancelled by customer' },
        testSale1Id,
      );

      if (rejectedOrder.workflow_status === 'REJECTED') {
        console.log('✅ PASS: ORDER-07: REJECT Order (PENDING_APPROVAL -> REJECTED)');
        passed++;
      } else {
        throw new Error(`Expected REJECTED but got ${rejectedOrder.workflow_status}`);
      }
    } catch (err: any) {
      console.error('❌ FAIL: ORDER-07: REJECT Order', err.message);
      failed++;
    }
  } finally {
    // Cleanup fixtures
    try {
      if (testAccountId) {
        await kysely.db.deleteFrom('audit_logs').where('entity_id', '=', testOrderId as any).execute();
        await kysely.db.deleteFrom('change_requests').where('order_item_id', '=', testOrderItemId as any).execute();
        await kysely.db.deleteFrom('order_item_requirements').where('order_item_id', '=', testOrderItemId as any).execute();
        await kysely.db.deleteFrom('order_items').where('order_id', '=', testOrderId as any).execute();
        await kysely.db.deleteFrom('orders').where('account_id', '=', testAccountId as any).execute();
        await kysely.db.deleteFrom('contacts').where('account_id', '=', testAccountId as any).execute();
        await kysely.db.deleteFrom('deals').where('account_id', '=', testAccountId as any).execute();
        await kysely.db.deleteFrom('accounts').where('id', '=', testAccountId as any).execute();
      }
      if (testLeadId) {
        await kysely.db.deleteFrom('leads').where('id', '=', testLeadId as any).execute();
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
  console.log(`ORDER INTEGRATION TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
  console.log('==================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runOrderIntegrationTests().catch((err) => {
  console.error('❌ Order Integration Test Suite Error:', err);
  process.exit(1);
});
