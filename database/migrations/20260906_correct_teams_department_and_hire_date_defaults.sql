-- Corrective Migration: Drop default on teams.department and employees.hire_date, clear unverified historical hire_date
BEGIN;

-- 1. Drop DEFAULT on teams.department
ALTER TABLE teams ALTER COLUMN department DROP DEFAULT;

-- 2. Add CHECK constraint on teams.department for canonical allowed values
ALTER TABLE teams DROP CONSTRAINT IF EXISTS chk_teams_department;
ALTER TABLE teams ADD CONSTRAINT chk_teams_department 
    CHECK (department IS NULL OR department IN ('SALES', 'DEV', 'SEO', 'OPERATION'));

-- 3. Drop DEFAULT on employees.hire_date
ALTER TABLE employees ALTER COLUMN hire_date DROP DEFAULT;

-- 4. Reset unverified historical employees' hire_date to NULL
-- (historical records created before migration should not be given an arbitrary backfill date)
UPDATE employees SET hire_date = NULL;

COMMIT;
