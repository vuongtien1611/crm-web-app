-- Migration: Create tables for Boss Employee Accounts Management & Security PIN
-- 1. Add last_login_at to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- 2. Create boss_security_config table for 6-digit PIN hash (Argon2id)
CREATE TABLE IF NOT EXISTS boss_security_config (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    boss_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    pin_hash VARCHAR(255) NOT NULL,
    failed_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_boss_user_security UNIQUE (boss_user_id)
);

-- 3. Create password_reset_requests table
CREATE TABLE IF NOT EXISTS password_reset_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'RESOLVED', 'REJECTED')),
    resolved_at TIMESTAMPTZ,
    resolved_by_employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_req_emp_status ON password_reset_requests(employee_id, status);
CREATE INDEX IF NOT EXISTS idx_password_reset_req_status ON password_reset_requests(status);
