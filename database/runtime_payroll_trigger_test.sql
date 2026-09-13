-- ============================================================================
-- CRM SYSTEM RUNTIME PAYROLL TRIGGER TEST SUITE (DDL V4.2 CONFORMANT)
-- Target Schema: PostgreSQL DDL Schema V4.2 (crm_order_schema.sql)
--
-- Setup Rules:
-- - All payroll / payroll_items / payroll_adjustments fixtures MUST be created when payroll_period status = 'OPEN'.
-- - Period is transitioned to 'LOCKED' AFTER fixture insertion to test lock protections.
-- - Strictly matches exact exception message branches from fn_check_payroll_locked():
--   1) 'CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD' (Tests 2, 4, 5, 6, 7, 9)
--   2) 'CANNOT TARGET A LOCKED PAYROLL PERIOD FOR PAYROLL DATA' (Tests 3, 10)
-- - Zero persistent side effects: database master seed state is 100% preserved (BEGIN...ROLLBACK).
-- ============================================================================

BEGIN;

-- ============================================================================
-- TEST 1 - OPEN PAYROLL UPDATE ALLOWED
-- Triggers on payrolls allow UPDATE when payroll_periods.status = 'OPEN'
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_id BIGINT;
    v_payroll_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-01', 'Test Payroll Employee 1', v_pos_id) RETURNING id INTO v_employee_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-OPEN1', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_id;

    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    -- UPDATE when period is OPEN -> EXPECT ALLOWED
    UPDATE payrolls SET base_salary = 12000000, net_salary_amount = 12000000 WHERE id = v_payroll_id;

    RAISE NOTICE 'PASS - open payroll update allowed';
END $$;


-- ============================================================================
-- TEST 2 - LOCKED PAYROLL UPDATE BLOCKED
-- Setup: OPEN period -> INSERT payroll -> UPDATE period to LOCKED -> UPDATE payroll
-- Expected Message: CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_id BIGINT;
    v_payroll_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-02', 'Test Payroll Employee 2', v_pos_id) RETURNING id INTO v_employee_id;

    -- 1) Create OPEN period
    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-LOCK1', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_id;

    -- 2) Create payroll fixture while OPEN
    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    -- 3) Transition period to LOCKED
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period_id;

    -- 4) Try UPDATE payroll -> EXPECT BLOCKED
    BEGIN
        UPDATE payrolls SET base_salary = 15000000 WHERE id = v_payroll_id;

        RAISE EXCEPTION 'FAIL - locked payroll update was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD%' THEN
            RAISE NOTICE 'PASS - locked payroll update blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;


-- ============================================================================
-- TEST 3 - INSERT PAYROLL ITEM INTO LOCKED PAYROLL BLOCKED
-- Setup: OPEN period -> INSERT payroll -> UPDATE period to LOCKED -> INSERT payroll_items
-- Expected Message: CANNOT TARGET A LOCKED PAYROLL PERIOD FOR PAYROLL DATA
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_id BIGINT;
    v_payroll_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-03', 'Test Payroll Employee 3', v_pos_id) RETURNING id INTO v_employee_id;

    -- 1) Create OPEN period
    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-LOCK2', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_id;

    -- 2) Create payroll fixture while OPEN
    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    -- 3) Transition period to LOCKED
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period_id;

    -- 4) Try INSERT payroll_item into locked payroll -> EXPECT BLOCKED BY NEW TARGET CHECK
    BEGIN
        INSERT INTO payroll_items (payroll_id, item_type, amount, description)
        VALUES (v_payroll_id, 'BONUS', 1000000, 'Test Bonus Item');

        RAISE EXCEPTION 'FAIL - insert payroll item into locked payroll was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT TARGET A LOCKED PAYROLL PERIOD FOR PAYROLL DATA%' THEN
            RAISE NOTICE 'PASS - insert payroll item into locked payroll blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;


-- ============================================================================
-- TEST 4 - UPDATE PAYROLL ITEM IN LOCKED PAYROLL BLOCKED
-- Setup: OPEN period -> INSERT payroll & item -> UPDATE period to LOCKED -> UPDATE item
-- Expected Message: CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_id BIGINT;
    v_payroll_id BIGINT;
    v_item_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-04', 'Test Payroll Employee 4', v_pos_id) RETURNING id INTO v_employee_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-LOCK3', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_id;

    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    INSERT INTO payroll_items (payroll_id, item_type, amount, description)
    VALUES (v_payroll_id, 'ALLOWANCE', 500000, 'Test Allowance') RETURNING id INTO v_item_id;

    -- Lock period
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period_id;

    -- Try UPDATE payroll_item -> EXPECT BLOCKED
    BEGIN
        UPDATE payroll_items SET amount = 800000 WHERE id = v_item_id;

        RAISE EXCEPTION 'FAIL - update payroll item in locked payroll was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD%' THEN
            RAISE NOTICE 'PASS - update payroll item in locked payroll blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;


-- ============================================================================
-- TEST 5 - DELETE PAYROLL ITEM FROM LOCKED PAYROLL BLOCKED
-- Setup: OPEN period -> INSERT payroll & item -> UPDATE period to LOCKED -> DELETE item
-- Expected Message: CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_id BIGINT;
    v_payroll_id BIGINT;
    v_item_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-05', 'Test Payroll Employee 5', v_pos_id) RETURNING id INTO v_employee_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-LOCK4', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_id;

    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    INSERT INTO payroll_items (payroll_id, item_type, amount, description)
    VALUES (v_payroll_id, 'ALLOWANCE', 500000, 'Test Allowance') RETURNING id INTO v_item_id;

    -- Lock period
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period_id;

    -- Try DELETE payroll_item -> EXPECT BLOCKED
    BEGIN
        DELETE FROM payroll_items WHERE id = v_item_id;

        RAISE EXCEPTION 'FAIL - delete payroll item from locked payroll was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD%' THEN
            RAISE NOTICE 'PASS - delete payroll item from locked payroll blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;


-- ============================================================================
-- TEST 6 - UPDATE ADJUSTMENT TARGETING LOCKED PAYROLL BLOCKED
-- Setup: OPEN origin & target periods -> INSERT payroll & adjustment -> UPDATE target period to LOCKED -> UPDATE adjustment
-- Expected Message: CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period1_id BIGINT;
    v_period2_id BIGINT;
    v_payroll_id BIGINT;
    v_adj_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-06', 'Test Payroll Employee 6', v_pos_id) RETURNING id INTO v_employee_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-ORIGIN', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period1_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-TARGET1', '2026-02-01', '2026-02-28', 'OPEN') RETURNING id INTO v_period2_id;

    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period2_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    INSERT INTO payroll_adjustments (target_payroll_id, origin_payroll_period_id, amount, reason, created_by_employee_id)
    VALUES (v_payroll_id, v_period1_id, 300000, 'Test Adjustment', v_employee_id) RETURNING id INTO v_adj_id;

    -- Lock target period
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period2_id;

    -- Try UPDATE adjustment -> EXPECT BLOCKED
    BEGIN
        UPDATE payroll_adjustments SET amount = 500000 WHERE id = v_adj_id;

        RAISE EXCEPTION 'FAIL - update adjustment targeting locked payroll was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD%' THEN
            RAISE NOTICE 'PASS - update adjustment targeting locked payroll blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;


-- ============================================================================
-- TEST 7 - DELETE ADJUSTMENT TARGETING LOCKED PAYROLL BLOCKED
-- Setup: OPEN origin & target periods -> INSERT payroll & adjustment -> UPDATE target period to LOCKED -> DELETE adjustment
-- Expected Message: CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period1_id BIGINT;
    v_period2_id BIGINT;
    v_payroll_id BIGINT;
    v_adj_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-07', 'Test Payroll Employee 7', v_pos_id) RETURNING id INTO v_employee_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-ORIGIN2', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period1_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-TARGET2', '2026-02-01', '2026-02-28', 'OPEN') RETURNING id INTO v_period2_id;

    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period2_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    INSERT INTO payroll_adjustments (target_payroll_id, origin_payroll_period_id, amount, reason, created_by_employee_id)
    VALUES (v_payroll_id, v_period1_id, 300000, 'Test Adjustment Delete', v_employee_id) RETURNING id INTO v_adj_id;

    -- Lock target period
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period2_id;

    -- Try DELETE adjustment -> EXPECT BLOCKED
    BEGIN
        DELETE FROM payroll_adjustments WHERE id = v_adj_id;

        RAISE EXCEPTION 'FAIL - delete adjustment targeting locked payroll was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD%' THEN
            RAISE NOTICE 'PASS - delete adjustment targeting locked payroll blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;


-- ============================================================================
-- TEST 8 - OPEN PAYROLL DELETE ALLOWED
-- Triggers on payrolls allow DELETE when payroll_periods.status = 'OPEN'
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_id BIGINT;
    v_payroll_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-08', 'Test Payroll Employee 8', v_pos_id) RETURNING id INTO v_employee_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-DEL-OPEN', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_id;

    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    -- DELETE when period is OPEN -> EXPECT ALLOWED
    DELETE FROM payrolls WHERE id = v_payroll_id;

    RAISE NOTICE 'PASS - open payroll delete allowed';
END $$;


-- ============================================================================
-- TEST 9 - MOVE PAYROLL FROM LOCKED TO OPEN BLOCKED
-- Setup: Period A = OPEN -> INSERT payroll -> Period B = OPEN -> UPDATE Period A = LOCKED -> UPDATE payroll SET period_id = B
-- Expected Message: CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD (OLD period check)
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_locked_id BIGINT;
    v_period_open_id BIGINT;
    v_payroll_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-09', 'Test Payroll Employee 9', v_pos_id) RETURNING id INTO v_employee_id;

    -- 1) Create Period A (OPEN) and Period B (OPEN)
    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-MOVE-LOCK', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_locked_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-MOVE-OPEN', '2026-02-01', '2026-02-28', 'OPEN') RETURNING id INTO v_period_open_id;

    -- 2) Create payroll fixture in Period A while OPEN
    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_locked_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    -- 3) Transition Period A to LOCKED
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period_locked_id;

    -- 4) Try move payroll_period_id from LOCKED (A) -> OPEN (B) -> EXPECT BLOCKED BY OLD PERIOD CHECK
    BEGIN
        UPDATE payrolls SET payroll_period_id = v_period_open_id WHERE id = v_payroll_id;

        RAISE EXCEPTION 'FAIL - move payroll from locked to open was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD%' THEN
            RAISE NOTICE 'PASS - move payroll from locked to open blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;


-- ============================================================================
-- TEST 10 - MOVE PAYROLL FROM OPEN TO LOCKED BLOCKED
-- Setup: Period A = OPEN -> INSERT payroll -> Period B = OPEN -> UPDATE Period B = LOCKED -> UPDATE payroll SET period_id = B
-- Expected Message: CANNOT TARGET A LOCKED PAYROLL PERIOD FOR PAYROLL DATA (NEW period check)
-- ============================================================================
DO $$
DECLARE
    v_pos_id BIGINT;
    v_employee_id BIGINT;
    v_period_open_id BIGINT;
    v_period_locked_id BIGINT;
    v_payroll_id BIGINT;
BEGIN
    SELECT id INTO v_pos_id FROM positions LIMIT 1;
    INSERT INTO employees (employee_code, full_name, position_id)
    VALUES ('EMP-TEST-PAY-10', 'Test Payroll Employee 10', v_pos_id) RETURNING id INTO v_employee_id;

    -- 1) Create Period A (OPEN) and Period B (OPEN)
    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-MOVE2-OPEN', '2026-01-01', '2026-01-31', 'OPEN') RETURNING id INTO v_period_open_id;

    INSERT INTO payroll_periods (period_key, start_date, end_date, status)
    VALUES ('2026-99-MOVE2-LOCK', '2026-02-01', '2026-02-28', 'OPEN') RETURNING id INTO v_period_locked_id;

    -- 2) Create payroll fixture in Period A while OPEN
    INSERT INTO payrolls (payroll_period_id, employee_id, base_salary, net_salary_amount)
    VALUES (v_period_open_id, v_employee_id, 10000000, 10000000) RETURNING id INTO v_payroll_id;

    -- 3) Transition Period B to LOCKED
    UPDATE payroll_periods SET status = 'LOCKED' WHERE id = v_period_locked_id;

    -- 4) Try move payroll_period_id from OPEN (A) -> LOCKED (B) -> EXPECT BLOCKED BY NEW PERIOD CHECK
    BEGIN
        UPDATE payrolls SET payroll_period_id = v_period_locked_id WHERE id = v_payroll_id;

        RAISE EXCEPTION 'FAIL - move payroll from open to locked was NOT blocked';
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%CANNOT TARGET A LOCKED PAYROLL PERIOD FOR PAYROLL DATA%' THEN
            RAISE NOTICE 'PASS - move payroll from open to locked blocked';
        ELSE
            RAISE;
        END IF;
    END;
END $$;

-- Rollback all test data so database master baseline is 100% clean
ROLLBACK;
