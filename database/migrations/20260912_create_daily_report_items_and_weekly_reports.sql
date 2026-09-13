-- Migration: 20260912_create_daily_report_items_and_weekly_reports.sql
-- Description: Creates daily_report_items and weekly_reports tables with canonical rules

-- 1. DAILY REPORT ITEMS
CREATE TABLE IF NOT EXISTS daily_report_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    daily_report_id BIGINT NOT NULL REFERENCES daily_reports(id) ON DELETE CASCADE,
    project_id BIGINT REFERENCES projects(id) ON DELETE SET NULL,
    work_title VARCHAR(255) NOT NULL,
    work_detail TEXT NOT NULL,
    link VARCHAR(1000),
    status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS' 
        CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE')),
    progress_percent INT NOT NULL DEFAULT 0 
        CHECK (progress_percent >= 0 AND progress_percent <= 100),
    note TEXT,
    sort_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_report_items_report_id ON daily_report_items(daily_report_id);
CREATE INDEX IF NOT EXISTS idx_daily_report_items_project_id ON daily_report_items(project_id) WHERE project_id IS NOT NULL;

-- 2. WEEKLY REPORTS
CREATE TABLE IF NOT EXISTS weekly_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE RESTRICT,
    created_by_employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
    week_start DATE NOT NULL,
    week_end DATE NOT NULL,
    summary_work_done TEXT NOT NULL,
    summary_blockers TEXT,
    summary_next_week TEXT,
    leader_note TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' 
        CHECK (status IN ('DRAFT', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_weekly_reports_team_week UNIQUE (team_id, week_start, week_end),
    CONSTRAINT chk_weekly_reports_date_range CHECK (week_end >= week_start)
);

CREATE INDEX IF NOT EXISTS idx_weekly_reports_team_id ON weekly_reports(team_id);
CREATE INDEX IF NOT EXISTS idx_weekly_reports_created_by ON weekly_reports(created_by_employee_id);
