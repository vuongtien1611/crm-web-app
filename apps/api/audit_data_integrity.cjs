const { Client } = require('pg');

async function run() {
  const client = new Client('postgresql://postgres:postgres_secret_dev@localhost:5432/crm_db');
  await client.connect();

  console.log('--- RUNNING DATABASE INTEGRITY AUDIT ---');

  const results = {};

  // 1. Duplicate active memberships in team_memberships
  const q1 = await client.query(`
    SELECT employee_id, count(*) as count
    FROM team_memberships
    WHERE upper_inf(effective_range) = true OR upper(effective_range) IS NULL
    GROUP BY employee_id
    HAVING count(*) > 1;
  `);
  results.duplicateActiveTeamMemberships = q1.rows;

  // 2. Dangling users without employee or employees without user
  const q2 = await client.query(`
    SELECT u.id, u.username, u.email
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.id
    WHERE e.id IS NULL;
  `);
  results.danglingUsersWithoutEmployee = q2.rows;

  const q3 = await client.query(`
    SELECT count(*) as count
    FROM employees e
    WHERE e.user_id IS NULL;
  `);
  results.employeesWithoutUserAccount = Number(q3.rows[0].count);

  // 3. Project assignments > max PRIMARY
  const q4 = await client.query(`
    SELECT project_id, count(*) as primary_count
    FROM project_assignments
    WHERE assignment_type = 'PRIMARY' AND is_active = true
    GROUP BY project_id
    HAVING count(*) > 1;
  `);
  results.projectsWithMultiplePrimaryAssignees = q4.rows;

  // 4. Payment allocation > payment amount
  const q5 = await client.query(`
    SELECT p.id, p.payment_code, p.gross_cash_amount, coalesce(sum(pa.gross_allocated_amount), 0) as total_allocated
    FROM payments p
    LEFT JOIN payment_allocations pa ON pa.payment_id = p.id
    GROUP BY p.id, p.payment_code, p.gross_cash_amount
    HAVING coalesce(sum(pa.gross_allocated_amount), 0) > p.gross_cash_amount;
  `);
  results.overAllocatedPayments = q5.rows;

  // 5. Installments remaining < 0 or paid > due
  const q6 = await client.query(`
    SELECT pi.id, pi.installment_number, pi.gross_amount_due, coalesce(sum(pa.gross_allocated_amount), 0) as allocated_paid
    FROM payment_installments pi
    LEFT JOIN payment_allocations pa ON pa.installment_id = pi.id
    GROUP BY pi.id, pi.installment_number, pi.gross_amount_due
    HAVING coalesce(sum(pa.gross_allocated_amount), 0) > pi.gross_amount_due;
  `);
  results.overpaidInstallments = q6.rows;

  // 6. Duplicate commissions for same order_item
  const q7 = await client.query(`
    SELECT order_item_id, beneficiary_employee_id, commission_type, count(*) as count
    FROM commissions
    GROUP BY order_item_id, beneficiary_employee_id, commission_type
    HAVING count(*) > 1;
  `);
  results.duplicateCommissions = q7.rows;

  // 7. Duplicate customer acceptances for same project
  const q8 = await client.query(`
    SELECT project_id, count(*) as count
    FROM project_acceptances
    GROUP BY project_id
    HAVING count(*) > 1;
  `);
  results.duplicateAcceptancesPerProject = q8.rows;

  // 8. Orphan FK checks
  const q9 = await client.query(`
    SELECT count(*) as count FROM order_items oi LEFT JOIN orders o ON o.id = oi.order_id WHERE o.id IS NULL;
  `);
  results.orphanOrderItems = Number(q9.rows[0].count);

  const q10 = await client.query(`
    SELECT count(*) as count FROM projects p LEFT JOIN order_items oi ON oi.id = p.order_item_id WHERE oi.id IS NULL;
  `);
  results.orphanProjects = Number(q10.rows[0].count);

  const q11 = await client.query(`
    SELECT count(*) as count FROM project_tasks pt LEFT JOIN project_milestones pm ON pm.id = pt.milestone_id WHERE pm.id IS NULL;
  `);
  results.orphanProjectTasks = Number(q11.rows[0].count);

  const q12 = await client.query(`
    SELECT count(*) as count FROM payment_allocations pa LEFT JOIN payments p ON p.id = pa.payment_id WHERE p.id IS NULL;
  `);
  results.orphanPaymentAllocations = Number(q12.rows[0].count);

  // 9. Status distributions
  const q14 = await client.query(`SELECT DISTINCT workflow_status FROM orders;`);
  results.orderWorkflowStatuses = q14.rows.map(r => r.workflow_status);

  const q14b = await client.query(`SELECT DISTINCT approval_status, delivery_status, payment_status FROM order_items;`);
  results.orderItemStatuses = q14b.rows;

  const q15 = await client.query(`SELECT DISTINCT status FROM projects;`);
  results.projectStatuses = q15.rows.map(r => r.status);

  const q16 = await client.query(`SELECT DISTINCT status FROM payments;`);
  results.paymentStatuses = q16.rows.map(r => r.status);

  const q17 = await client.query(`SELECT DISTINCT status FROM commissions;`);
  results.commissionStatuses = q17.rows.map(r => r.status);

  // 10. Check locked payroll periods if any modified payrolls exist
  const q18 = await client.query(`
    SELECT pp.id, pp.period_key, pp.status, p.id as payroll_id, p.updated_at, pp.updated_at as period_updated_at
    FROM payroll_periods pp
    INNER JOIN payrolls p ON p.payroll_period_id = pp.id
    WHERE pp.status = 'LOCKED' AND p.updated_at > pp.updated_at;
  `);
  results.payrollsModifiedAfterLock = q18.rows;

  console.log('--- INTEGRITY RESULTS START ---');
  console.log(JSON.stringify(results, null, 2));
  console.log('--- INTEGRITY RESULTS END ---');

  await client.end();
}

run().catch(console.error);
