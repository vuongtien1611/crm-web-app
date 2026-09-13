import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { KyselyService } from '../database/kysely.service';
import { PasswordService } from '../modules/auth/services/password.service';
import { SubscriptionsService } from '../modules/subscriptions/subscriptions.service';
import { sql } from 'kysely';

async function seedAndVerifySubscriptionRoles() {
  console.log('====================================================');
  console.log('PHASE J: PREPARING SEED DATA & VERIFYING ALL ROLES');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule);
  const kysely = app.get(KyselyService);
  const passwordService = app.get(PasswordService);
  const db = kysely.db;
  const subService = app.get(SubscriptionsService);

  const pwdHash = await passwordService.hashPassword('Password123!@#');
  const runId = Math.floor(Math.random() * 1000000);

  try {
    // 1. Fetch positions and roles
    const salePos = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const devPos = await db.selectFrom('positions').selectAll().where('code', '=', 'DEV').executeTakeFirstOrThrow();
    const acctPos = await db.selectFrom('positions').selectAll().where('code', '=', 'ACCOUNTANT').executeTakeFirstOrThrow();

    const adminRole = await db.selectFrom('roles').selectAll().where('code', '=', 'ADMIN').executeTakeFirstOrThrow();
    const bossRole = await db.selectFrom('roles').selectAll().where('code', '=', 'BOSS').executeTakeFirstOrThrow();
    const saleRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const salesLeaderRole = await db.selectFrom('roles').selectAll().where('code', '=', 'SALES_TEAM_LEADER').executeTakeFirstOrThrow();
    const devLeaderRole = await db.selectFrom('roles').selectAll().where('code', '=', 'DEV_TEAM_LEADER').executeTakeFirstOrThrow();
    const acctRole = await db.selectFrom('roles').selectAll().where('code', '=', 'ACCOUNTANT').executeTakeFirstOrThrow();

    // Helper: create user + employee + role
    async function createOrUpdateActor(
      username: string,
      email: string,
      code: string,
      name: string,
      posId: number | string,
      roleId: number | string,
    ) {
      let user = await db.selectFrom('users').selectAll().where('username', '=', username).executeTakeFirst();
      if (!user) {
        [user] = await db
          .insertInto('users')
          .values({
            username,
            email,
            password_hash: pwdHash,
            status: 'ACTIVE',
            must_change_password: false,
          })
          .returningAll()
          .execute();
      } else {
        await db
          .updateTable('users')
          .set({ password_hash: pwdHash, status: 'ACTIVE', must_change_password: false })
          .where('id', '=', user.id)
          .execute();
      }

      let emp = await db.selectFrom('employees').selectAll().where('user_id', '=', user.id).executeTakeFirst();
      if (!emp) {
        [emp] = await db
          .insertInto('employees')
          .values({
            employee_code: code,
            full_name: name,
            phone: '0988' + Math.floor(100000 + Math.random() * 900000),
            user_id: user.id,
            position_id: posId as any,
            status: 'ACTIVE',
          })
          .returningAll()
          .execute();
      }

      // Assign role
      const ur = await db
        .selectFrom('user_roles')
        .selectAll()
        .where('user_id', '=', user.id)
        .where('role_id', '=', roleId as any)
        .executeTakeFirst();
      if (!ur) {
        await db
          .insertInto('user_roles')
          .values({ user_id: user.id, role_id: roleId as any })
          .execute();
      }

      return { user, emp };
    }

    // Create actors
    const adminActor = await createOrUpdateActor('admin_j', 'admin_j@crm.local', `ADM-J-${runId}`, 'Admin Phase J', salePos.id, adminRole.id);
    const bossActor = await createOrUpdateActor('boss_j', 'boss_j@crm.local', `BOS-J-${runId}`, 'Boss Phase J', salePos.id, bossRole.id);
    const saleAActor = await createOrUpdateActor('sale_a_j', 'sale_a_j@crm.local', `SLA-J-${runId}`, 'Sale A Phase J', salePos.id, saleRole.id);
    const saleBActor = await createOrUpdateActor('sale_b_j', 'sale_b_j@crm.local', `SLB-J-${runId}`, 'Sale B Phase J', salePos.id, saleRole.id);
    const sLeaderActor = await createOrUpdateActor('s_lead_j', 's_lead_j@crm.local', `SLD-J-${runId}`, 'Sales Leader Team A', salePos.id, salesLeaderRole.id);
    const devEmpActor = await createOrUpdateActor('dev_emp_j', 'dev_emp_j@crm.local', `DEV-J-${runId}`, 'Dev Engineer A', devPos.id, devLeaderRole.id);
    const dLeaderActor = await createOrUpdateActor('d_lead_j', 'd_lead_j@crm.local', `DLD-J-${runId}`, 'Dev Leader Team A', devPos.id, devLeaderRole.id);
    const dLeaderBActor = await createOrUpdateActor('d_lead_b_j', 'd_lead_b_j@crm.local', `DLB-J-${runId}`, 'Dev Leader Team B', devPos.id, devLeaderRole.id);
    const acctActor = await createOrUpdateActor('acct_j', 'acct_j@crm.local', `ACC-J-${runId}`, 'Accountant Phase J', acctPos.id, acctRole.id);

    // Sales Teams
    let tSalesA = await db.selectFrom('teams').selectAll().where('code', '=', 'TM-SL-A').executeTakeFirst();
    if (!tSalesA) {
      [tSalesA] = await db.insertInto('teams').values({ code: 'TM-SL-A', name: 'Sales Team A', department: 'SALES' }).returningAll().execute();
    }
    // Memberships for Sales Team A
    await db.deleteFrom('team_memberships').where('team_id', '=', tSalesA.id).execute();
    await db.insertInto('team_memberships').values([
      { team_id: tSalesA.id, employee_id: sLeaderActor.emp.id, is_leader: true, effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any },
      { team_id: tSalesA.id, employee_id: saleAActor.emp.id, is_leader: false, effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any },
    ]).execute();

    // Dev Teams
    let tDevA = await db.selectFrom('teams').selectAll().where('code', '=', 'TM-DV-A').executeTakeFirst();
    if (!tDevA) {
      [tDevA] = await db.insertInto('teams').values({ code: 'TM-DV-A', name: 'Dev Team A', department: 'DEV' }).returningAll().execute();
    }
    await db.deleteFrom('team_memberships').where('team_id', '=', tDevA.id).execute();
    await db.insertInto('team_memberships').values([
      { team_id: tDevA.id, employee_id: dLeaderActor.emp.id, is_leader: true, effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any },
      { team_id: tDevA.id, employee_id: devEmpActor.emp.id, is_leader: false, effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any },
    ]).execute();

    let tDevB = await db.selectFrom('teams').selectAll().where('code', '=', 'TM-DV-B').executeTakeFirst();
    if (!tDevB) {
      [tDevB] = await db.insertInto('teams').values({ code: 'TM-DV-B', name: 'Dev Team B', department: 'DEV' }).returningAll().execute();
    }
    await db.deleteFrom('team_memberships').where('team_id', '=', tDevB.id).execute();
    await db.insertInto('team_memberships').values([
      { team_id: tDevB.id, employee_id: dLeaderBActor.emp.id, is_leader: true, effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any },
    ]).execute();

    // Accounts & Contacts
    const [accA] = await db.insertInto('accounts').values({ company_name: `VMAX Client Alpha ${runId}`, phone: '0281112233' }).returningAll().execute();
    const [ctA] = await db.insertInto('contacts').values({ account_id: accA.id, full_name: 'Director Alpha', is_primary: true }).returningAll().execute();

    const [accB] = await db.insertInto('accounts').values({ company_name: `VMAX Client Beta ${runId}`, phone: '0284445566' }).returningAll().execute();
    const [ctB] = await db.insertInto('contacts').values({ account_id: accB.id, full_name: 'Director Beta', is_primary: true }).returningAll().execute();

    // Service
    let srv = await db.selectFrom('services').selectAll().where('code', '=', 'SEO-VERIFY-J').executeTakeFirst();
    if (!srv) {
      [srv] = await db.insertInto('services').values({
        code: 'SEO-VERIFY-J',
        name: 'Dịch vụ SEO Tổng Thể Phase J',
        service_type: 'RECURRING',
        is_active: true,
      }).returningAll().execute();
    }

    // Commission policies
    await db.insertInto('commission_policies').values([
      { policy_name: `Pol Sale ${runId}`, policy_type: 'SALE', service_id: srv.id, position_id: salePos.id, rate: 0.1 as any, effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any },
      { policy_name: `Pol Dev ${runId}`, policy_type: 'PROJECT_DELIVERY', service_id: srv.id, position_id: devPos.id, assignee_count: 1, rate: 0.05 as any, effective_range: sql`tstzrange(NOW() - INTERVAL '30 days', NULL, '[]')` as any },
    ]).execute();

    const reqTemplate = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirst();
    const tmplId = reqTemplate ? reqTemplate.id : (1 as any);

    // Order A (by saleA)
    const [ordA] = await db.insertInto('orders').values({ order_code: `ORD-A-${runId}`, account_id: accA.id, primary_contact_id: ctA.id, workflow_status: 'APPROVED' }).returningAll().execute();
    const [oiA] = await db.insertInto('order_items').values({
      order_id: ordA.id,
      closing_sale_id: saleAActor.emp.id,
      service_id: srv.id,
      requirement_template_id: tmplId,
      requirement_template_version: 1,
      original_price: 20000000,
      discount_amount: 0,
      net_service_value: 20000000,
      vat_amount: 2000000,
      approval_status: 'APPROVED',
      delivery_status: 'IN_PROGRESS',
      payment_status: 'UNPAID',
    }).returningAll().execute();

    // Order B (by saleB)
    const [ordB] = await db.insertInto('orders').values({ order_code: `ORD-B-${runId}`, account_id: accB.id, primary_contact_id: ctB.id, workflow_status: 'APPROVED' }).returningAll().execute();
    const [oiB] = await db.insertInto('order_items').values({
      order_id: ordB.id,
      closing_sale_id: saleBActor.emp.id,
      service_id: srv.id,
      requirement_template_id: tmplId,
      requirement_template_version: 1,
      original_price: 25000000,
      discount_amount: 0,
      net_service_value: 25000000,
      vat_amount: 2500000,
      approval_status: 'APPROVED',
      delivery_status: 'IN_PROGRESS',
      payment_status: 'UNPAID',
    }).returningAll().execute();

    // Subscription A & B
    const subA = await subService.createSubscription({ orderItemId: String(oiA.id), billingInterval: 'MONTH', intervalCount: 1, autoRenew: true });
    const subB = await subService.createSubscription({ orderItemId: String(oiB.id), billingInterval: 'MONTH', intervalCount: 1, autoRenew: true });

    // Generate period on subA and assign to devEmpActor (Team A)
    const [periodA1] = await subService.generateServicePeriods(String(subA.id), 1);
    await subService.assignServicePeriod(String(periodA1.id), String(devEmpActor.emp.id), 'PRIMARY', 'Assigned dev team A');

    // Give subA an approved payment plan (Accountant scope)
    await db.insertInto('order_item_payment_plans').values({
      order_item_id: oiA.id,
      version: 1,
      status: 'APPROVED',
      created_by_employee_id: adminActor.emp.id,
      config_snapshot: JSON.stringify({ installments: [] }),
      approved_at: new Date() as any,
    }).execute();

    console.log(`✅ Test actors and subscriptions created:`);
    console.log(`   Subscription A (Team A, Sale A, Assigned to Dev Team A, Approved Payment Plan): ID #${subA.id}`);
    console.log(`   Subscription B (Sale B, No dev assignment, No payment plan): ID #${subB.id}`);
    console.log(`   Users created: admin_j, boss_j, sale_a_j, sale_b_j, s_lead_j, d_lead_j, d_lead_b_j, acct_j`);
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

seedAndVerifySubscriptionRoles().catch((err) => {
  console.error('❌ Error during setup:', err);
  process.exit(1);
});
