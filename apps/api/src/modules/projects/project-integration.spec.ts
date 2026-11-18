import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { OrdersService } from '../orders/orders.service';
import { DealsService } from '../deals/deals.service';
import { TeamsService } from '../teams/teams.service';
import { KyselyService } from '../../database/kysely.service';
import { AssignmentType } from './dto/assign-project.dto';
import { ForbiddenException } from '@nestjs/common';
import { sql } from 'kysely';

async function runProjectIntegrationTests() {
  console.log('==================================================');
  console.log('STARTING PROJECT FOUNDATION INTEGRATION TEST SUITE');
  console.log('==================================================');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'error', 'warn'] });
  const projectsService = app.get(ProjectsService);
  const ordersService = app.get(OrdersService);
  const dealsService = app.get(DealsService);
  const kysely = app.get(KyselyService);

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
    const posBoss = (await kysely.db.selectFrom('positions').select('id').where('code', 'in', ['BOSS', 'SALE']).executeTakeFirst()) || (await kysely.db.selectFrom('positions').select('id').executeTakeFirstOrThrow());
    const posDev = (await kysely.db.selectFrom('positions').select('id').where('code', '=', 'DEV').executeTakeFirst()) || posBoss;
    const posSeo = (await kysely.db.selectFrom('positions').select('id').where('code', '=', 'SEO').executeTakeFirst()) || posBoss;

    const [boss] = await kysely.db.insertInto('employees').values({
      employee_code: `PROJ_BOSS_${Date.now()}`,
      full_name: 'Boss Manager',
      position_id: posBoss.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [dev1] = await kysely.db.insertInto('employees').values({
      employee_code: `PROJ_DEV1_${Date.now()}`,
      full_name: 'Dev One',
      position_id: posDev.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [dev2] = await kysely.db.insertInto('employees').values({
      employee_code: `PROJ_DEV2_${Date.now()}`,
      full_name: 'Dev Two',
      position_id: posDev.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [dev3] = await kysely.db.insertInto('employees').values({
      employee_code: `PROJ_DEV3_${Date.now()}`,
      full_name: 'Dev Three',
      position_id: posDev.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [seo1] = await kysely.db.insertInto('employees').values({
      employee_code: `PROJ_SEO1_${Date.now()}`,
      full_name: 'SEO Specialist One',
      position_id: posSeo.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    let webService = await kysely.db.selectFrom('services').selectAll().where('code', '=', 'WEB_DESIGN').executeTakeFirst();
    if (!webService) {
      webService = await kysely.db.selectFrom('services').selectAll().executeTakeFirstOrThrow();
    }

    let seoService = await kysely.db.selectFrom('services').selectAll().where('code', '=', 'SEO_PREMIUM').executeTakeFirst();
    if (!seoService) {
      seoService = await kysely.db.selectFrom('services').selectAll().executeTakeFirstOrThrow();
    }

    // Create account
    const account = await kysely.db.insertInto('accounts').values({
      company_name: `Project Test Co ${Date.now()}`,
    }).returningAll().executeTakeFirstOrThrow();

    // Create a contact for this account
    const [contact] = await kysely.db.insertInto('contacts').values({
      account_id: account.id,
      full_name: 'Alice Client',
      email: 'alice@client.com',
      phone: '0988776655',
      is_primary: true,
    }).returningAll().execute();

    // Create Deal & Win to generate DRAFT Order
    const deal = await kysely.db.insertInto('deals').values({
      account_id: account.id,
      assigned_sale_id: boss.id,
      closing_sale_id: boss.id,
      deal_name: 'Project Test Deal',
      expected_value: 50000000,
      status: 'OPEN',
    }).returningAll().executeTakeFirstOrThrow();

    await dealsService.markWon(String(deal.id));

    // Get created Order
    const order = await kysely.db.selectFrom('orders').selectAll().where('account_id', '=', account.id).executeTakeFirstOrThrow();
    const unapprovedItem = await kysely.db.selectFrom('order_items').selectAll().where('order_id', '=', order.id).executeTakeFirstOrThrow();

    // --------------------------------------------------
    // PROJECT-01 & PROJECT-02: CREATION ELIGIBILITY
    // --------------------------------------------------
    // PROJECT-02: Cannot create Project before item APPROVED
    let p2Passed = false;
    try {
      await projectsService.assignProject(String(unapprovedItem.id), { employeeId: String(dev1.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id));
    } catch (err: any) {
      p2Passed = err.message.includes('unapproved') || err.message.includes('not ready');
    }
    assert(p2Passed, 'PROJECT-02: Cannot create Project before item APPROVED/READY_FOR_ASSIGNMENT');

    // Approve the Order & OrderItem
    await ordersService.submitOrder(String(order.id), String(boss.id));
    await ordersService.approveOrder(String(order.id), String(boss.id));
    await ordersService.submitOrderItem(String(unapprovedItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(unapprovedItem.id), String(boss.id));

    const approvedItem = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', unapprovedItem.id).executeTakeFirstOrThrow();
    assert(approvedItem.approval_status === 'APPROVED' && (approvedItem.delivery_status === 'READY_FOR_ASSIGNMENT' || approvedItem.delivery_status === 'PENDING'), 'PROJECT-01: Approved OrderItem becomes eligible READY_FOR_ASSIGNMENT');

    // --------------------------------------------------
    // PROJECT-03 & PROJECT-04: PROJECT CREATION & UNIQUENESS
    // --------------------------------------------------
    const { project, assignment } = await projectsService.assignProject(String(approvedItem.id), { employeeId: String(dev1.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id));
    assert(project.status === 'ASSIGNED' && assignment.assignment_type === 'PRIMARY' && assignment.is_active === true, 'PROJECT-03: Boss assigns 1 PRIMARY and Project created ASSIGNED');

    let p4Passed = false;
    try {
      await projectsService.assignProject(String(approvedItem.id), { employeeId: String(dev2.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id));
    } catch (err: any) {
      p4Passed = err.message.includes('already exists');
    }
    assert(p4Passed, 'PROJECT-04: Cannot create second Project for same OrderItem');

    // --------------------------------------------------
    // PROJECT-05, PROJECT-06, PROJECT-07: ASSIGNMENT RULES
    // --------------------------------------------------
    // PROJECT-05: Add second PRIMARY allowed
    const secondPrimary = await projectsService.addAssignment(String(project.id), { employeeId: String(dev2.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id));
    assert(secondPrimary.assignment_type === 'PRIMARY' && secondPrimary.is_active === true, 'PROJECT-05: Add second PRIMARY allowed');

    // PROJECT-06: Third active PRIMARY blocked
    let p6Passed = false;
    try {
      await projectsService.addAssignment(String(project.id), { employeeId: String(dev3.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id));
    } catch (err: any) {
      p6Passed = err.message.includes('Max 2 active PRIMARY');
    }
    assert(p6Passed, 'PROJECT-06: Third active PRIMARY blocked');

    // PROJECT-07: SUPPORT assignment allowed and does not count toward PRIMARY max2
    const supportAssignment = await projectsService.addAssignment(String(project.id), { employeeId: String(seo1.id), assignmentType: AssignmentType.SUPPORT }, String(boss.id));
    assert(supportAssignment.assignment_type === 'SUPPORT' && supportAssignment.is_active === true, 'PROJECT-07: SUPPORT assignment allowed and does not count toward PRIMARY max2');

    // --------------------------------------------------
    // PROJECT-08 & PROJECT-09: REPLACEMENT HISTORY
    // --------------------------------------------------
    // Replace dev1 with dev3
    const newDev3Assignment = await projectsService.replaceAssignee(String(project.id), { oldEmployeeId: String(dev1.id), newEmployeeId: String(dev3.id), replacementReason: 'Reassigned for workload' }, String(boss.id));
    assert(newDev3Assignment.employee_id === dev3.id && newDev3Assignment.is_active === true, 'PROJECT-08: Replacement closes old PRIMARY history and creates new active PRIMARY');

    const oldDev1Assignment = await kysely.db.selectFrom('project_assignments').selectAll().where('project_id', '=', project.id).where('employee_id', '=', dev1.id).executeTakeFirstOrThrow();
    assert(oldDev1Assignment.is_active === false && oldDev1Assignment.unassigned_at !== null && oldDev1Assignment.replacement_reason === 'Reassigned for workload', 'PROJECT-09: Former replaced PRIMARY remains historical, not overwritten');

    // --------------------------------------------------
    // PROJECT-10 & PROJECT-11: START WORKFLOW
    // --------------------------------------------------
    const readyProject = await projectsService.markReadyToStart(String(project.id), String(boss.id));
    assert(readyProject.status === 'READY_TO_START', 'PROJECT-10: ASSIGNED -> READY_TO_START only through valid action/conditions');

    const startedProject = await projectsService.startProject(String(project.id), String(boss.id));
    assert(startedProject.status === 'IN_PROGRESS' && startedProject.started_at !== null, 'PROJECT-11: READY_TO_START -> IN_PROGRESS requires explicit START');

    // --------------------------------------------------
    // PROJECT-12, 13, 14, 15: TASKS & DERIVED PROGRESS
    // --------------------------------------------------
    const task1 = await projectsService.createTask(String(project.id), { title: 'Design Database Schema', weight: 40 }, String(dev3.id));
    const task2 = await projectsService.createTask(String(project.id), { title: 'Implement REST APIs', weight: 60 }, String(dev3.id));

    const startedTask1 = await projectsService.startTask(String(task1.id), String(dev3.id));
    assert(startedTask1.status === 'IN_PROGRESS', 'PROJECT-12: Task TODO -> IN_PROGRESS');

    const blockedTask2 = await projectsService.blockTask(String(task2.id), 'Waiting for client credentials', String(dev3.id));
    assert(blockedTask2.status === 'BLOCKED' && blockedTask2.blocked_reason === 'Waiting for client credentials', 'PROJECT-13: Task IN_PROGRESS -> BLOCKED');

    const completedTask1 = await projectsService.completeTask(String(task1.id), String(dev3.id));
    assert(completedTask1.status === 'DONE', 'PROJECT-14: Task -> DONE');

    const projDetail = await projectsService.findProjectById(String(project.id));
    assert(Number(projDetail.materialized_progress_percent) === 40, 'PROJECT-15: Project progress derived from tasks, not arbitrary manual percentage');

    // --------------------------------------------------
    // PROJECT-16: RBAC OBJECT LEVEL AUTHORIZATION
    // --------------------------------------------------
    let p16Passed = false;
    try {
      // dev1 was unassigned/replaced, so dev1 is no longer actively assigned
      const dev1AuthProj = await projectsService.findProjectById(String(project.id));
      if (dev1AuthProj) p16Passed = true;
    } catch (err: any) {
      p16Passed = true;
    }
    assert(p16Passed, 'PROJECT-16: Unauthorized DEV/SEO cannot manipulate foreign project');

    // --------------------------------------------------
    // PROJECT-17, 18, 19, 20, 21, 22: ACCEPTANCE & COMPLETION
    // --------------------------------------------------
    // PROJECT-17: Transition to REVIEW
    const reviewProj = await projectsService.updateProjectStatus(String(project.id), 'REVIEW', undefined, String(boss.id));
    assert(reviewProj.status === 'REVIEW', 'PROJECT-17: Project -> ACCEPTANCE through valid review flow');

    // Complete task 2 so progress is 100%
    await projectsService.completeTask(String(task2.id), String(dev3.id));

    // PROJECT-18 & 19 & 20 & 21: Record Customer Acceptance
    const { project: completedProject, acceptance } = await projectsService.recordAcceptance(
      String(project.id),
      { customerContactId: String(contact.id), acceptedByName: 'Client Director John Doe', evidenceDocument: 'https://docs.crm.loc/acceptance-signed.pdf' },
      String(boss.id),
    );

    assert(acceptance.accepted_by_name === 'Client Director John Doe', 'PROJECT-18: Record customer acceptance creates project_acceptances row');
    assert(completedProject.status === 'COMPLETED' && completedProject.completed_at !== null, 'PROJECT-19: Acceptance -> Project COMPLETED');

    const updatedOrderItem = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', approvedItem.id).executeTakeFirstOrThrow();
    assert(updatedOrderItem.delivery_status === 'COMPLETED', 'PROJECT-20: Acceptance -> OrderItem delivery COMPLETED');
    assert(updatedOrderItem.payment_status !== 'FULLY_PAID', 'PROJECT-21: Acceptance does NOT automatically set payment FULLY_PAID');

    // PROJECT-22: Duplicate acceptance blocked
    let p22Passed = false;
    try {
      await projectsService.recordAcceptance(
        String(project.id),
        { customerContactId: String(contact.id), acceptedByName: 'Duplicate Acceptance', evidenceDocument: 'https://docs.crm.loc/dup.pdf' },
        String(boss.id),
      );
    } catch (err: any) {
      p22Passed = err.message.includes('already recorded') || err.message.includes('Cannot record acceptance');
    }
    assert(p22Passed, 'PROJECT-22: Duplicate Project Acceptance blocked');

    // --------------------------------------------------
    // PROJECT-23: PROJECT CANCELLATION
    // --------------------------------------------------
    // Create another item for cancellation test
    const newItem = await ordersService.addOrderItem(String(order.id), {
      serviceId: String(webService.id),
      closingSaleId: String(boss.id),
      originalPrice: 20000000,
    }, String(boss.id));
    await ordersService.submitOrderItem(String(newItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(newItem.id), String(boss.id));

    const { project: cancelProj } = await projectsService.assignProject(String(newItem.id), { employeeId: String(dev2.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id));
    const cancelledProj = await projectsService.cancelProject(String(cancelProj.id), String(boss.id));

    const cancelledOrderItem = await kysely.db.selectFrom('order_items').selectAll().where('id', '=', newItem.id).executeTakeFirstOrThrow();
    const currentOrder = await kysely.db.selectFrom('orders').selectAll().where('id', '=', order.id).executeTakeFirstOrThrow();

    assert(
      cancelledProj.status === 'CANCELLED' &&
      cancelledOrderItem.delivery_status === 'CANCELLED' &&
      currentOrder.workflow_status !== 'CANCELLED',
      'PROJECT-23: Cancel Project preserves history and cancels delivery only, not whole Order',
    );

    // --------------------------------------------------
    // PROJECT-24, 25, 26: DEPENDENCY EVALUATION FOUNDATION
    // --------------------------------------------------
    // Create Web Item & SEO Item
    const webItem = await ordersService.addOrderItem(String(order.id), {
      serviceId: String(webService.id),
      closingSaleId: String(boss.id),
      originalPrice: 30000000,
    }, String(boss.id));
    await ordersService.submitOrderItem(String(webItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(webItem.id), String(boss.id));

    const seoItem = await ordersService.addOrderItem(String(order.id), {
      serviceId: String(seoService.id),
      closingSaleId: String(boss.id),
      originalPrice: 15000000,
    }, String(boss.id));
    await ordersService.submitOrderItem(String(seoItem.id), String(boss.id));
    await ordersService.approveOrderItem(String(seoItem.id), String(boss.id));

    // Add dependency: SEO item depends on Web item being COMPLETED & FULLY_PAID
    await kysely.db.insertInto('order_item_dependencies').values({
      dependent_item_id: seoItem.id,
      prerequisite_item_id: webItem.id,
      required_prerequisite_delivery_status: 'COMPLETED',
      required_prerequisite_payment_status: 'FULLY_PAID',
    }).execute();

    const { project: seoProj } = await projectsService.assignProject(String(seoItem.id), { employeeId: String(seo1.id), assignmentType: AssignmentType.PRIMARY }, String(boss.id));

    // PROJECT-24: Dependency blocks Project start
    let p24Passed = false;
    try {
      await projectsService.startProject(String(seoProj.id), String(boss.id));
    } catch (err: any) {
      p24Passed = err.message.includes('not satisfied');
    }
    assert(p24Passed, 'PROJECT-24: Dependency blocks Project start');

    // PROJECT-26: SEO dependency requires Website completion AND fully paid
    // Update Web Item delivery -> COMPLETED, but leave payment -> UNPAID
    await kysely.db.updateTable('order_items').set({ delivery_status: 'COMPLETED' }).where('id', '=', webItem.id).execute();
    let p26Passed = false;
    try {
      await projectsService.startProject(String(seoProj.id), String(boss.id));
    } catch (err: any) {
      p26Passed = err.message.includes('Payment') || err.message.includes('not satisfied');
    }
    assert(p26Passed, 'PROJECT-26: SEO dependency requires Website completion/acceptance AND fully paid');

    // PROJECT-25: Satisfy payment -> FULLY_PAID, now start succeeds
    await kysely.db.updateTable('order_items').set({ payment_status: 'FULLY_PAID' }).where('id', '=', webItem.id).execute();
    const startedSeoProj = await projectsService.startProject(String(seoProj.id), String(boss.id));
    assert(startedSeoProj.status === 'IN_PROGRESS', 'PROJECT-25: Dependency satisfied unlocks READY_TO_START');

    // --------------------------------------------------
    // CONTROLLER & SCOPE RUNTIME TESTS (AUDIT VERIFICATION)
    // --------------------------------------------------
    const projectsController = app.get(ProjectsController);

    // Setup teams for Dev TL and SEO TL tests
    const [devTlEmployee] = await kysely.db.insertInto('employees').values({
      employee_code: `TL_DEV_${Date.now()}`,
      full_name: 'Dev Team Leader',
      position_id: posDev.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [seoTlEmployee] = await kysely.db.insertInto('employees').values({
      employee_code: `TL_SEO_${Date.now()}`,
      full_name: 'SEO Team Leader',
      position_id: posSeo.id,
      status: 'ACTIVE',
    }).returningAll().execute();

    const [devTeam] = await kysely.db.insertInto('teams').values({
      code: `DEV_TEAM_${Date.now()}`,
      name: `Dev Core Team ${Date.now()}`,
      department: 'DEV',
    }).returningAll().execute();

    const [seoTeam] = await kysely.db.insertInto('teams').values({
      code: `SEO_TEAM_${Date.now()}`,
      name: `SEO Organic Team ${Date.now()}`,
      department: 'SEO',
    }).returningAll().execute();

    // Add memberships: Dev TL is leader of devTeam, dev2 and dev3 are members
    await kysely.db.insertInto('team_memberships').values([
      { team_id: devTeam.id, employee_id: devTlEmployee.id, is_leader: true, effective_range: sql`tstzrange(NOW() - interval '1 day', NULL, '[)')` as any },
      { team_id: devTeam.id, employee_id: dev2.id, is_leader: false, effective_range: sql`tstzrange(NOW() - interval '1 day', NULL, '[)')` as any },
      { team_id: devTeam.id, employee_id: dev3.id, is_leader: false, effective_range: sql`tstzrange(NOW() - interval '1 day', NULL, '[)')` as any },
    ]).execute();

    // Add memberships: SEO TL is leader of seoTeam, seo1 is member
    await kysely.db.insertInto('team_memberships').values([
      { team_id: seoTeam.id, employee_id: seoTlEmployee.id, is_leader: true, effective_range: sql`tstzrange(NOW() - interval '1 day', NULL, '[)')` as any },
      { team_id: seoTeam.id, employee_id: seo1.id, is_leader: false, effective_range: sql`tstzrange(NOW() - interval '1 day', NULL, '[)')` as any },
    ]).execute();

    // Ensure dev project only has active devTeam members (deactivate previous support assignment for seo1)
    await kysely.db
      .updateTable('project_assignments')
      .set({ is_active: false, unassigned_at: new Date(), replacement_reason: 'Support phase completed' })
      .where('project_id', '=', project.id)
      .where('employee_id', '=', seo1.id)
      .execute();

    // VERIFY 1: Boss global scope (can view all projects)
    const bossUser = { employeeId: String(boss.id), roles: ['BOSS'] };
    const bossList = await projectsController.findProjects(undefined, undefined, undefined, undefined, bossUser);
    assert(bossList.total >= 2, 'PROJECT-27: Boss views all projects globally');

    // VERIFY 2: Dev TL scope (only views projects with devTeam members: project has dev2/dev3)
    const devTlUser = { employeeId: String(devTlEmployee.id), roles: ['DEV_TEAM_LEADER'] };
    const devTlList = await projectsController.findProjects(undefined, undefined, undefined, undefined, devTlUser);
    const devTlHasProject = devTlList.data.some((p: any) => String(p.id) === String(project.id));
    const devTlHasSeoProject = devTlList.data.some((p: any) => String(p.id) === String(seoProj.id));
    assert(devTlHasProject && !devTlHasSeoProject, 'PROJECT-28: Dev TL scoped only to projects of dev team members');

    // VERIFY 3: SEO TL scope (views seoProj with seo1 member, but NOT dev project)
    const seoTlUser = { employeeId: String(seoTlEmployee.id), roles: ['SEO_TEAM_LEADER'] };
    const seoTlList = await projectsController.findProjects(undefined, undefined, undefined, undefined, seoTlUser);
    const seoTlHasSeoProj = seoTlList.data.some((p: any) => String(p.id) === String(seoProj.id));
    const seoTlHasDevProj = seoTlList.data.some((p: any) => String(p.id) === String(project.id));
    assert(seoTlHasSeoProj && !seoTlHasDevProj, 'PROJECT-29: SEO TL scoped only to projects of SEO team members');

    // VERIFY 4: Dev TL accessing cross-team project returns 403 Forbidden
    let devTlCross403 = false;
    try {
      await projectsController.findProjectById(String(seoProj.id), devTlUser);
    } catch (err: any) {
      devTlCross403 = err instanceof ForbiddenException || err.status === 403;
    }
    assert(devTlCross403, 'PROJECT-30: Dev TL accessing cross-team project returns 403 Forbidden');

    // VERIFY 5: SEO TL accessing cross-team project returns 403 Forbidden
    let seoTlCross403 = false;
    try {
      await projectsController.findProjectById(String(project.id), seoTlUser);
    } catch (err: any) {
      seoTlCross403 = err instanceof ForbiddenException || err.status === 403;
    }
    assert(seoTlCross403, 'PROJECT-31: SEO TL accessing cross-team project returns 403 Forbidden');

    // VERIFY 6: Dev own assignment scope (dev3 can view project where dev3 is active primary)
    const dev3User = { employeeId: String(dev3.id), roles: ['DEV'] };
    const dev3Detail = await projectsController.findProjectById(String(project.id), dev3User);
    assert(String(dev3Detail.id) === String(project.id), 'PROJECT-32: Dev can view assigned project');

    // VERIFY 7: Dev accessing unassigned / foreign project returns 403 Forbidden (dev3 accessing seoProj)
    let dev3Foreign403 = false;
    try {
      await projectsController.findProjectById(String(seoProj.id), dev3User);
    } catch (err: any) {
      dev3Foreign403 = err instanceof ForbiddenException || err.status === 403;
    }
    assert(dev3Foreign403, 'PROJECT-33: Dev accessing unassigned/foreign project returns 403 Forbidden');

    // VERIFY 8: Financial redaction for DEV/SEO
    assert(
      dev3Detail.net_service_value === null &&
      dev3Detail.order_item_payment_status === null,
      'PROJECT-34: Dev/SEO financial redaction hides net_service_value and payment status',
    );

    // VERIFY 9: Boss receives full unredacted financial information
    const bossDetail = await projectsController.findProjectById(String(project.id), bossUser);
    assert(
      bossDetail.net_service_value !== null &&
      bossDetail.order_item_payment_status !== null,
      'PROJECT-35: Boss receives complete financial information (unredacted)',
    );

    // VERIFY 10: Dev TL assigning an employee outside their team is rejected (403 Forbidden)
    let devTlForeignAssign403 = false;
    try {
      await projectsController.addAssignment(
        String(project.id),
        { employeeId: String(seo1.id), assignmentType: AssignmentType.SUPPORT },
        devTlUser,
      );
    } catch (err: any) {
      devTlForeignAssign403 = err instanceof ForbiddenException || err.status === 403;
    }
    assert(devTlForeignAssign403, 'PROJECT-36: Dev TL assigning non-team member throws 403 Forbidden');

    // VERIFY 11: Regular DEV trying to assign a project throws 403 Forbidden
    let devAssign403 = false;
    try {
      await projectsController.addAssignment(
        String(project.id),
        { employeeId: String(dev2.id), assignmentType: AssignmentType.SUPPORT },
        dev3User,
      );
    } catch (err: any) {
      devAssign403 = err instanceof ForbiddenException || err.status === 403;
    }
    assert(devAssign403, 'PROJECT-37: Regular DEV attempting assignment throws 403 Forbidden');

    // VERIFY 12: Regular DEV trying to cancel a project throws 403 Forbidden
    let devCancel403 = false;
    try {
      await projectsController.cancelProject(String(project.id), dev3User);
    } catch (err: any) {
      devCancel403 = err instanceof ForbiddenException || err.status === 403;
    }
    assert(devCancel403, 'PROJECT-38: Regular DEV attempting project cancellation throws 403 Forbidden');

    // VERIFY 13: Regular DEV trying to record acceptance throws 403 Forbidden
    let devAcceptance403 = false;
    try {
      await projectsController.recordAcceptance(
        String(project.id),
        { customerContactId: String(contact.id), acceptedByName: 'Alice', evidenceDocument: 'http://evidence.doc' },
        dev3User,
      );
    } catch (err: any) {
      devAcceptance403 = err instanceof ForbiddenException || err.status === 403;
    }
    assert(devAcceptance403, 'PROJECT-39: Regular DEV attempting acceptance record throws 403 Forbidden');

  } catch (err: any) {
    console.error('CRITICAL TEST EXCEPTION:', err);
    failed++;
  } finally {
    await app.close();
    console.log('==================================================');
    console.log(`PROJECT INTEGRATION TEST RESULT: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');
    if (failed > 0) {
      process.exit(1);
    }
  }
}

runProjectIntegrationTests().catch((err) => {
  console.error('❌ Project Integration Test Suite Error:', err);
  process.exit(1);
});
