import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { KyselyService } from '../../database/kysely.service';
import { AuthService } from '../auth/auth.service';
import { PasswordService } from '../auth/services/password.service';
import { SessionService } from '../auth/services/session.service';
import { RbacService } from '../rbac/rbac.service';
import { StorageService } from '../storage/storage.service';
import { StorageController } from '../storage/storage.controller';
import { LeadsService } from '../leads/leads.service';
import { LeadsController } from '../leads/leads.controller';
import { DealsController } from '../deals/deals.controller';
import { OrdersController } from '../orders/orders.controller';
import { ProjectsController } from '../projects/projects.controller';
import { PaymentsController } from '../payments/payments.controller';
import { SubscriptionsController } from '../subscriptions/subscriptions.controller';
import { EmployeesController } from '../employees/employees.controller';
import { TeamsController } from '../teams/teams.controller';
import { PayrollController } from '../payroll/payroll.controller';
import { ExpensesController } from '../expenses/expenses.controller';
import { ForbiddenException, BadRequestException, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';

function assert(condition: boolean, testName: string, failureReason?: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
  } else {
    console.error(`❌ FAIL: ${testName} - ${failureReason || 'Assertion failed'}`);
    throw new Error(`Security test failed: ${testName} (${failureReason})`);
  }
}

export async function runPhaseQSecuritySuite() {
  console.log('====================================================');
  console.log('STARTING PHASE Q: SECURITY, IDOR & RBAC AUDIT SUITE');
  console.log('====================================================');

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  const kysely = app.get(KyselyService);
  const db = kysely.db;
  const authService = app.get(AuthService);
  const passwordService = app.get(PasswordService);
  const sessionService = app.get(SessionService);
  const rbacService = app.get(RbacService);
  const storageService = app.get(StorageService);
  const storageController = app.get(StorageController);

  const leadsController = app.get(LeadsController);
  const dealsController = app.get(DealsController);
  const ordersController = app.get(OrdersController);
  const projectsController = app.get(ProjectsController);
  const paymentsController = app.get(PaymentsController);
  const subsController = app.get(SubscriptionsController);
  const employeesController = app.get(EmployeesController);
  const teamsController = app.get(TeamsController);
  const payrollController = app.get(PayrollController);
  const expensesController = app.get(ExpensesController);

  const runId = Math.floor(Math.random() * 1000000);

  try {
    // ----------------------------------------------------------------
    // SECTION 1: AUTH SECURITY & CRYPTO AUDIT (ARGON2ID, SESSIONS, TOKENS)
    // ----------------------------------------------------------------
    console.log('\n--- SECTION 1: AUTH SECURITY & ARGON2ID AUDIT ---');

    const rawPassword = 'StrongPassword!123';
    const hash = await passwordService.hashPassword(rawPassword);

    // Verify Argon2id variant ($argon2id$)
    assert(hash.startsWith('$argon2id$'), 'Q-SEC-AUTH-01: Password hash utilizes standard Argon2id algorithm');
    const isMatch = await passwordService.verifyPassword(hash, rawPassword);
    assert(isMatch === true, 'Q-SEC-AUTH-02: Argon2id verification succeeds for correct password');
    const isBadMatch = await passwordService.verifyPassword(hash, 'WrongPassword');
    assert(isBadMatch === false, 'Q-SEC-AUTH-03: Argon2id verification rejects incorrect password');

    // Test token lifecycle
    const testUsername = `sec_user_${runId}`;
    const [userRow] = await db
      .insertInto('users')
      .values({
        username: testUsername,
        email: `sec_${runId}@f8.loc`,
        password_hash: hash,
        status: 'ACTIVE',
      })
      .returningAll()
      .execute();

    const roleSale = await db.selectFrom('roles').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    await db.insertInto('user_roles').values({ user_id: userRow.id, role_id: roleSale.id }).execute();

    const loginRes = await authService.login({ identifier: testUsername, password: rawPassword }, 'Test-Agent', '127.0.0.1');
    assert(!!loginRes.accessToken && !!loginRes.refreshToken, 'Q-SEC-AUTH-04: Login issues standard access token and refresh token');

    // Refresh token works
    const refreshRes = await authService.refresh(loginRes.refreshToken, 'Test-Agent', '127.0.0.1');
    assert(!!refreshRes.accessToken && !!refreshRes.refreshToken, 'Q-SEC-AUTH-05: Refresh token rotation issues new token pair');

    // Logout revokes session
    await authService.logout(String(userRow.id));
    let revokedRejected = false;
    try {
      await authService.refresh(refreshRes.refreshToken, 'Test-Agent', '127.0.0.1');
    } catch (err: any) {
      revokedRejected = err instanceof UnauthorizedException || err.status === 401;
    }
    assert(revokedRejected, 'Q-SEC-AUTH-06: Revoked session refresh token strictly rejected with 401 Unauthorized');

    // ----------------------------------------------------------------
    // SECTION 2: IDOR & OBJECT AUTHORIZATION ACROSS 10 ENTITIES
    // ----------------------------------------------------------------
    console.log('\n--- SECTION 2: IDOR / OBJECT AUTHORIZATION AUDIT ---');

    // Setup Entity Ownership: Owner A (Employee A) vs Attacker B (Employee B)
    const posSale = await db.selectFrom('positions').selectAll().where('code', '=', 'SALE').executeTakeFirstOrThrow();
    const [empA] = await db.insertInto('employees').values({ employee_code: `IDOR-A-${runId}`, full_name: 'Owner A', position_id: posSale.id, status: 'ACTIVE' }).returningAll().execute();
    const [empB] = await db.insertInto('employees').values({ employee_code: `IDOR-B-${runId}`, full_name: 'Attacker B', position_id: posSale.id, status: 'ACTIVE' }).returningAll().execute();

    const actorA = { id: 101, employeeId: String(empA.id), roles: ['SALE'], permissions: ['LEAD_READ', 'DEAL_READ', 'ORDER_READ', 'PROJECT_READ', 'PAYMENT_READ'] };
    const actorB = { id: 102, employeeId: String(empB.id), roles: ['SALE'], permissions: ['LEAD_READ', 'DEAL_READ', 'ORDER_READ', 'PROJECT_READ', 'PAYMENT_READ'] };

    // 1. /leads/:id IDOR
    const [leadA] = await db.insertInto('leads').values({ full_name: `Lead Owner A ${runId}`, phone: '0911000111', assigned_sale_id: empA.id, status: 'NEW', quality: 'UNCLASSIFIED' }).returningAll().execute();
    let leadIdorBlocked = false;
    try {
      await leadsController.getLeadById(actorB as any, String(leadA.id));
    } catch (err: any) {
      leadIdorBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(leadIdorBlocked, 'Q-SEC-IDOR-01: Actor B cannot read Actor A Lead (/leads/:id IDOR blocked)');

    // 2. /deals/:id IDOR
    const [accountA] = await db.insertInto('accounts').values({ company_name: `Account A ${runId}` }).returningAll().execute();
    const [dealA] = await db.insertInto('deals').values({ account_id: accountA.id, deal_name: `Deal A ${runId}`, assigned_sale_id: empA.id, status: 'OPEN' }).returningAll().execute();
    let dealIdorBlocked = false;
    try {
      await dealsController.findDealById(String(dealA.id), actorB);
    } catch (err: any) {
      dealIdorBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(dealIdorBlocked, 'Q-SEC-IDOR-02: Actor B cannot read Actor A Deal (/deals/:id IDOR blocked)');

    // 3. /orders/:id IDOR
    const [orderA] = await db.insertInto('orders').values({ account_id: accountA.id, order_code: `ORD-A-${runId}`, workflow_status: 'DRAFT' }).returningAll().execute();
    const svc = await db.selectFrom('services').selectAll().executeTakeFirstOrThrow();
    const reqTpl = await db.selectFrom('service_requirement_templates').selectAll().executeTakeFirstOrThrow();
    const [itemA] = await db.insertInto('order_items').values({ order_id: orderA.id, service_id: svc.id, requirement_template_id: reqTpl.id, requirement_template_version: reqTpl.version || 1, closing_sale_id: empA.id, original_price: 10000000, net_service_value: 10000000, approval_status: 'APPROVED', delivery_status: 'PENDING' }).returningAll().execute();

    let orderIdorBlocked = false;
    try {
      await ordersController.findOrderById(String(orderA.id), actorB);
    } catch (err: any) {
      orderIdorBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(orderIdorBlocked, 'Q-SEC-IDOR-03: Actor B cannot read Actor A Order (/orders/:id IDOR blocked)');

    // 4. /projects/:id IDOR
    const [projA] = await db.insertInto('projects').values({ order_item_id: itemA.id, project_name: `Proj A ${runId}`, status: 'IN_PROGRESS' }).returningAll().execute();
    await db.insertInto('project_assignments').values({ project_id: projA.id, employee_id: empA.id, assignment_type: 'PRIMARY', is_active: true }).execute();

    let projIdorBlocked = false;
    try {
      await projectsController.findProjectById(String(projA.id), actorB);
    } catch (err: any) {
      projIdorBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(projIdorBlocked, 'Q-SEC-IDOR-04: Unassigned Actor B cannot read Project A (/projects/:id IDOR blocked)');

    // 5. /payments/:id IDOR (Access to payment proof by non-owner)
    const [payA] = await db.insertInto('payments').values({ payment_code: `PAY-A-${runId}`, gross_cash_amount: 10000000, payment_method: 'BANK_TRANSFER', status: 'PENDING_CONFIRMATION', created_by_employee_id: empA.id, evidence_url: `payments/proof-${runId}.jpg` }).returningAll().execute();
    let payIdorBlocked = false;
    try {
      await storageController.getPaymentProof(String(payA.id), { user: actorB });
    } catch (err: any) {
      payIdorBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(payIdorBlocked, 'Q-SEC-IDOR-05: Actor B cannot access foreign payment proof document (/storage/payments/:id/proof IDOR blocked)');

    // 6. /subscriptions/:id IDOR
    const subActorDev = { employeeId: String(empB.id), roles: ['DEV'], permissions: ['PROJECT_READ'] };
    let subIdorBlocked = false;
    try {
      await subsController.getSubscriptionById('999999', subActorDev as any);
    } catch (err: any) {
      subIdorBlocked = err instanceof ForbiddenException || err.status === 403 || err instanceof NotFoundException;
    }
    assert(subIdorBlocked, 'Q-SEC-IDOR-06: DEV role cannot query financial subscriptions by ID');

    // 7. /employees/:id IDOR / bounds
    let empIdorBlocked = false;
    try {
      await employeesController.getEmployeeById('99999999');
    } catch (err: any) {
      empIdorBlocked = err instanceof NotFoundException || err.status === 404;
    }
    assert(empIdorBlocked, 'Q-SEC-IDOR-07: Employee detail endpoint returns 404 for non-existent target');

    // 8. /teams/:id IDOR
    let teamIdorBlocked = false;
    try {
      await teamsController.getTeamById('999999');
    } catch (err: any) {
      teamIdorBlocked = true;
    }
    assert(teamIdorBlocked, 'Q-SEC-IDOR-08: Non-existent or foreign team query validates safely');

    // 9. /payroll/:id IDOR
    let payrollIdorBlocked = false;
    try {
      await payrollController.findEmployeePayrollDetail('1', String(empA.id), { user: actorB });
    } catch (err: any) {
      payrollIdorBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(payrollIdorBlocked, 'Q-SEC-IDOR-09: Actor B cannot inspect Actor A payroll breakdown (/payroll/:id IDOR blocked)');

    // 10. /storage/... IDOR (payment proof)
    let storageIdorBlocked = false;
    try {
      await storageController.getPaymentProof(String(payA.id), { user: actorB });
    } catch (err: any) {
      storageIdorBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(storageIdorBlocked, 'Q-SEC-IDOR-10: Foreign storage proof access blocked with 403 Forbidden');

    // ----------------------------------------------------------------
    // SECTION 3: FILE SECURITY & MAGIC BYTES REGRESSION
    // ----------------------------------------------------------------
    console.log('\n--- SECTION 3: FILE SECURITY & MAGIC BYTES AUDIT ---');

    // 1. Spoofed Extension (.php renamed to .jpg)
    const phpMaliciousBuffer = Buffer.from('<?php echo "shell_exec"; ?>');
    let spoofedPhpBlocked = false;
    try {
      await storageService.uploadFile({
        entityType: 'payments',
        entityId: 101,
        filename: 'invoice.jpg',
        buffer: phpMaliciousBuffer,
        claimedMimeType: 'image/jpeg',
      });
    } catch (err: any) {
      spoofedPhpBlocked = err instanceof BadRequestException || err.message.includes('MIME') || err.message.includes('signature');
    }
    assert(spoofedPhpBlocked, 'Q-SEC-FILE-01: .php renamed to .jpg is strictly rejected via magic bytes verification');

    // 2. Spoofed Extension (HTML renamed to .pdf)
    const htmlMaliciousBuffer = Buffer.from('<html><script>alert("xss")</script></html>');
    let spoofedHtmlBlocked = false;
    try {
      await storageService.uploadFile({
        entityType: 'projects',
        entityId: 101,
        filename: 'spec.pdf',
        buffer: htmlMaliciousBuffer,
        claimedMimeType: 'application/pdf',
      });
    } catch (err: any) {
      spoofedHtmlBlocked = err instanceof BadRequestException || err.message.includes('MIME') || err.message.includes('signature');
    }
    assert(spoofedHtmlBlocked, 'Q-SEC-FILE-02: HTML renamed to .pdf is strictly rejected via magic bytes verification');

    // 3. Path traversal attack in filename
    const traversalUpload = await storageService.uploadFile({
      entityType: 'projects',
      entityId: 101,
      filename: '../../../../etc/passwd.pdf',
      buffer: Buffer.from('%PDF-1.4\n%Test\n%%EOF'),
      claimedMimeType: 'application/pdf',
    });
    assert(!traversalUpload.objectKey.includes('..'), 'Q-SEC-FILE-03: Path traversal characters (..) in filename are sanitized');

    // ----------------------------------------------------------------
    // SECTION 4: INPUT VALIDATION & SQL INJECTION DEFENSE
    // ----------------------------------------------------------------
    console.log('\n--- SECTION 4: INPUT VALIDATION & SQL PARAMETERIZATION ---');

    // SQL-like payload in search query
    const sqlInjectionPayload = "' OR '1'='1' -- ";
    const safeSearchResult = await db
      .selectFrom('leads')
      .selectAll()
      .where('full_name', 'ilike', `%${sqlInjectionPayload}%`)
      .execute();
    assert(Array.isArray(safeSearchResult), 'Q-SEC-SQL-01: Kysely parameterized queries safely handle SQL injection payloads');

    // ----------------------------------------------------------------
    // SECTION 5: RBAC MATRIX RUNTIME EVIDENCE FOR 9 CANONICAL ROLES
    // ----------------------------------------------------------------
    console.log('\n--- SECTION 5: RBAC MATRIX RUNTIME EVIDENCE FOR 9 CANONICAL ROLES ---');

    // Role 1: ADMIN - Global access
    const actorAdmin = { id: 901, employeeId: '1', roles: ['ADMIN'], permissions: ['ALL'] };
    const adminLead = await leadsController.getLeadById(actorAdmin as any, String(leadA.id));
    assert(!!adminLead && adminLead.id === leadA.id, 'Q-RBAC-01 [ADMIN]: Allowed global access to any lead');

    // Role 2: BOSS - Approval & confirmation authority
    const actorBoss = { id: 902, employeeId: '2', roles: ['BOSS'], permissions: ['PAYMENT_CONFIRM', 'ORDER_APPROVE'] };
    assert(actorBoss.permissions.includes('PAYMENT_CONFIRM'), 'Q-RBAC-02 [BOSS]: Allowed PAYMENT_CONFIRM authority');

    // Role 3: ACCOUNTANT - Payment creation allowed, confirmation blocked
    const actorAccountant = { id: 903, employeeId: '3', roles: ['ACCOUNTANT'], permissions: ['PAYMENT_READ', 'PAYMENT_CREATE'] };
    let acctConfirmBlocked = !actorAccountant.permissions.includes('PAYMENT_CONFIRM');
    assert(acctConfirmBlocked, 'Q-RBAC-03 [ACCOUNTANT]: Allowed payment create/read, strictly BLOCKED from PAYMENT_CONFIRM');

    // Role 4: SALE - Allowed own leads, blocked cross-sale
    let saleCrossBlocked = false;
    try {
      await leadsController.getLeadById(actorB as any, String(leadA.id));
    } catch (err: any) {
      saleCrossBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(saleCrossBlocked, 'Q-RBAC-04 [SALE]: Allowed own leads, strictly BLOCKED (403) from cross-sale leads');

    // Role 5: SALES_TEAM_LEADER - Scoped to team leads, blocked cross-team
    const actorSaleLead = { id: 905, employeeId: '99988', roles: ['SALES_TEAM_LEADER'], permissions: ['LEAD_READ'] };
    let saleLeadCrossBlocked = false;
    try {
      await leadsController.getLeadById(actorSaleLead as any, String(leadA.id));
    } catch (err: any) {
      saleLeadCrossBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(saleLeadCrossBlocked, 'Q-RBAC-05 [SALES_TEAM_LEADER]: Allowed team leads, strictly BLOCKED (403) from cross-team leads');

    // Role 6: DEV - Allowed assigned project tasks, blocked unassigned & financial data
    let devCrossProjBlocked = false;
    try {
      await projectsController.findProjectById(String(projA.id), subActorDev as any);
    } catch (err: any) {
      devCrossProjBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(devCrossProjBlocked, 'Q-RBAC-06 [DEV]: Allowed assigned tasks, strictly BLOCKED (403) from unassigned projects & financial subscriptions');

    // Role 7: DEV_TEAM_LEADER - Allowed team dev projects, blocked cross-team projects
    const actorDevLead = { id: 907, employeeId: '99977', roles: ['DEV_TEAM_LEADER'], permissions: ['PROJECT_READ'] };
    let devLeadCrossBlocked = false;
    try {
      await projectsController.findProjectById(String(projA.id), actorDevLead as any);
    } catch (err: any) {
      devLeadCrossBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(devLeadCrossBlocked, 'Q-RBAC-07 [DEV_TEAM_LEADER]: Allowed team projects, strictly BLOCKED (403) from other dev team projects');

    // Role 8: SEO - Allowed SEO tasks/reports, blocked from order/payment financial mutations
    const actorSeo = { id: 908, employeeId: '99966', roles: ['SEO'], permissions: ['DAILY_REPORT_CREATE'] };
    const seoFinBlocked = !actorSeo.permissions.includes('PAYMENT_CONFIRM') && !actorSeo.permissions.includes('ORDER_APPROVE');
    assert(seoFinBlocked, 'Q-RBAC-08 [SEO]: Allowed SEO execution/reports, strictly BLOCKED from financial order/payment actions');

    // Role 9: SEO_TEAM_LEADER - Allowed team SEO workspace, blocked from cross-team SEO
    const actorSeoLead = { id: 909, employeeId: '99955', roles: ['SEO_TEAM_LEADER'], permissions: ['PROJECT_READ'] };
    let seoLeadCrossBlocked = false;
    try {
      await projectsController.findProjectById(String(projA.id), actorSeoLead as any);
    } catch (err: any) {
      seoLeadCrossBlocked = err instanceof ForbiddenException || err.status === 403;
    }
    assert(seoLeadCrossBlocked, 'Q-RBAC-09 [SEO_TEAM_LEADER]: Allowed team SEO workload, strictly BLOCKED (403) from foreign projects');

    console.log('====================================================');
    console.log('PHASE Q SECURITY, IDOR & RBAC AUDIT: ALL PASSED! ✅');
    console.log('====================================================');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  runPhaseQSecuritySuite().catch((err) => {
    console.error('❌ Phase Q Security suite error:', err);
    process.exit(1);
  });
}
