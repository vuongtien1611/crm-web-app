-- ==================================================
-- ADDITIVE MIGRATION: Add DB Trigger to Protect LOCKED Payroll Periods
-- Created: 2026-09-02
-- Purpose: Enforces database-level immutability for payroll_periods when status = 'LOCKED'.
-- Prevents UPDATE (status reversal, metadata/date changes) and DELETE on locked period rows.
-- ==================================================

CREATE OR REPLACE FUNCTION fn_check_payroll_period_locked()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.status = 'LOCKED' THEN
            RAISE EXCEPTION 'CANNOT MODIFY OR DELETE LOCKED PAYROLL PERIOD (Period ID: %).', OLD.id;
        END IF;
    END IF;
    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_locked_payroll_periods ON payroll_periods;

CREATE TRIGGER trg_protect_locked_payroll_periods
BEFORE UPDATE OR DELETE ON payroll_periods
FOR EACH ROW EXECUTE FUNCTION fn_check_payroll_period_locked();
