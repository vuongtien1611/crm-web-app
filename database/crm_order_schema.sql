-- ============================================================================
-- CRM ORDER, SERVICE, AND COMMISSION MANAGEMENT SYSTEM
-- PostgreSQL DDL Schema V4.2 (Patched & Audited Final Schema)
-- 
-- System Overview:
-- - Covers 73 Core Tables across 13 Modules
-- - Single Source of Truth for Financials, Commissions, Payroll, and Projects
-- - Strict Concurrency & Temporal Exclusion Protection (btree_gist)
-- - Idempotency Constraints & Multi-Table Dual-State Payroll Lock Triggers
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- MODULE 1: IDENTITY, HR & TEAM MANAGEMENT (11 TABLES)
-- ============================================================================

-- 1. USERS
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED', 'SUSPENDED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. POSITIONS
CREATE TABLE positions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. EMPLOYEES
-- NOTE: user_id is NULLABLE and UNIQUE (User 0..1 <-> Employee 0..1)
CREATE TABLE employees (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT UNIQUE REFERENCES users(id) ON DELETE SET NULL,
    employee_code VARCHAR(50) NOT NULL UNIQUE,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    position_id BIGINT NOT NULL REFERENCES positions(id),
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('PROBATION', 'ACTIVE', 'RESIGNED', 'TERMINATED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. EMPLOYEE POSITION HISTORY
-- EXCLUSION CONSTRAINT: Prevents overlapping position history for the same employee
CREATE TABLE employee_position_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    position_id BIGINT NOT NULL REFERENCES positions(id),
    effective_range TSTZRANGE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_overlapping_position_history EXCLUDE USING gist (
        employee_id WITH =,
        effective_range WITH &&
    )
);

-- 5. SALARY HISTORY
-- EXCLUSION CONSTRAINT: Prevents overlapping base salary history for the same employee
CREATE TABLE salary_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    base_salary NUMERIC(15,2) NOT NULL CHECK (base_salary >= 0),
    effective_range TSTZRANGE NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_overlapping_salary_history EXCLUDE USING gist (
        employee_id WITH =,
        effective_range WITH &&
    )
);

-- 6. ROLES
CREATE TABLE roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. PERMISSIONS
CREATE TABLE permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. USER ROLES
CREATE TABLE user_roles (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, role_id)
);

-- 9. ROLE PERMISSIONS
CREATE TABLE role_permissions (
    role_id BIGINT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (role_id, permission_id)
);

-- 10. TEAMS
CREATE TABLE teams (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 11. TEAM MEMBERSHIPS
-- EXCLUSION CONSTRAINTS: 
-- 1) Employee cannot belong to multiple teams concurrently
-- 2) A team can have AT MOST ONE Leader at any given timestamp
CREATE TABLE team_memberships (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    team_id BIGINT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    is_leader BOOLEAN NOT NULL DEFAULT FALSE,
    effective_range TSTZRANGE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_overlapping_team_membership EXCLUDE USING gist (
        employee_id WITH =,
        effective_range WITH &&
    ),
    CONSTRAINT no_overlapping_team_leader EXCLUDE USING gist (
        team_id WITH =,
        effective_range WITH &&
    ) WHERE (is_leader = TRUE)
);


-- ============================================================================
-- MODULE 2: ACQUISITION, CONTENT & SALES ACTIVITIES (8 TABLES)
-- ============================================================================

-- 12. PLATFORMS
CREATE TABLE platforms (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 13. CHANNELS
CREATE TABLE channels (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 14. CAMPAIGNS
CREATE TABLE campaigns (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_id BIGINT REFERENCES platforms(id),
    channel_id BIGINT REFERENCES channels(id),
    campaign_name VARCHAR(150) NOT NULL,
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    budget NUMERIC(15,2) DEFAULT 0,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 15. SALE MARKET ASSIGNMENTS
CREATE TABLE sale_market_assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    platform_id BIGINT REFERENCES platforms(id),
    channel_id BIGINT REFERENCES channels(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 16. SALES CONTENTS
CREATE TABLE sales_contents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    creator_employee_id BIGINT NOT NULL REFERENCES employees(id),
    platform_id BIGINT REFERENCES platforms(id),
    channel_id BIGINT REFERENCES channels(id),
    campaign_id BIGINT REFERENCES campaigns(id),
    content_title VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    published_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 17. LEADS
CREATE TABLE leads (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    platform_id BIGINT REFERENCES platforms(id),
    channel_id BIGINT REFERENCES channels(id),
    campaign_id BIGINT REFERENCES campaigns(id),
    sales_content_id BIGINT REFERENCES sales_contents(id),
    creator_employee_id BIGINT REFERENCES employees(id),
    assigned_sale_id BIGINT REFERENCES employees(id),
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20),
    email VARCHAR(255),
    quality VARCHAR(50) NOT NULL DEFAULT 'UNCLASSIFIED' CHECK (quality IN ('UNCLASSIFIED', 'POTENTIAL', 'NOT_POTENTIAL')),
    not_potential_reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'CALLED', 'CONSULTED', 'FOLLOWING', 'CONVERTED', 'FAILED')),
    failed_reason TEXT,
    landing_page VARCHAR(500),
    external_id VARCHAR(100),
    utm_source VARCHAR(100),
    utm_medium VARCHAR(100),
    utm_campaign VARCHAR(100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_not_potential_reason CHECK (quality <> 'NOT_POTENTIAL' OR not_potential_reason IS NOT NULL),
    CONSTRAINT chk_failed_reason CHECK (status <> 'FAILED' OR failed_reason IS NOT NULL)
);

-- 18. LEAD ASSIGNMENT HISTORY
CREATE TABLE lead_assignment_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lead_id BIGINT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    from_sale_id BIGINT REFERENCES employees(id),
    to_sale_id BIGINT NOT NULL REFERENCES employees(id),
    assigned_by_employee_id BIGINT REFERENCES employees(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reason TEXT
);

-- 19. SALES ACTIVITIES
CREATE TABLE sales_activities (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lead_id BIGINT REFERENCES leads(id) ON DELETE CASCADE,
    deal_id BIGINT, -- Refers to deals(id), FK added after deals table creation
    account_id BIGINT, -- Refers to accounts(id), FK added after accounts table creation
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('CALL', 'MEETING', 'ZALO', 'EMAIL', 'NOTE', 'FOLLOW_UP', 'QUOTATION', 'TASK')),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    next_follow_up_at TIMESTAMPTZ,
    result_note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- MODULE 3: CUSTOMER & SALES (3 TABLES)
-- ============================================================================

-- 20. ACCOUNTS
CREATE TABLE accounts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tax_code VARCHAR(50) UNIQUE,
    company_name VARCHAR(255) NOT NULL,
    address TEXT,
    phone VARCHAR(20),
    email VARCHAR(255),
    website VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for sales_activities.account_id
ALTER TABLE sales_activities ADD CONSTRAINT fk_sales_activities_account FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE;

-- 21. CONTACTS
CREATE TABLE contacts (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    full_name VARCHAR(150) NOT NULL,
    position VARCHAR(100),
    phone VARCHAR(20),
    email VARCHAR(255),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 22. DEALS
-- NOTE: lead_id is UNIQUE (1 Lead -> 0..1 Deal)
CREATE TABLE deals (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    primary_contact_id BIGINT REFERENCES contacts(id),
    lead_id BIGINT UNIQUE REFERENCES leads(id) ON DELETE SET NULL,
    assigned_sale_id BIGINT NOT NULL REFERENCES employees(id),
    closing_sale_id BIGINT REFERENCES employees(id),
    deal_name VARCHAR(255) NOT NULL,
    expected_value NUMERIC(15,2) DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'NEGOTIATING', 'WON', 'LOST')),
    won_at TIMESTAMPTZ,
    lost_at TIMESTAMPTZ,
    lost_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add FK for sales_activities.deal_id
ALTER TABLE sales_activities ADD CONSTRAINT fk_sales_activities_deal FOREIGN KEY (deal_id) REFERENCES deals(id) ON DELETE CASCADE;


-- ============================================================================
-- MODULE 4: SERVICE CATALOG & REQUIREMENT VERSIONING (7 TABLES)
-- ============================================================================

-- 23. SERVICES
CREATE TABLE services (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    service_type VARCHAR(50) NOT NULL CHECK (service_type IN ('PROJECT', 'RECURRING')),
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 24. SERVICE REQUIREMENT TEMPLATES
CREATE TABLE service_requirement_templates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    version INT NOT NULL DEFAULT 1,
    template_name VARCHAR(150) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(service_id, version)
);

-- 25. SERVICE REQUIREMENT FIELDS
CREATE TABLE service_requirement_fields (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_id BIGINT NOT NULL REFERENCES service_requirement_templates(id) ON DELETE CASCADE,
    field_key VARCHAR(100) NOT NULL,
    field_label VARCHAR(150) NOT NULL,
    field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'URL', 'DATE', 'SELECT', 'MULTI_SELECT', 'FILE', 'JSON')),
    options_json JSONB,
    is_required BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(template_id, field_key)
);

-- 26. PROJECT TEMPLATES
CREATE TABLE project_templates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    template_name VARCHAR(150) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 27. PROJECT TEMPLATE MILESTONES
CREATE TABLE project_template_milestones (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_template_id BIGINT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    weight NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 28. PROJECT TEMPLATE TASKS
CREATE TABLE project_template_tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    template_milestone_id BIGINT NOT NULL REFERENCES project_template_milestones(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    weight NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 29. PAYMENT PLAN TEMPLATES
CREATE TABLE payment_plan_templates (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_id BIGINT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    plan_name VARCHAR(150) NOT NULL,
    config_json JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- MODULE 5: ORDERS & GENERIC DEPENDENCIES (8 TABLES)
-- ============================================================================

-- 30. ORDERS
CREATE TABLE orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    account_id BIGINT NOT NULL REFERENCES accounts(id),
    primary_contact_id BIGINT REFERENCES contacts(id),
    order_code VARCHAR(50) NOT NULL UNIQUE,
    workflow_status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (workflow_status IN ('DRAFT', 'PENDING_APPROVAL', 'NEED_MORE_INFO', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PARTIAL UNIQUE INDEX: Enforces MAX 1 ACTIVE ORDER PER ACCOUNT
CREATE UNIQUE INDEX idx_one_active_order_per_account ON orders (account_id) 
WHERE workflow_status IN ('DRAFT', 'PENDING_APPROVAL', 'NEED_MORE_INFO', 'APPROVED', 'IN_PROGRESS');

-- 31. ORDER ITEMS
CREATE TABLE order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    deal_id BIGINT REFERENCES deals(id),
    closing_sale_id BIGINT NOT NULL REFERENCES employees(id),
    service_id BIGINT NOT NULL REFERENCES services(id),
    requirement_template_id BIGINT NOT NULL REFERENCES service_requirement_templates(id),
    requirement_template_version INT NOT NULL,
    original_price NUMERIC(15,2) NOT NULL CHECK (original_price >= 0),
    discount_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    net_service_value NUMERIC(15,2) NOT NULL CHECK (net_service_value >= 0),
    vat_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
    approval_status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (approval_status IN ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
    delivery_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (delivery_status IN ('PENDING', 'WAITING_DEPENDENCY', 'READY_FOR_ASSIGNMENT', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    payment_status VARCHAR(50) NOT NULL DEFAULT 'UNPAID' CHECK (payment_status IN ('UNPAID', 'PARTIALLY_PAID', 'FULLY_PAID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 32. ORDER ITEM REQUIREMENTS
-- Stores IMMUTABLE field definition snapshots & structured values at the time of sale
CREATE TABLE order_item_requirements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    field_id BIGINT REFERENCES service_requirement_fields(id),
    field_key_snapshot VARCHAR(100) NOT NULL,
    label_snapshot VARCHAR(150) NOT NULL,
    field_type_snapshot VARCHAR(50) NOT NULL,
    options_snapshot JSONB,
    value_text TEXT,
    value_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 33. ORDER DOCUMENTS
CREATE TABLE order_documents (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    document_title VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 34. DISCOUNT REQUESTS
CREATE TABLE discount_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    requested_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED')),
    approved_by_employee_id BIGINT REFERENCES employees(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 35. DISCOUNT REQUEST ITEMS
CREATE TABLE discount_request_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    discount_request_id BIGINT NOT NULL REFERENCES discount_requests(id) ON DELETE CASCADE,
    order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    proposed_discount_amount NUMERIC(15,2) NOT NULL CHECK (proposed_discount_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 36. ORDER ITEM DEPENDENCIES
-- V1 Generic Capability for Delivery & Payment prerequisites
CREATE TABLE order_item_dependencies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dependent_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    prerequisite_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    required_prerequisite_delivery_status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED',
    required_prerequisite_payment_status VARCHAR(50) NOT NULL DEFAULT 'FULLY_PAID',
    is_unlocked BOOLEAN NOT NULL DEFAULT FALSE,
    unlocked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_no_self_dependency CHECK (dependent_item_id <> prerequisite_item_id),
    UNIQUE(dependent_item_id, prerequisite_item_id)
);

-- 37. CHANGE REQUESTS
CREATE TABLE change_requests (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    requested_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('SCOPE_CHANGE', 'PRICE_CHANGE', 'CANCELLATION')),
    description TEXT NOT NULL,
    amount_delta NUMERIC(15,2) NOT NULL DEFAULT 0,
    days_delta INT NOT NULL DEFAULT 0,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK (status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'IMPLEMENTED')),
    approved_by_employee_id BIGINT REFERENCES employees(id),
    approved_at TIMESTAMPTZ,
    implemented_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- MODULE 6: PROJECT DELIVERY & PROGRESS (8 TABLES)
-- ============================================================================

-- 38. PROJECTS
-- NOTE: order_item_id is UNIQUE (1 Order Item -> 0..1 Project)
CREATE TABLE projects (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
    project_template_id BIGINT REFERENCES project_templates(id),
    project_name VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED' CHECK (status IN ('ASSIGNED', 'READY_TO_START', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_SALE', 'WAITING_INTERNAL', 'BLOCKED', 'REVIEW', 'ACCEPTANCE', 'COMPLETED', 'CANCELLED')),
    materialized_progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (materialized_progress_percent >= 0 AND materialized_progress_percent <= 100),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 39. PROJECT ASSIGNMENTS
-- APPLICATION-LEVEL INVARIANT: Transaction/locking must enforce MAX 2 ACTIVE PRIMARY assignees
CREATE TABLE project_assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    assignment_type VARCHAR(50) NOT NULL CHECK (assignment_type IN ('PRIMARY', 'SUPPORT')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    replacement_reason TEXT
);

-- 40. PROJECT MILESTONES
CREATE TABLE project_milestones (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    weight NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 41. PROJECT TASKS
CREATE TABLE project_tasks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    milestone_id BIGINT NOT NULL REFERENCES project_milestones(id) ON DELETE CASCADE,
    assigned_to_employee_id BIGINT REFERENCES employees(id),
    title VARCHAR(255) NOT NULL,
    weight NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (weight >= 0 AND weight <= 100),
    status VARCHAR(50) NOT NULL DEFAULT 'TODO' CHECK (status IN ('TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE')),
    blocked_reason TEXT,
    blocked_since TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 42. PROJECT COMMENTS
CREATE TABLE project_comments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_employee_id BIGINT NOT NULL REFERENCES employees(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 43. PROJECT ATTACHMENTS
CREATE TABLE project_attachments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    file_title VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    uploaded_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 44. PROJECT ACCEPTANCES
-- Single Source of Truth for Customer Project Acceptance (UNIQUE project_id)
CREATE TABLE project_acceptances (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    customer_contact_id BIGINT NOT NULL REFERENCES contacts(id),
    accepted_by_name VARCHAR(150) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evidence_document VARCHAR(500) NOT NULL,
    recorded_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 45. PROJECT CREDENTIALS
-- Encrypted Credential Vault (NO PLAINTEXT SECRETS)
CREATE TABLE project_credentials (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    project_id BIGINT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    credential_type VARCHAR(100) NOT NULL,
    ciphertext TEXT NOT NULL,
    nonce TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    key_version VARCHAR(50) NOT NULL DEFAULT 'v1',
    updated_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- MODULE 7: RECURRING SUBSCRIPTIONS & SEO (5 TABLES)
-- ============================================================================

-- 46. SUBSCRIPTIONS
-- NOTE: order_item_id is UNIQUE (1 Order Item -> 0..1 Subscription)
CREATE TABLE subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
    service_id BIGINT NOT NULL REFERENCES services(id),
    billing_interval VARCHAR(50) NOT NULL CHECK (billing_interval IN ('MONTH', 'QUARTER', 'YEAR', 'CUSTOM')),
    interval_count INT NOT NULL DEFAULT 1,
    start_date DATE NOT NULL,
    end_date DATE,
    renewal_date DATE,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'EXPIRED', 'CANCELLED')),
    previous_subscription_id BIGINT REFERENCES subscriptions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 47. SERVICE PERIODS
CREATE TABLE service_periods (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    subscription_id BIGINT NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    period_index INT NOT NULL,
    period_net_value NUMERIC(15,2) NOT NULL CHECK (period_net_value >= 0),
    vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0 CHECK (vat_rate >= 0 AND vat_rate <= 1),
    vat_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    gross_payable NUMERIC(15,2) NOT NULL CHECK (gross_payable >= 0),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    execution_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (execution_status IN ('PENDING', 'IN_PROGRESS', 'REVIEW', 'ACCEPTED', 'CANCELLED')),
    payment_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (payment_status IN ('PENDING', 'PARTIALLY_PAID', 'FULLY_PAID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(subscription_id, period_index)
);

-- 48. SERVICE PERIOD ASSIGNMENTS
-- APPLICATION-LEVEL INVARIANT: Transaction/locking must enforce MAX 2 ACTIVE PRIMARY assignees per period
CREATE TABLE service_period_assignments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_period_id BIGINT NOT NULL REFERENCES service_periods(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    assignment_type VARCHAR(50) NOT NULL CHECK (assignment_type IN ('PRIMARY', 'SUPPORT')),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    unassigned_at TIMESTAMPTZ,
    replacement_reason TEXT
);

-- 49. SERVICE PERIOD ACCEPTANCES
-- Single Source of Truth for Customer Period Acceptance (UNIQUE service_period_id)
CREATE TABLE service_period_acceptances (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_period_id BIGINT NOT NULL UNIQUE REFERENCES service_periods(id) ON DELETE CASCADE,
    customer_contact_id BIGINT NOT NULL REFERENCES contacts(id),
    accepted_by_name VARCHAR(150) NOT NULL,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    evidence_document VARCHAR(500) NOT NULL,
    recorded_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 50. SEO ARTICLES
CREATE TABLE seo_articles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    service_period_id BIGINT NOT NULL REFERENCES service_periods(id) ON DELETE CASCADE,
    author_employee_id BIGINT NOT NULL REFERENCES employees(id),
    keyword VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    url VARCHAR(500),
    reviewer_employee_id BIGINT REFERENCES employees(id),
    reviewed_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED')),
    kpi_period_id VARCHAR(50),
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- MODULE 8: DAILY REPORTS & WORK LOGS (1 TABLE)
-- ============================================================================

-- 51. DAILY REPORTS
-- NOTE: Operational metrics (articles, calls, leads converted, tasks) are DERIVED on query
CREATE TABLE daily_reports (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    difficulty TEXT,
    support_needed TEXT,
    next_plan TEXT,
    note TEXT,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(employee_id, report_date)
);

-- 51b. DAILY REPORT ITEMS
CREATE TABLE daily_report_items (
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

CREATE INDEX idx_daily_report_items_report_id ON daily_report_items(daily_report_id);
CREATE INDEX idx_daily_report_items_project_id ON daily_report_items(project_id) WHERE project_id IS NOT NULL;

-- 51c. WEEKLY REPORTS
CREATE TABLE weekly_reports (
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

CREATE INDEX idx_weekly_reports_team_id ON weekly_reports(team_id);
CREATE INDEX idx_weekly_reports_created_by ON weekly_reports(created_by_employee_id);


-- ============================================================================
-- MODULE 9: NEGOTIATED FINANCE & SETTLEMENTS (7 TABLES)
-- ============================================================================

-- 52. ORDER ITEM PAYMENT PLANS
-- PARTIAL UNIQUE INDEX: Enforces MAX 1 APPROVED PLAN PER ORDER ITEM
CREATE TABLE order_item_payment_plans (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
    template_id BIGINT REFERENCES payment_plan_templates(id),
    version INT NOT NULL DEFAULT 1,
    status VARCHAR(50) NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'APPROVED', 'SUPERSEDED', 'CANCELLED')),
    created_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    config_snapshot JSONB NOT NULL,
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(order_item_id, version)
);

CREATE UNIQUE INDEX idx_one_approved_plan_per_item ON order_item_payment_plans (order_item_id) 
WHERE status = 'APPROVED';

-- 53. PAYMENT INSTALLMENTS
-- APPLICATION-LEVEL INVARIANT: If service_period_id IS NOT NULL, service_period.subscription.order_item_id MUST equal payment_plan.order_item_id.
CREATE TABLE payment_installments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_plan_id BIGINT NOT NULL REFERENCES order_item_payment_plans(id) ON DELETE CASCADE,
    service_period_id BIGINT REFERENCES service_periods(id) ON DELETE SET NULL,
    installment_number INT NOT NULL,
    due_date DATE NOT NULL,
    gross_amount_due NUMERIC(15,2) NOT NULL CHECK (gross_amount_due >= 0),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(payment_plan_id, installment_number)
);

-- 54. PAYMENTS
-- Stores Gross Cash received
CREATE TABLE payments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_code VARCHAR(50) NOT NULL UNIQUE,
    gross_cash_amount NUMERIC(15,2) NOT NULL CHECK (gross_cash_amount > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('BANK_TRANSFER', 'CASH', 'CREDIT_CARD', 'E_WALLET')),
    evidence_url VARCHAR(500),
    created_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    confirmed_by_employee_id BIGINT REFERENCES employees(id),
    confirmed_at TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'PENDING_CONFIRMATION' CHECK (status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'REJECTED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 55. PAYMENT ALLOCATIONS
-- Order Item is derived via: Allocation -> Installment -> Payment Plan -> Order Item
CREATE TABLE payment_allocations (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payment_id BIGINT NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
    installment_id BIGINT NOT NULL REFERENCES payment_installments(id),
    closing_sale_id BIGINT NOT NULL REFERENCES employees(id),
    gross_allocated_amount NUMERIC(15,2) NOT NULL CHECK (gross_allocated_amount > 0),
    vat_allocated_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (vat_allocated_amount >= 0),
    service_amount NUMERIC(15,2) NOT NULL CHECK (service_amount >= 0),
    net_eligible_amount NUMERIC(15,2) NOT NULL CHECK (net_eligible_amount >= 0),
    confirmed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 56. INVOICES
CREATE TABLE invoices (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    invoice_number VARCHAR(100) NOT NULL UNIQUE,
    total_amount NUMERIC(15,2) NOT NULL CHECK (total_amount >= 0),
    vat_amount NUMERIC(15,2) NOT NULL CHECK (vat_amount >= 0),
    issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 57. INVOICE ITEMS
CREATE TABLE invoice_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invoice_id BIGINT NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    order_item_id BIGINT NOT NULL REFERENCES order_items(id),
    amount NUMERIC(15,2) NOT NULL CHECK (amount >= 0),
    vat_amount NUMERIC(15,2) NOT NULL CHECK (vat_amount >= 0)
);

-- 58. ORDER ITEM SETTLEMENTS
-- Partial Cancellation Settlement Record
CREATE TABLE order_item_settlements (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_item_id BIGINT NOT NULL UNIQUE REFERENCES order_items(id) ON DELETE CASCADE,
    original_service_value NUMERIC(15,2) NOT NULL,
    active_contract_value NUMERIC(15,2) NOT NULL,
    cancelled_service_value NUMERIC(15,2) NOT NULL,
    retained_amount NUMERIC(15,2) NOT NULL CHECK (retained_amount >= 0),
    written_off_receivable NUMERIC(15,2) NOT NULL CHECK (written_off_receivable >= 0),
    boss_confirmed_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    boss_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- MODULE 10: COMMISSION ENGINE (3 TABLES)
-- ============================================================================

-- 59. COMMISSION POLICIES
-- EXCLUSION CONSTRAINT: Scope Key prevents overlapping policies for the exact same dimensions
CREATE TABLE commission_policies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    policy_name VARCHAR(150) NOT NULL,
    policy_type VARCHAR(50) NOT NULL CHECK (policy_type IN ('SALE', 'PROJECT_DELIVERY', 'TEAM_OVERRIDE')),
    service_id BIGINT REFERENCES services(id),
    position_id BIGINT REFERENCES positions(id),
    assignee_count INT,
    rate NUMERIC(5,4) NOT NULL CHECK (rate >= 0 AND rate <= 1),
    scope_key VARCHAR(255) GENERATED ALWAYS AS (
        policy_type || '-' || COALESCE(service_id::text, 'ALL') || '-' || COALESCE(position_id::text, 'ALL') || '-' || COALESCE(assignee_count::text, 'ALL')
    ) STORED NOT NULL,
    effective_range TSTZRANGE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT no_overlapping_policy_scope EXCLUDE USING gist (
        scope_key WITH =,
        effective_range WITH &&
    )
);

-- 60. COMMISSIONS
-- Stores immutable snapshot calculations with Idempotency Protection & Strict Scope Convention
CREATE TABLE commissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    policy_id BIGINT REFERENCES commission_policies(id),
    order_item_id BIGINT REFERENCES order_items(id),
    service_period_id BIGINT REFERENCES service_periods(id),
    beneficiary_employee_id BIGINT NOT NULL REFERENCES employees(id),
    commission_type VARCHAR(50) NOT NULL CHECK (commission_type IN ('SALE', 'PROJECT_DELIVERY', 'TEAM_OVERRIDE')),
    rate_snapshot NUMERIC(5,4) NOT NULL,
    commission_base NUMERIC(15,2) NOT NULL CHECK (commission_base >= 0),
    calculated_amount NUMERIC(15,2) NOT NULL CHECK (calculated_amount >= 0),
    approved_amount NUMERIC(15,2) CHECK (approved_amount >= 0),
    approved_by_employee_id BIGINT REFERENCES employees(id),
    decision_reason TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'UNEARNED' CHECK (status IN ('UNEARNED', 'RELEASED', 'CALCULATED', 'APPROVED', 'ADJUSTED', 'REJECTED', 'IN_PAYROLL', 'PAID')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_commission_target_scope CHECK (
        (order_item_id IS NOT NULL AND service_period_id IS NULL) OR
        (order_item_id IS NULL AND service_period_id IS NOT NULL)
    )
);

-- IDEMPOTENCY PARTIAL UNIQUE INDEXES FOR COMMISSIONS
CREATE UNIQUE INDEX idx_comm_idempotent_order_item ON commissions (order_item_id, beneficiary_employee_id, commission_type) 
WHERE order_item_id IS NOT NULL;

CREATE UNIQUE INDEX idx_comm_idempotent_period ON commissions (service_period_id, beneficiary_employee_id, commission_type) 
WHERE service_period_id IS NOT NULL;

-- 61. COMMISSION SOURCES
-- STRICT FK SCHEMA: Exactly ONE source FK is NOT NULL + PARTIAL UNIQUE INDEXES FOR IDEMPOTENCY
CREATE TABLE commission_sources (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    commission_id BIGINT NOT NULL REFERENCES commissions(id) ON DELETE CASCADE,
    payment_allocation_id BIGINT REFERENCES payment_allocations(id),
    settlement_id BIGINT REFERENCES order_item_settlements(id),
    attributed_amount NUMERIC(15,2) NOT NULL CHECK (attributed_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_exactly_one_source_fk CHECK (
        (payment_allocation_id IS NOT NULL AND settlement_id IS NULL) OR
        (payment_allocation_id IS NULL AND settlement_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX idx_comm_source_allocation ON commission_sources (commission_id, payment_allocation_id) 
WHERE payment_allocation_id IS NOT NULL;

CREATE UNIQUE INDEX idx_comm_source_settlement ON commission_sources (commission_id, settlement_id) 
WHERE settlement_id IS NOT NULL;


-- ============================================================================
-- MODULE 11: KPI ENGINE (3 TABLES)
-- ============================================================================

-- 62. KPI POLICIES
CREATE TABLE kpi_policies (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    policy_name VARCHAR(150) NOT NULL,
    position_id BIGINT REFERENCES positions(id),
    metric_type VARCHAR(100) NOT NULL,
    effective_range TSTZRANGE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 63. KPI POLICY TIERS
CREATE TABLE kpi_policy_tiers (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kpi_policy_id BIGINT NOT NULL REFERENCES kpi_policies(id) ON DELETE CASCADE,
    min_threshold NUMERIC(15,2) NOT NULL,
    max_threshold NUMERIC(15,2),
    reward_amount NUMERIC(15,2) NOT NULL,
    tier_note TEXT
);

-- 64. KPI EVENTS
-- Traces performance events back to operational source with Idempotency Protection (policy_id NOT NULL)
CREATE TABLE kpi_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    policy_id BIGINT NOT NULL REFERENCES kpi_policies(id),
    policy_snapshot_json JSONB,
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('PAYMENT_ALLOCATION', 'PROJECT_ACCEPTANCE', 'SEO_ARTICLE', 'SERVICE_PERIOD')),
    source_id BIGINT NOT NULL,
    metric_type VARCHAR(100) NOT NULL,
    metric_value NUMERIC(15,2) NOT NULL DEFAULT 0,
    kpi_points NUMERIC(15,2) DEFAULT 0,
    eligible_revenue NUMERIC(15,2) DEFAULT 0,
    target_kpi_period VARCHAR(50) NOT NULL,
    qualified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_kpi_event_idempotency UNIQUE(employee_id, policy_id, source_type, source_id, metric_type)
);


-- ============================================================================
-- MODULE 12: PAYROLL & EXPENSE DEDUPLICATION (5 TABLES)
-- ============================================================================

-- 65. PAYROLL PERIODS
-- SINGLE SOURCE OF TRUTH for Payroll Lifecycle
CREATE TABLE payroll_periods (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    period_key VARCHAR(50) NOT NULL UNIQUE, -- e.g. '2026-09'
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CALCULATING', 'REVIEW', 'APPROVED', 'LOCKED')),
    locked_at TIMESTAMPTZ,
    locked_by_employee_id BIGINT REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 66. PAYROLLS
CREATE TABLE payrolls (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payroll_period_id BIGINT NOT NULL REFERENCES payroll_periods(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES employees(id),
    base_salary NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (base_salary >= 0),
    released_commission_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (released_commission_amount >= 0),
    kpi_bonus_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (kpi_bonus_amount >= 0),
    team_override_amount NUMERIC(15,2) NOT NULL DEFAULT 0 CHECK (team_override_amount >= 0),
    adjustment_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    net_salary_amount NUMERIC(15,2) NOT NULL CHECK (net_salary_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(payroll_period_id, employee_id)
);

-- 67. PAYROLL ITEMS
CREATE TABLE payroll_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    payroll_id BIGINT NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
    item_type VARCHAR(100) NOT NULL,
    amount NUMERIC(15,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 68. PAYROLL ADJUSTMENTS
-- Target payroll statement protection via target_payroll_id -> payrolls.payroll_period_id
CREATE TABLE payroll_adjustments (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    target_payroll_id BIGINT NOT NULL REFERENCES payrolls(id) ON DELETE CASCADE,
    origin_payroll_period_id BIGINT NOT NULL REFERENCES payroll_periods(id),
    amount NUMERIC(15,2) NOT NULL,
    reason TEXT NOT NULL,
    created_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    approved_by_employee_id BIGINT REFERENCES employees(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 69. EXPENSE CATEGORIES
CREATE TABLE expense_categories (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 70. EXPENSES
-- PARTIAL UNIQUE INDEX: Deduplicates aggregated salary expense per payroll period
CREATE TABLE expenses (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    category_id BIGINT NOT NULL REFERENCES expense_categories(id),
    amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    expense_date DATE NOT NULL,
    created_by_employee_id BIGINT NOT NULL REFERENCES employees(id),
    approved_by_employee_id BIGINT REFERENCES employees(id),
    source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('PAYROLL', 'DIRECT_PURCHASE', 'ADS', 'INFRASTRUCTURE')),
    source_payroll_period_id BIGINT REFERENCES payroll_periods(id),
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_payroll_expense_dedup ON expenses (source_payroll_period_id) 
WHERE source_type = 'PAYROLL';


-- ============================================================================
-- MODULE 13: SYSTEM, NOTIFICATIONS, AUDIT & WEBHOOKS (3 TABLES)
-- ============================================================================

-- 71. NOTIFICATIONS
CREATE TABLE notifications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    deep_link_url VARCHAR(500),
    entity_type VARCHAR(100),
    entity_id BIGINT,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 72. WEBHOOK EVENTS
-- Independent Integration Event Log
CREATE TABLE webhook_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider VARCHAR(100) NOT NULL,
    external_event_id VARCHAR(255) NOT NULL,
    payload_json JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED', 'PROCESSED', 'FAILED')),
    processed_entity_type VARCHAR(100),
    processed_entity_id BIGINT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    CONSTRAINT unique_provider_event UNIQUE (provider, external_event_id)
);

-- 73. AUDIT LOGS
-- Sanitized Audit Trail (NO PLAINTEXT SECRETS)
CREATE TABLE audit_logs (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_employee_id BIGINT REFERENCES employees(id),
    actor_type VARCHAR(50) NOT NULL DEFAULT 'USER' CHECK (actor_type IN ('USER', 'SYSTEM', 'WEBHOOK', 'JOB')),
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id BIGINT NOT NULL,
    payload_before_sanitized JSONB,
    payload_after_sanitized JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================================
-- DATABASE TRIGGERS & INTEGRITY FUNCTIONS
-- ============================================================================

-- Trigger Function: Multi-Table Dual-State Immutability Protection for Payroll Data
-- Checks BOTH Old and New Target Payroll Periods on UPDATE, DELETE, and INSERT
CREATE OR REPLACE FUNCTION fn_check_payroll_locked()
RETURNS TRIGGER AS $$
DECLARE
    v_old_period_id BIGINT;
    v_new_period_id BIGINT;
    v_old_status VARCHAR(50);
    v_new_status VARCHAR(50);
BEGIN
    -- Determine v_old_period_id for UPDATE or DELETE
    IF (TG_OP = 'UPDATE' OR TG_OP = 'DELETE') THEN
        IF TG_TABLE_NAME = 'payrolls' THEN
            v_old_period_id := OLD.payroll_period_id;
        ELSIF TG_TABLE_NAME = 'payroll_items' THEN
            SELECT payroll_period_id INTO v_old_period_id FROM payrolls WHERE id = OLD.payroll_id;
        ELSIF TG_TABLE_NAME = 'payroll_adjustments' THEN
            SELECT payroll_period_id INTO v_old_period_id FROM payrolls WHERE id = OLD.target_payroll_id;
        END IF;
    END IF;

    -- Determine v_new_period_id for INSERT or UPDATE
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF TG_TABLE_NAME = 'payrolls' THEN
            v_new_period_id := NEW.payroll_period_id;
        ELSIF TG_TABLE_NAME = 'payroll_items' THEN
            SELECT payroll_period_id INTO v_new_period_id FROM payrolls WHERE id = NEW.payroll_id;
        ELSIF TG_TABLE_NAME = 'payroll_adjustments' THEN
            SELECT payroll_period_id INTO v_new_period_id FROM payrolls WHERE id = NEW.target_payroll_id;
        END IF;
    END IF;

    -- 1) Validate OLD target payroll period status
    IF v_old_period_id IS NOT NULL THEN
        SELECT status INTO v_old_status FROM payroll_periods WHERE id = v_old_period_id;
        IF v_old_status = 'LOCKED' THEN
            RAISE EXCEPTION 'CANNOT MODIFY OR DELETE PAYROLL DATA IN A LOCKED PAYROLL PERIOD (Period ID: %).', v_old_period_id;
        END IF;
    END IF;

    -- 2) Validate NEW target payroll period status
    IF v_new_period_id IS NOT NULL AND (TG_OP = 'INSERT' OR v_new_period_id <> v_old_period_id) THEN
        SELECT status INTO v_new_status FROM payroll_periods WHERE id = v_new_period_id;
        IF v_new_status = 'LOCKED' THEN
            RAISE EXCEPTION 'CANNOT TARGET A LOCKED PAYROLL PERIOD FOR PAYROLL DATA (Period ID: %).', v_new_period_id;
        END IF;
    END IF;

    IF (TG_OP = 'DELETE') THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger 1: Protect payrolls table
CREATE TRIGGER trg_protect_locked_payrolls
BEFORE INSERT OR UPDATE OR DELETE ON payrolls
FOR EACH ROW EXECUTE FUNCTION fn_check_payroll_locked();

-- Trigger 2: Protect payroll_items table
CREATE TRIGGER trg_protect_locked_payroll_items
BEFORE INSERT OR UPDATE OR DELETE ON payroll_items
FOR EACH ROW EXECUTE FUNCTION fn_check_payroll_locked();

-- Trigger 3: Protect payroll_adjustments table
CREATE TRIGGER trg_protect_locked_payroll_adjustments
BEFORE INSERT OR UPDATE OR DELETE ON payroll_adjustments
FOR EACH ROW EXECUTE FUNCTION fn_check_payroll_locked();

-- ============================================================================
-- MODULE 16: DYNAMIC OPTIONS (1 TABLE)
-- ============================================================================
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

-- ============================================================================
-- END OF PATCHED DDL SCHEMA V4.3
-- ============================================================================
