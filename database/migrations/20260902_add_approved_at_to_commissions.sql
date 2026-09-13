-- ==================================================
-- ADDITIVE MIGRATION: Add approved_at to commissions
-- Created: 2026-09-02
-- Purpose: Captures exact Boss approval/adjustment timestamp for deterministic Payroll qualification
-- ==================================================

ALTER TABLE commissions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
