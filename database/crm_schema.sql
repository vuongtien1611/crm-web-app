-- ==========================================
-- CRM SYSTEM DATABASE SCHEMA (PostgreSQL) - Version 1.0 (Singular Table Names)
-- ==========================================

-- Kích hoạt extension để sinh UUID
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ==========================================
-- 0. UTILITIES
-- ==========================================

-- Function tự động cập nhật trường updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ==========================================
-- 1. RBAC & TEAMS (PHÂN QUYỀN VÀ ĐỘI NHÓM)
-- ==========================================

CREATE TABLE role (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE permission (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    module VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE role_permission (
    role_id UUID REFERENCES role(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permission(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE "user" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER set_timestamp_user BEFORE UPDATE ON "user" FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE user_role (
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    role_id UUID REFERENCES role(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_member (
    team_id UUID REFERENCES team(id) ON DELETE CASCADE,
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    PRIMARY KEY (team_id, user_id)
);


-- ==========================================
-- 3. CUSTOMER 360 (ACCOUNT & CONTACT)
-- (Đưa lên trước Lead để Lead có thể tham chiếu Convert)
-- ==========================================

CREATE TABLE account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    industry VARCHAR(100),
    website VARCHAR(255),
    phone VARCHAR(20),
    address TEXT,
    segment VARCHAR(50) CHECK (segment IN ('vip', 'regular', 'potential')),
    owner_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ, -- Soft delete
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER set_timestamp_account BEFORE UPDATE ON account FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE contact (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    job_title VARCHAR(100),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ, 
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (account_id, id) -- Hỗ trợ Composite FK ở Deal (khóa cứng Contact thuộc đúng Account)
);
CREATE TRIGGER set_timestamp_contact BEFORE UPDATE ON contact FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE tag (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL,
    color VARCHAR(20)
);

CREATE TABLE account_tag (
    account_id UUID REFERENCES account(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tag(id) ON DELETE CASCADE,
    PRIMARY KEY (account_id, tag_id)
);


-- ==========================================
-- 2. LEADS MANAGEMENT (CHUẨN HÓA)
-- ==========================================

CREATE TABLE lead_source (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead_status (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_converted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name VARCHAR(100) NOT NULL,
    company_name VARCHAR(150),
    email VARCHAR(255),
    phone VARCHAR(20),
    source_id UUID REFERENCES lead_source(id) ON DELETE RESTRICT,
    status_id UUID NOT NULL REFERENCES lead_status(id) ON DELETE RESTRICT,
    expected_value NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (expected_value >= 0),
    owner_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    notes TEXT,
    
    -- Tracing Conversion
    converted_at TIMESTAMPTZ,
    converted_account_id UUID REFERENCES account(id) ON DELETE SET NULL,
    converted_contact_id UUID REFERENCES contact(id) ON DELETE SET NULL,
    
    deleted_at TIMESTAMPTZ, -- Soft Delete cho Lead
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER set_timestamp_lead BEFORE UPDATE ON lead FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();


-- ==========================================
-- 2.1 PHÂN BỔ LEAD TỰ ĐỘNG
-- ==========================================

CREATE TABLE lead_assignment_rule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    rule_type VARCHAR(50) NOT NULL CHECK (rule_type IN ('round_robin', 'geo_location', 'source', 'custom')),
    conditions JSONB, 
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE lead_assignment_rule_member (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id UUID NOT NULL REFERENCES lead_assignment_rule(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
    order_index INT NOT NULL DEFAULT 0 CHECK (order_index >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE(rule_id, user_id),
    UNIQUE(rule_id, order_index)
);

CREATE TABLE lead_assignment_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id UUID NOT NULL REFERENCES lead(id) ON DELETE RESTRICT, -- Lịch sử không bị mất khi xóa Lead
    rule_id UUID REFERENCES lead_assignment_rule(id) ON DELETE SET NULL,
    from_owner_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES "user"(id) ON DELETE SET NULL,
    assigned_by UUID REFERENCES "user"(id) ON DELETE SET NULL, -- Lưu vết ai chia (hoặc hệ thống chia thì NULL)
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 4. PIPELINE & DEALS
-- ==========================================

CREATE TABLE pipeline (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE pipeline_stage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pipeline_id UUID NOT NULL REFERENCES pipeline(id) ON DELETE RESTRICT,
    code VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    order_index INT NOT NULL CHECK (order_index >= 0),
    default_probability INT CHECK (default_probability >= 0 AND default_probability <= 100),
    is_closed_won BOOLEAN NOT NULL DEFAULT FALSE,
    is_closed_lost BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (pipeline_id, code),
    UNIQUE (pipeline_id, order_index),
    UNIQUE (pipeline_id, id),
    CONSTRAINT chk_won_lost_exclusive CHECK (NOT (is_closed_won = TRUE AND is_closed_lost = TRUE))
);

CREATE TABLE deal (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    account_id UUID NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    contact_id UUID, 
    pipeline_id UUID NOT NULL,
    stage_id UUID NOT NULL,
    amount NUMERIC(18,2) NOT NULL DEFAULT 0.00 CHECK (amount >= 0),
    probability INT CHECK (probability >= 0 AND probability <= 100),
    expected_close_date DATE,
    owner_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    FOREIGN KEY (pipeline_id) REFERENCES pipeline(id) ON DELETE RESTRICT,
    FOREIGN KEY (pipeline_id, stage_id) REFERENCES pipeline_stage(pipeline_id, id) ON DELETE RESTRICT,
    
    -- Khóa cứng DB: Contact phải thuộc đúng Account của Deal này
    FOREIGN KEY (account_id, contact_id) REFERENCES contact(account_id, id) ON DELETE RESTRICT
);
CREATE TRIGGER set_timestamp_deal BEFORE UPDATE ON deal FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE deal_stage_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE RESTRICT, -- Bảo vệ lịch sử
    old_stage_id UUID REFERENCES pipeline_stage(id) ON DELETE RESTRICT,
    new_stage_id UUID REFERENCES pipeline_stage(id) ON DELETE RESTRICT,
    changed_by UUID REFERENCES "user"(id) ON DELETE SET NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 4.1 DISCOUNT APPROVAL
-- ==========================================

CREATE TABLE discount_request (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE RESTRICT, -- Không mất lịch sử duyệt
    requester_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    requested_discount_percent NUMERIC(5,2) NOT NULL CHECK (requested_discount_percent > 0 AND requested_discount_percent <= 100),
    reason TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER set_timestamp_discount_request BEFORE UPDATE ON discount_request FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE discount_approval_step (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES discount_request(id) ON DELETE RESTRICT,
    approver_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    step_order INT NOT NULL CHECK (step_order >= 0),
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    comments TEXT,
    decided_at TIMESTAMPTZ,
    UNIQUE (request_id, step_order)
);


-- ==========================================
-- 5. CUSTOMER SUPPORT (TICKETS)
-- ==========================================

CREATE TABLE ticket (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    account_id UUID NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
    contact_id UUID,
    owner_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    sla_first_response_at TIMESTAMPTZ,
    sla_resolve_at TIMESTAMPTZ,
    first_responded_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id, contact_id) REFERENCES contact(account_id, id) ON DELETE RESTRICT
);
CREATE TRIGGER set_timestamp_ticket BEFORE UPDATE ON ticket FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();

CREATE TABLE ticket_reply (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES ticket(id) ON DELETE RESTRICT, -- Bảo vệ lịch sử chat hỗ trợ
    user_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    message TEXT NOT NULL,
    is_internal BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 6. ACTIVITIES (FOLLOW-UP)
-- ==========================================

CREATE TABLE activity (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(50) NOT NULL CHECK (type IN ('call', 'meeting', 'email', 'task', 'note', 'zalo')),
    subject VARCHAR(255) NOT NULL,
    description TEXT,
    due_date TIMESTAMPTZ,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'canceled')),
    priority VARCHAR(20) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    owner_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    
    lead_id UUID REFERENCES lead(id) ON DELETE RESTRICT,
    account_id UUID REFERENCES account(id) ON DELETE RESTRICT,
    contact_id UUID REFERENCES contact(id) ON DELETE RESTRICT,
    deal_id UUID REFERENCES deal(id) ON DELETE RESTRICT,
    ticket_id UUID REFERENCES ticket(id) ON DELETE RESTRICT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT chk_activity_single_entity CHECK (
        num_nonnulls(lead_id, account_id, contact_id, deal_id, ticket_id) = 1
    )
);
CREATE TRIGGER set_timestamp_activity BEFORE UPDATE ON activity FOR EACH ROW EXECUTE PROCEDURE trigger_set_timestamp();


-- ==========================================
-- 7. EMAIL MARKETING / DRIP CAMPAIGN
-- ==========================================

CREATE TABLE email_template (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE campaign (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE campaign_step (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaign(id) ON DELETE CASCADE,
    step_order INT NOT NULL CHECK (step_order >= 0),
    action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('email', 'task')),
    template_id UUID REFERENCES email_template(id) ON DELETE RESTRICT,
    delay_minutes INT NOT NULL DEFAULT 0 CHECK (delay_minutes >= 0),
    UNIQUE (campaign_id, step_order),
    UNIQUE (campaign_id, id), -- Hỗ trợ Composite FK
    CONSTRAINT chk_email_template CHECK (
        (action_type = 'email' AND template_id IS NOT NULL) OR 
        (action_type <> 'email')
    )
);

CREATE TABLE campaign_enrollment (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL,
    lead_id UUID REFERENCES lead(id) ON DELETE RESTRICT,
    contact_id UUID REFERENCES contact(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'canceled')),
    current_step_id UUID,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    next_run_at TIMESTAMPTZ,
    
    CONSTRAINT chk_enrollment_target CHECK (
        num_nonnulls(lead_id, contact_id) = 1
    ),
    FOREIGN KEY (campaign_id) REFERENCES campaign(id) ON DELETE CASCADE,
    -- Dữ liệu đang chạy, không cho xóa cứng step để bảo toàn nghiệp vụ
    FOREIGN KEY (campaign_id, current_step_id) REFERENCES campaign_step(campaign_id, id) ON DELETE RESTRICT
);

CREATE TABLE email_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipient_email VARCHAR(255) NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_html TEXT,
    enrollment_id UUID REFERENCES campaign_enrollment(id) ON DELETE SET NULL,
    sent_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'opened', 'clicked', 'bounced')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 8. LIVE CHAT
-- ==========================================

CREATE TABLE chat_session (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_identifier VARCHAR(255),
    lead_id UUID REFERENCES lead(id) ON DELETE SET NULL,
    support_user_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMPTZ
);

CREATE TABLE chat_message (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES chat_session(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('visitor', 'agent', 'bot')),
    sender_id UUID, 
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 9. AUTOMATION
-- ==========================================

CREATE TABLE automation_rule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    trigger_event VARCHAR(100) NOT NULL, 
    conditions JSONB NOT NULL,
    actions JSONB NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 10. WEBHOOK INBOUND (Chống trùng lặp dữ liệu)
-- ==========================================

CREATE TABLE webhook_inbound (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider VARCHAR(50) NOT NULL,
    external_id VARCHAR(255), 
    payload JSONB NOT NULL,
    processed_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (processed_status IN ('pending', 'success', 'failed')), 
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Partial Unique Index để chống trùng lặp, bỏ qua trường hợp external_id bị null
CREATE UNIQUE INDEX idx_webhook_external_id ON webhook_inbound(provider, external_id) WHERE external_id IS NOT NULL;


-- ==========================================
-- 11. NOTIFICATIONS
-- ==========================================

CREATE TABLE notification (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES "user"(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    link VARCHAR(255),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 12. AUDIT LOGS
-- ==========================================

CREATE TABLE audit_log (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id UUID REFERENCES "user"(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, 
    entity_type VARCHAR(50) NOT NULL, 
    entity_id UUID NOT NULL,
    old_data JSONB,
    new_data JSONB,
    ip_address INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ==========================================
-- 13. VIEWS TÍNH TOÁN FORECAST
-- ==========================================

CREATE OR REPLACE VIEW view_forecast_pipeline AS
SELECT 
    d.owner_id,
    u.full_name AS owner_name,
    d.pipeline_id,
    p.name AS pipeline_name,
    d.stage_id,
    s.name AS stage_name,
    DATE_TRUNC('month', d.expected_close_date) AS forecast_month,
    COUNT(d.id) AS deal_count,
    SUM(d.amount) AS total_amount,
    -- Tính Weighted Value bằng Probability riêng của Deal, nếu null lấy mặc định của Stage
    SUM(d.amount * COALESCE(d.probability, s.default_probability, 0) / 100.0) AS weighted_value
FROM deal d
LEFT JOIN "user" u ON d.owner_id = u.id -- Dùng LEFT JOIN để giữ Deal chưa gán Sales
JOIN pipeline p ON d.pipeline_id = p.id
JOIN pipeline_stage s ON d.stage_id = s.id
-- Chỉ tính những Deal đang Open (Tức là Stage không Won cũng không Lost)
WHERE s.is_closed_won = FALSE AND s.is_closed_lost = FALSE AND d.expected_close_date IS NOT NULL AND d.deleted_at IS NULL
GROUP BY 
    d.owner_id, u.full_name, d.pipeline_id, p.name, 
    d.stage_id, s.name, DATE_TRUNC('month', d.expected_close_date);


-- ==========================================
-- 14. INDEXES TỐI ƯU
-- ==========================================

-- Lọc Lead theo Chủ sở hữu và Trạng thái (chỉ lấy những Lead chưa bị xóa)
CREATE INDEX idx_lead_owner_status ON lead(owner_id, status_id) WHERE deleted_at IS NULL;

-- Lọc Lead theo thời gian tạo
CREATE INDEX idx_lead_created_at ON lead(created_at) WHERE deleted_at IS NULL;

-- Tải Kanban Board Deal siêu tốc
CREATE INDEX idx_deal_pipeline_stage ON deal(pipeline_id, stage_id) WHERE deleted_at IS NULL;

-- Lọc Deal theo Chủ sở hữu
CREATE INDEX idx_deal_owner_id ON deal(owner_id) WHERE deleted_at IS NULL;

-- Tìm Deal sắp chốt
CREATE INDEX idx_deal_close_date ON deal(expected_close_date) WHERE deleted_at IS NULL;

-- Cảnh báo Follow-up sắp đến hạn
CREATE INDEX idx_activity_due_date ON activity(due_date) WHERE status = 'pending';

-- Ticket chưa xử lý
CREATE INDEX idx_ticket_owner_status ON ticket(owner_id, status) WHERE status IN ('open', 'in_progress') AND deleted_at IS NULL;

-- Scheduler lấy Enrollment tới hạn gửi Email
CREATE INDEX idx_campaign_enrollment_next_run ON campaign_enrollment(next_run_at) WHERE status = 'active';

-- Lọc Audit Log nhanh theo thời gian
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Notification chưa đọc
CREATE INDEX idx_notification_unread ON notification(user_id) WHERE is_read = FALSE;
