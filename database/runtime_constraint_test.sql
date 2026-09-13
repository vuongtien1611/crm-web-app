-- ============================================================================
-- CRM SYSTEM RUNTIME CONSTRAINT TEST SUITE (DDL V4.2 CONFORMANT)
-- Target Schema: PostgreSQL DDL Schema V4.2 (crm_order_schema.sql)
--
-- Principles:
-- - All test data manipulation runs within a single transaction block (BEGIN...ROLLBACK).
-- - PL/pgSQL exception blocks catch expected constraint violations and emit 'PASS - ...'.
-- - Zero persistent side effects: database master seed state is 100% preserved.
-- ============================================================================

BEGIN;

-- ============================================================================
-- TEST 1 - ONE ACTIVE ORDER PER ACCOUNT
-- Partial Unique Index: idx_one_active_order_per_account ON orders(account_id) WHERE workflow_status IN ('DRAFT','PENDING_APPROVAL','NEED_MORE_INFO','APPROVED','IN_PROGRESS')
-- ============================================================================
DO $$
DECLARE
    v_account_id BIGINT;
    v_contact_id BIGINT;
BEGIN
    INSERT INTO accounts (company_name) VALUES ('Test Company Active Order') RETURNING id INTO v_account_id;
    INSERT INTO contacts (account_id, full_name) VALUES (v_account_id, 'Test Contact') RETURNING id INTO v_contact_id;

    -- Active Order #1 (DRAFT)
    INSERT INTO orders (account_id, primary_contact_id, order_code, workflow_status)
    VALUES (v_account_id, v_contact_id, 'ORD-TEST-001', 'DRAFT');

    -- Try Active Order #2 (APPROVED) -> EXPECT BLOCKED
    BEGIN
        INSERT INTO orders (account_id, primary_contact_id, order_code, workflow_status)
        VALUES (v_account_id, v_contact_id, 'ORD-TEST-002', 'APPROVED');

        RAISE EXCEPTION 'FAIL - duplicate active order was NOT blocked';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS - duplicate active order blocked';
    END;
END $$;


-- ============================================================================
-- TEST 2 - ONE PROJECT PER ORDER ITEM
-- UNIQUE(order_item_id) on projects
-- ============================================================================
DO $$
DECLARE
    v_account_id BIGINT;
    v_contact_id BIGINT;
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_service_id BIGINT;
    v_template_id BIGINT;
    v_order_id BIGINT;
    v_order_item_id BIGINT;
BEGIN
    INSERT INTO accounts (company_name) VALUES ('Test Company Project') RETURNING id INTO v_account_id;
    INSERT INTO contacts (account_id, full_name) VALUES (v_account_id, 'Test Contact') RETURNING id INTO v_contact_id;

    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PRJ-01', 'Test Sale Employee', v_pos_id) RETURNING id INTO v_employee_id;

    SELECT id INTO v_service_id FROM services WHERE code = 'WEB';

    INSERT INTO service_requirement_templates (service_id, version, template_name, is_active)
    VALUES (v_service_id, 901, 'Test WEB Template Prj', TRUE) RETURNING id INTO v_template_id;

    INSERT INTO orders (account_id, primary_contact_id, order_code, workflow_status)
    VALUES (v_account_id, v_contact_id, 'ORD-TEST-003', 'APPROVED') RETURNING id INTO v_order_id;

    INSERT INTO order_items (order_id, closing_sale_id, service_id, requirement_template_id, requirement_template_version, original_price, discount_amount, net_service_value, vat_amount, approval_status, delivery_status, payment_status)
    VALUES (v_order_id, v_employee_id, v_service_id, v_template_id, 901, 10000000, 0, 10000000, 0, 'APPROVED', 'IN_PROGRESS', 'FULLY_PAID') RETURNING id INTO v_order_item_id;

    -- Project #1
    INSERT INTO projects (order_item_id, project_name, status)
    VALUES (v_order_item_id, 'Project #1', 'ASSIGNED');

    -- Try Project #2 -> EXPECT BLOCKED
    BEGIN
        INSERT INTO projects (order_item_id, project_name, status)
        VALUES (v_order_item_id, 'Project #2', 'ASSIGNED');

        RAISE EXCEPTION 'FAIL - duplicate project was NOT blocked';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS - duplicate project blocked';
    END;
END $$;


-- ============================================================================
-- TEST 3 - ONE PROJECT ACCEPTANCE
-- UNIQUE(project_id) on project_acceptances
-- ============================================================================
DO $$
DECLARE
    v_account_id BIGINT;
    v_contact_id BIGINT;
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_service_id BIGINT;
    v_template_id BIGINT;
    v_order_id BIGINT;
    v_order_item_id BIGINT;
    v_project_id BIGINT;
BEGIN
    INSERT INTO accounts (company_name) VALUES ('Test Company Project Acceptance') RETURNING id INTO v_account_id;
    INSERT INTO contacts (account_id, full_name) VALUES (v_account_id, 'Test Contact Acc') RETURNING id INTO v_contact_id;

    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-ACC-01', 'Test Dev Employee', v_pos_id) RETURNING id INTO v_employee_id;

    SELECT id INTO v_service_id FROM services WHERE code = 'WEB';

    INSERT INTO service_requirement_templates (service_id, version, template_name, is_active)
    VALUES (v_service_id, 902, 'Test WEB Template Acc', TRUE) RETURNING id INTO v_template_id;

    INSERT INTO orders (account_id, primary_contact_id, order_code, workflow_status)
    VALUES (v_account_id, v_contact_id, 'ORD-TEST-004', 'APPROVED') RETURNING id INTO v_order_id;

    INSERT INTO order_items (order_id, closing_sale_id, service_id, requirement_template_id, requirement_template_version, original_price, discount_amount, net_service_value, vat_amount, approval_status, delivery_status, payment_status)
    VALUES (v_order_id, v_employee_id, v_service_id, v_template_id, 902, 10000000, 0, 10000000, 0, 'APPROVED', 'IN_PROGRESS', 'FULLY_PAID') RETURNING id INTO v_order_item_id;

    INSERT INTO projects (order_item_id, project_name, status)
    VALUES (v_order_item_id, 'Project Acc', 'IN_PROGRESS') RETURNING id INTO v_project_id;

    -- Project Acceptance #1
    INSERT INTO project_acceptances (project_id, customer_contact_id, accepted_by_name, evidence_document, recorded_by_employee_id)
    VALUES (v_project_id, v_contact_id, 'Customer Boss', 'http://evidence.com/doc.pdf', v_employee_id);

    -- Try Project Acceptance #2 -> EXPECT BLOCKED
    BEGIN
        INSERT INTO project_acceptances (project_id, customer_contact_id, accepted_by_name, evidence_document, recorded_by_employee_id)
        VALUES (v_project_id, v_contact_id, 'Customer Boss', 'http://evidence.com/doc2.pdf', v_employee_id);

        RAISE EXCEPTION 'FAIL - duplicate project acceptance was NOT blocked';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS - duplicate project acceptance blocked';
    END;
END $$;


-- ============================================================================
-- TEST 4 - ONE SERVICE PERIOD ACCEPTANCE
-- UNIQUE(service_period_id) on service_period_acceptances
-- ============================================================================
DO $$
DECLARE
    v_account_id BIGINT;
    v_contact_id BIGINT;
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_service_id BIGINT;
    v_template_id BIGINT;
    v_order_id BIGINT;
    v_order_item_id BIGINT;
    v_subscription_id BIGINT;
    v_period_id BIGINT;
BEGIN
    INSERT INTO accounts (company_name) VALUES ('Test Company Period Acc') RETURNING id INTO v_account_id;
    INSERT INTO contacts (account_id, full_name) VALUES (v_account_id, 'Test Contact Period') RETURNING id INTO v_contact_id;

    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-SEO-01', 'Test SEO Employee', v_pos_id) RETURNING id INTO v_employee_id;

    SELECT id INTO v_service_id FROM services WHERE code = 'SEO';

    INSERT INTO service_requirement_templates (service_id, version, template_name, is_active)
    VALUES (v_service_id, 903, 'Test SEO Template Acc', TRUE) RETURNING id INTO v_template_id;

    INSERT INTO orders (account_id, primary_contact_id, order_code, workflow_status)
    VALUES (v_account_id, v_contact_id, 'ORD-TEST-005', 'APPROVED') RETURNING id INTO v_order_id;

    INSERT INTO order_items (order_id, closing_sale_id, service_id, requirement_template_id, requirement_template_version, original_price, discount_amount, net_service_value, vat_amount, approval_status, delivery_status, payment_status)
    VALUES (v_order_id, v_employee_id, v_service_id, v_template_id, 903, 10000000, 0, 10000000, 0, 'APPROVED', 'IN_PROGRESS', 'FULLY_PAID') RETURNING id INTO v_order_item_id;

    INSERT INTO subscriptions (order_item_id, service_id, billing_interval, interval_count, start_date, auto_renew, status)
    VALUES (v_order_item_id, v_service_id, 'MONTH', 1, CURRENT_DATE, TRUE, 'ACTIVE') RETURNING id INTO v_subscription_id;

    INSERT INTO service_periods (subscription_id, period_index, period_net_value, vat_rate, vat_amount, gross_payable, start_date, end_date, execution_status, payment_status)
    VALUES (v_subscription_id, 1, 10000000, 0, 0, 10000000, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'IN_PROGRESS', 'FULLY_PAID') RETURNING id INTO v_period_id;

    -- Service Period Acceptance #1
    INSERT INTO service_period_acceptances (service_period_id, customer_contact_id, accepted_by_name, evidence_document, recorded_by_employee_id)
    VALUES (v_period_id, v_contact_id, 'Customer Signer', 'http://evidence.com/period_doc.pdf', v_employee_id);

    -- Try Service Period Acceptance #2 -> EXPECT BLOCKED
    BEGIN
        INSERT INTO service_period_acceptances (service_period_id, customer_contact_id, accepted_by_name, evidence_document, recorded_by_employee_id)
        VALUES (v_period_id, v_contact_id, 'Customer Signer', 'http://evidence.com/period_doc2.pdf', v_employee_id);

        RAISE EXCEPTION 'FAIL - duplicate service period acceptance was NOT blocked';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS - duplicate service period acceptance blocked';
    END;
END $$;


-- ============================================================================
-- TEST 5 - LEAD NOT_POTENTIAL WITHOUT REASON
-- CHECK (quality != 'NOT_POTENTIAL' OR not_potential_reason IS NOT NULL)
-- ============================================================================
DO $$
BEGIN
    BEGIN
        INSERT INTO leads (full_name, phone, quality, not_potential_reason)
        VALUES ('Test Lead 1', '0900000001', 'NOT_POTENTIAL', NULL);

        RAISE EXCEPTION 'FAIL - NOT_POTENTIAL lead without reason was NOT blocked';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS - NOT_POTENTIAL lead without reason blocked';
    END;
END $$;


-- ============================================================================
-- TEST 6 - LEAD FAILED WITHOUT FAILED_REASON
-- CHECK (status != 'FAILED' OR failed_reason IS NOT NULL)
-- ============================================================================
DO $$
BEGIN
    BEGIN
        INSERT INTO leads (full_name, phone, status, failed_reason)
        VALUES ('Test Lead 2', '0900000002', 'FAILED', NULL);

        RAISE EXCEPTION 'FAIL - FAILED lead without failed_reason was NOT blocked';
    EXCEPTION WHEN check_violation THEN
        RAISE NOTICE 'PASS - FAILED lead without reason blocked';
    END;
END $$;


-- ============================================================================
-- TEST 7 - OVERLAPPING TEAM MEMBERSHIP
-- Exclusion Constraint: no_overlapping_team_membership ON team_memberships
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_team1_id BIGINT;
    v_team2_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-MEM-01', 'Member Overlap Test', v_pos_id) RETURNING id INTO v_employee_id;

    INSERT INTO teams (code, name, description) VALUES ('TEST_ALPHA', 'Team Alpha Test', 'Desc') RETURNING id INTO v_team1_id;
    INSERT INTO teams (code, name, description) VALUES ('TEST_BETA', 'Team Beta Test', 'Desc') RETURNING id INTO v_team2_id;

    -- Membership Team A
    INSERT INTO team_memberships (team_id, employee_id, is_leader, effective_range)
    VALUES (v_team1_id, v_employee_id, FALSE, tstzrange('2026-01-01 00:00:00+00', '2026-12-31 23:59:59+00', '[)'));

    -- Try overlapping membership Team B -> EXPECT BLOCKED
    BEGIN
        INSERT INTO team_memberships (team_id, employee_id, is_leader, effective_range)
        VALUES (v_team2_id, v_employee_id, FALSE, tstzrange('2026-06-01 00:00:00+00', '2027-06-01 00:00:00+00', '[)'));

        RAISE EXCEPTION 'FAIL - overlapping team membership was NOT blocked';
    EXCEPTION WHEN exclusion_violation THEN
        RAISE NOTICE 'PASS - overlapping team membership blocked';
    END;
END $$;


-- ============================================================================
-- TEST 8 - TWO OVERLAPPING TEAM LEADERS
-- Exclusion Constraint: no_overlapping_team_leader ON team_memberships WHERE (is_leader = TRUE)
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee1_id BIGINT;
    v_employee2_id BIGINT;
    v_team_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-LEAD-01', 'Leader One Test', v_pos_id) RETURNING id INTO v_employee1_id;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-LEAD-02', 'Leader Two Test', v_pos_id) RETURNING id INTO v_employee2_id;

    INSERT INTO teams (code, name, description) VALUES ('TEST_LEADERS', 'Team Leaders Test', 'Desc') RETURNING id INTO v_team_id;

    -- Leader A
    INSERT INTO team_memberships (team_id, employee_id, is_leader, effective_range)
    VALUES (v_team_id, v_employee1_id, TRUE, tstzrange('2026-01-01 00:00:00+00', '2026-12-31 23:59:59+00', '[)'));

    -- Try Leader B same team overlapping time -> EXPECT BLOCKED
    BEGIN
        INSERT INTO team_memberships (team_id, employee_id, is_leader, effective_range)
        VALUES (v_team_id, v_employee2_id, TRUE, tstzrange('2026-06-01 00:00:00+00', '2027-06-01 00:00:00+00', '[)'));

        RAISE EXCEPTION 'FAIL - two overlapping team leaders was NOT blocked';
    EXCEPTION WHEN exclusion_violation THEN
        RAISE NOTICE 'PASS - two overlapping team leaders blocked';
    END;
END $$;


-- ============================================================================
-- TEST 9 - KPI EVENT IDEMPOTENCY
-- UNIQUE(employee_id, policy_id, source_type, source_id, metric_type) on kpi_events
-- ============================================================================
DO $$
DECLARE
    v_employee_id BIGINT;
    v_policy_id BIGINT;
BEGIN
    SELECT id INTO v_employee_id FROM employees LIMIT 1;
    SELECT id INTO v_policy_id FROM kpi_policies LIMIT 1;

    -- KPI Event #1
    INSERT INTO kpi_events (employee_id, policy_id, source_type, source_id, metric_type, metric_value, target_kpi_period)
    VALUES (v_employee_id, v_policy_id, 'PAYMENT_ALLOCATION', 99991, 'CASH_REVENUE', 150000000, '2026-09');

    -- Try duplicate KPI Event -> EXPECT BLOCKED
    BEGIN
        INSERT INTO kpi_events (employee_id, policy_id, source_type, source_id, metric_type, metric_value, target_kpi_period)
        VALUES (v_employee_id, v_policy_id, 'PAYMENT_ALLOCATION', 99991, 'CASH_REVENUE', 150000000, '2026-09');

        RAISE EXCEPTION 'FAIL - duplicate KPI event was NOT blocked';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS - duplicate KPI event blocked';
    END;
END $$;


-- ============================================================================
-- TEST 10 - NORMAL COMMISSION IDEMPOTENCY
-- Partial Unique Index: idx_comm_idempotent_order_item ON commissions(order_item_id, beneficiary_employee_id, commission_type) WHERE order_item_id IS NOT NULL
-- ============================================================================
DO $$
DECLARE
    v_account_id BIGINT;
    v_contact_id BIGINT;
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_service_id BIGINT;
    v_template_id BIGINT;
    v_order_id BIGINT;
    v_order_item_id BIGINT;
    v_policy_id BIGINT;
BEGIN
    INSERT INTO accounts (company_name) VALUES ('Test Comm Account') RETURNING id INTO v_account_id;
    INSERT INTO contacts (account_id, full_name) VALUES (v_account_id, 'Test Contact') RETURNING id INTO v_contact_id;

    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-COMM-01', 'Test Comm Employee', v_pos_id) RETURNING id INTO v_employee_id;

    SELECT id INTO v_service_id FROM services WHERE code = 'WEB';

    INSERT INTO service_requirement_templates (service_id, version, template_name, is_active)
    VALUES (v_service_id, 904, 'Test WEB Comm', TRUE) RETURNING id INTO v_template_id;

    INSERT INTO orders (account_id, primary_contact_id, order_code, workflow_status)
    VALUES (v_account_id, v_contact_id, 'ORD-TEST-006', 'APPROVED') RETURNING id INTO v_order_id;

    INSERT INTO order_items (order_id, closing_sale_id, service_id, requirement_template_id, requirement_template_version, original_price, discount_amount, net_service_value, vat_amount, approval_status, delivery_status, payment_status)
    VALUES (v_order_id, v_employee_id, v_service_id, v_template_id, 904, 10000000, 0, 10000000, 0, 'APPROVED', 'IN_PROGRESS', 'FULLY_PAID') RETURNING id INTO v_order_item_id;

    SELECT id INTO v_policy_id FROM commission_policies WHERE policy_type = 'SALE' LIMIT 1;

    -- Normal Commission #1
    INSERT INTO commissions (policy_id, order_item_id, service_period_id, beneficiary_employee_id, commission_type, rate_snapshot, commission_base, calculated_amount, status)
    VALUES (v_policy_id, v_order_item_id, NULL, v_employee_id, 'SALE', 0.0600, 10000000, 600000, 'UNEARNED');

    -- Try duplicate Normal Commission -> EXPECT BLOCKED
    BEGIN
        INSERT INTO commissions (policy_id, order_item_id, service_period_id, beneficiary_employee_id, commission_type, rate_snapshot, commission_base, calculated_amount, status)
        VALUES (v_policy_id, v_order_item_id, NULL, v_employee_id, 'SALE', 0.0600, 10000000, 600000, 'UNEARNED');

        RAISE EXCEPTION 'FAIL - duplicate normal commission was NOT blocked';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS - duplicate normal commission blocked';
    END;
END $$;


-- ============================================================================
-- TEST 11 - RECURRING COMMISSION IDEMPOTENCY
-- Partial Unique Index: idx_comm_idempotent_period ON commissions(service_period_id, beneficiary_employee_id, commission_type) WHERE service_period_id IS NOT NULL
-- ============================================================================
DO $$
DECLARE
    v_account_id BIGINT;
    v_contact_id BIGINT;
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_service_id BIGINT;
    v_template_id BIGINT;
    v_order_id BIGINT;
    v_order_item_id BIGINT;
    v_subscription_id BIGINT;
    v_period_id BIGINT;
    v_policy_id BIGINT;
BEGIN
    INSERT INTO accounts (company_name) VALUES ('Test Recur Comm Account') RETURNING id INTO v_account_id;
    INSERT INTO contacts (account_id, full_name) VALUES (v_account_id, 'Test Contact') RETURNING id INTO v_contact_id;

    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-RECUR-01', 'Test Recur Employee', v_pos_id) RETURNING id INTO v_employee_id;

    SELECT id INTO v_service_id FROM services WHERE code = 'SEO';

    INSERT INTO service_requirement_templates (service_id, version, template_name, is_active)
    VALUES (v_service_id, 905, 'Test SEO Recur Comm', TRUE) RETURNING id INTO v_template_id;

    INSERT INTO orders (account_id, primary_contact_id, order_code, workflow_status)
    VALUES (v_account_id, v_contact_id, 'ORD-TEST-007', 'APPROVED') RETURNING id INTO v_order_id;

    INSERT INTO order_items (order_id, closing_sale_id, service_id, requirement_template_id, requirement_template_version, original_price, discount_amount, net_service_value, vat_amount, approval_status, delivery_status, payment_status)
    VALUES (v_order_id, v_employee_id, v_service_id, v_template_id, 905, 10000000, 0, 10000000, 0, 'APPROVED', 'IN_PROGRESS', 'FULLY_PAID') RETURNING id INTO v_order_item_id;

    INSERT INTO subscriptions (order_item_id, service_id, billing_interval, interval_count, start_date, auto_renew, status)
    VALUES (v_order_item_id, v_service_id, 'MONTH', 1, CURRENT_DATE, TRUE, 'ACTIVE') RETURNING id INTO v_subscription_id;

    INSERT INTO service_periods (subscription_id, period_index, period_net_value, vat_rate, vat_amount, gross_payable, start_date, end_date, execution_status, payment_status)
    VALUES (v_subscription_id, 1, 10000000, 0, 0, 10000000, CURRENT_DATE, CURRENT_DATE + INTERVAL '30 days', 'IN_PROGRESS', 'FULLY_PAID') RETURNING id INTO v_period_id;

    SELECT id INTO v_policy_id FROM commission_policies WHERE policy_type = 'SALE' LIMIT 1;

    -- Recurring Commission #1
    INSERT INTO commissions (policy_id, order_item_id, service_period_id, beneficiary_employee_id, commission_type, rate_snapshot, commission_base, calculated_amount, status)
    VALUES (v_policy_id, NULL, v_period_id, v_employee_id, 'SALE', 0.0600, 10000000, 600000, 'UNEARNED');

    -- Try duplicate Recurring Commission -> EXPECT BLOCKED
    BEGIN
        INSERT INTO commissions (policy_id, order_item_id, service_period_id, beneficiary_employee_id, commission_type, rate_snapshot, commission_base, calculated_amount, status)
        VALUES (v_policy_id, NULL, v_period_id, v_employee_id, 'SALE', 0.0600, 10000000, 600000, 'UNEARNED');

        RAISE EXCEPTION 'FAIL - duplicate recurring commission was NOT blocked';
    EXCEPTION WHEN unique_violation THEN
        RAISE NOTICE 'PASS - duplicate recurring commission blocked';
    END;
END $$;

-- Rollback all test data so database master baseline is 100% clean
ROLLBACK;
