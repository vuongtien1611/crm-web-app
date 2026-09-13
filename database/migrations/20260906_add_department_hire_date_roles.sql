-- Migration: Add department to teams, hire_date to employees, must_change_password to users, and team leader positions/roles
BEGIN;

-- 1. Add department column to teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS department VARCHAR(50) DEFAULT 'SALES';
UPDATE teams SET department = 'SALES' WHERE department IS NULL;

-- 2. Add hire_date column to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hire_date DATE DEFAULT CURRENT_DATE;

-- 3. Add must_change_password column to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

-- 4. Add positions for DEV_TEAM_LEADER and SEO_TEAM_LEADER
INSERT INTO positions (code, name) VALUES 
    ('DEV_TEAM_LEADER', 'Trưởng Nhóm Kỹ Thuật / Lập Trình'),
    ('SEO_TEAM_LEADER', 'Trưởng Nhóm SEO / Content')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- 5. Add roles for DEV_TEAM_LEADER and SEO_TEAM_LEADER
INSERT INTO roles (code, name) VALUES 
    ('DEV_TEAM_LEADER', 'Dev Team Leader'),
    ('SEO_TEAM_LEADER', 'SEO Team Leader')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name;

-- 6. Grant permissions to DEV_TEAM_LEADER
-- Inherits DEV permissions + project assignment and team management permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'DEV_TEAM_LEADER'
  AND p.code IN (
      'AUTH_LOGIN',
      'AUTH_RESET_PASSWORD',
      'CUSTOMER_CONTACT_READ',
      'KPI_READ',
      'PROJECT_READ',
      'PROJECT_TASK_UPDATE',
      'PROJECT_UPDATE_STATUS',
      'REPORT_PROJECT_READ',
      'PROJECT_ASSIGN',
      'PROJECT_UNASSIGN',
      'PROJECT_CREATE',
      'TEAM_READ'
  )
ON CONFLICT DO NOTHING;

-- 7. Grant permissions to SEO_TEAM_LEADER
-- Inherits SEO permissions + article review/publishing and team management permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.code = 'SEO_TEAM_LEADER'
  AND p.code IN (
      'AUTH_LOGIN',
      'AUTH_RESET_PASSWORD',
      'KPI_READ',
      'PROJECT_READ',
      'REPORT_PROJECT_READ',
      'SEO_ARTICLE_CREATE',
      'SEO_ARTICLE_READ',
      'SEO_ARTICLE_SUBMIT',
      'SEO_ARTICLE_UPDATE',
      'SEO_ARTICLE_REVIEW',
      'SEO_ARTICLE_PUBLISH',
      'TEAM_READ'
  )
ON CONFLICT DO NOTHING;

COMMIT;
