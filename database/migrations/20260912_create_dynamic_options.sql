-- Migration: 20260912_create_dynamic_options.sql
-- Description: Dynamic options storage for auto-complete and suggested text inputs

CREATE TABLE IF NOT EXISTS dynamic_options (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    field_key VARCHAR(100) NOT NULL,
    value VARCHAR(255) NOT NULL,
    normalized_value VARCHAR(255) NOT NULL,
    usage_count INT NOT NULL DEFAULT 1,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_employee_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_dynamic_options_field_norm UNIQUE (field_key, normalized_value)
);

CREATE INDEX IF NOT EXISTS idx_dynamic_options_lookup ON dynamic_options (field_key, last_used_at DESC, usage_count DESC);
