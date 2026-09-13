# CRM SYSTEM COMPLETE ENTITY RELATIONSHIP DIAGRAM (ERD)

Tệp sơ đồ ERD Mermaid dưới đây biểu diễn đầy đủ **73 bảng** thuộc 13 Module của hệ thống CRM V4.0 (Đã Freeze nghiệp vụ và thông qua PRE-DDL SIGN-OFF).

```mermaid
erDiagram

    %% ============================================================================
    %% MODULE 1: IDENTITY, HR & TEAM MANAGEMENT (11 TABLES)
    %% ============================================================================

    users {
        bigint id PK
        string username UK
        string email UK
        string password_hash
        string status
        timestamptz created_at
        timestamptz updated_at
    }

    positions {
        bigint id PK
        string code UK
        string name
        string description
        timestamptz created_at
    }

    employees {
        bigint id PK
        bigint user_id FK,UK "NULLABLE"
        string employee_code UK
        string full_name
        string phone
        bigint position_id FK
        string status
        timestamptz created_at
        timestamptz updated_at
    }

    employee_position_history {
        bigint id PK
        bigint employee_id FK
        bigint position_id FK
        tstzrange effective_range "EXCLUDE GIST"
        string note
        timestamptz created_at
    }

    salary_history {
        bigint id PK
        bigint employee_id FK
        numeric base_salary
        tstzrange effective_range "EXCLUDE GIST"
        string note
        timestamptz created_at
    }

    roles {
        bigint id PK
        string code UK
        string name
        string description
        timestamptz created_at
    }

    permissions {
        bigint id PK
        string code UK
        string name
        string module
        string description
        timestamptz created_at
    }

    user_roles {
        bigint user_id PK,FK
        bigint role_id PK,FK
        timestamptz assigned_at
    }

    role_permissions {
        bigint role_id PK,FK
        bigint permission_id PK,FK
        timestamptz assigned_at
    }

    teams {
        bigint id PK
        string code UK
        string name
        string description
        timestamptz created_at
    }

    team_memberships {
        bigint id PK
        bigint team_id FK
        bigint employee_id FK
        boolean is_leader "EXCLUDE GIST Leader"
        tstzrange effective_range "EXCLUDE GIST Member"
        timestamptz created_at
    }

    users ||--o| employees : "0..1-to-0..1 (user_id NULLABLE + UNIQUE)"
    positions ||--o{ employees : "defines current position"
    employees ||--o{ employee_position_history : "position history range"
    employees ||--o{ salary_history : "salary history range"
    users ||--o{ user_roles : "has roles"
    roles ||--o{ user_roles : "assigned to"
    roles ||--o{ role_permissions : "contains permissions"
    permissions ||--o{ role_permissions : "granted to"
    teams ||--o{ team_memberships : "has members"
    employees ||--o{ team_memberships : "member history"


    %% ============================================================================
    %% MODULE 2: ACQUISITION, CONTENT & SALES ACTIVITIES (8 TABLES)
    %% ============================================================================

    platforms {
        bigint id PK
        string code UK
        string name
        boolean is_active
        timestamptz created_at
    }

    channels {
        bigint id PK
        string code UK
        string name
        boolean is_active
        timestamptz created_at
    }

    campaigns {
        bigint id PK
        bigint platform_id FK
        bigint channel_id FK
        string campaign_name
        string utm_source
        string utm_medium
        string utm_campaign
        numeric budget
        date start_date
        date end_date
        timestamptz created_at
    }

    sale_market_assignments {
        bigint id PK
        bigint employee_id FK
        bigint platform_id FK
        bigint channel_id FK
        boolean is_active
        timestamptz assigned_at
    }

    sales_contents {
        bigint id PK
        bigint creator_employee_id FK
        bigint platform_id FK
        bigint channel_id FK
        bigint campaign_id FK
        string content_title
        string url
        timestamptz published_at
        timestamptz created_at
    }

    leads {
        bigint id PK
        bigint platform_id FK
        bigint channel_id FK
        bigint campaign_id FK
        bigint sales_content_id FK
        bigint creator_employee_id FK
        bigint assigned_sale_id FK
        string full_name
        string phone
        string email
        string quality
        string status
        string landing_page
        string external_id
        string utm_source
        string utm_medium
        string utm_campaign
        timestamptz created_at
        timestamptz updated_at
    }

    lead_assignment_history {
        bigint id PK
        bigint lead_id FK
        bigint assigned_sale_id FK
        bigint assigned_by_employee_id FK
        timestamptz assigned_at
        string note
    }

    sales_activities {
        bigint id PK
        bigint lead_id FK
        bigint deal_id FK
        bigint account_id FK
        bigint employee_id FK
        string activity_type
        timestamptz occurred_at
        timestamptz next_follow_up_at
        string result_note
        timestamptz created_at
    }

    platforms ||--o{ sale_market_assignments : "platform scope"
    channels ||--o{ sale_market_assignments : "channel scope"
    employees ||--o{ sale_market_assignments : "sale market config"
    platforms ||--o{ campaigns : "platform campaign"
    channels ||--o{ campaigns : "channel campaign"
    campaigns ||--o{ sales_contents : "campaign content"
    employees ||--o{ sales_contents : "creator employee"
    platforms ||--o{ sales_contents : "posted platform"
    channels ||--o{ sales_contents : "posted channel"
    platforms ||--o{ leads : "source platform"
    channels ||--o{ leads : "source channel"
    campaigns ||--o{ leads : "attributed campaign"
    sales_contents ||--o{ leads : "attributed content"
    employees ||--o{ leads : "creator employee"
    employees ||--o{ leads : "assigned sale"
    leads ||--o{ lead_assignment_history : "assignment history"
    leads ||--o{ sales_activities : "lead activities"
    employees ||--o{ sales_activities : "activity performer"


    %% ============================================================================
    %% MODULE 3: CUSTOMER & SALES (3 TABLES)
    %% ============================================================================

    accounts {
        bigint id PK
        string tax_code UK
        string company_name
        string address
        string phone
        string email
        string website
        timestamptz created_at
        timestamptz updated_at
    }

    contacts {
        bigint id PK
        bigint account_id FK
        string full_name
        string position
        string phone
        string email
        boolean is_primary
        timestamptz created_at
    }

    deals {
        bigint id PK
        bigint account_id FK
        bigint primary_contact_id FK
        bigint lead_id FK,UK "1-to-0..1 UNIQUE"
        bigint assigned_sale_id FK
        bigint closing_sale_id FK
        string deal_name
        numeric expected_value
        string status
        timestamptz won_at
        timestamptz lost_at
        string lost_reason
        timestamptz created_at
        timestamptz updated_at
    }

    accounts ||--o{ contacts : "has contacts"
    accounts ||--o{ deals : "owns deals"
    contacts ||--o{ deals : "primary contact"
    leads ||--o| deals : "converted from lead (1-to-0..1)"
    employees ||--o{ deals : "assigned sale / deal owner"
    employees ||--o{ deals : "closing sale (set on WON)"
    deals ||--o{ sales_activities : "deal activities"
    accounts ||--o{ sales_activities : "account activities"


    %% ============================================================================
    %% MODULE 4: SERVICE CATALOG & REQUIREMENT VERSIONING (7 TABLES)
    %% ============================================================================

    services {
        bigint id PK
        string code UK
        string name
        string service_type
        string description
        boolean is_active
        timestamptz created_at
    }

    service_requirement_templates {
        bigint id PK
        bigint service_id FK
        int version "UNIQUE(service_id, version)"
        string template_name
        boolean is_active
        timestamptz created_at
    }

    service_requirement_fields {
        bigint id PK
        bigint template_id FK
        string field_key "UNIQUE(template_id, field_key)"
        string field_label
        string field_type
        jsonb options_json
        boolean is_required
        int sort_order
        timestamptz created_at
    }

    project_templates {
        bigint id PK
        bigint service_id FK
        string template_name
        string description
        timestamptz created_at
    }

    project_template_milestones {
        bigint id PK
        bigint project_template_id FK
        string title
        numeric weight
        int sort_order
        timestamptz created_at
    }

    project_template_tasks {
        bigint id PK
        bigint template_milestone_id FK
        string title
        numeric weight
        int sort_order
        timestamptz created_at
    }

    payment_plan_templates {
        bigint id PK
        bigint service_id FK
        string plan_name
        jsonb config_json
        boolean is_active
        timestamptz created_at
    }

    services ||--o{ service_requirement_templates : "has versioned template"
    service_requirement_templates ||--o{ service_requirement_fields : "template fields"
    services ||--o{ project_templates : "default project flow"
    project_templates ||--o{ project_template_milestones : "template milestones"
    project_template_milestones ||--o{ project_template_tasks : "template tasks"
    services ||--o{ payment_plan_templates : "default payment plans"


    %% ============================================================================
    %% MODULE 5: ORDERS & GENERIC DEPENDENCIES (8 TABLES)
    %% ============================================================================

    orders {
        bigint id PK
        bigint account_id FK "PARTIAL UNIQUE ACTIVE"
        bigint primary_contact_id FK
        string order_code UK
        string workflow_status
        timestamptz created_at
        timestamptz updated_at
    }

    order_items {
        bigint id PK
        bigint order_id FK
        bigint deal_id FK
        bigint closing_sale_id FK
        bigint service_id FK
        bigint requirement_template_id FK
        int requirement_template_version
        numeric original_price
        numeric discount_amount
        numeric net_service_value
        numeric vat_amount
        string approval_status
        string delivery_status
        string payment_status
        timestamptz created_at
        timestamptz updated_at
    }

    order_item_requirements {
        bigint id PK
        bigint order_item_id FK
        bigint field_id FK
        string field_key_snapshot
        string label_snapshot
        string field_type_snapshot
        jsonb options_snapshot
        string value
        timestamptz created_at
    }

    order_documents {
        bigint id PK
        bigint order_id FK
        string document_title
        string file_url
        timestamptz uploaded_at
    }

    discount_requests {
        bigint id PK
        bigint order_id FK
        bigint requested_by_employee_id FK
        string reason
        string status
        bigint approved_by_employee_id FK
        timestamptz approved_at
        timestamptz created_at
    }

    discount_request_items {
        bigint id PK
        bigint discount_request_id FK
        bigint order_item_id FK
        numeric proposed_discount_amount
        timestamptz created_at
    }

    order_item_dependencies {
        bigint id PK
        bigint dependent_item_id FK
        bigint prerequisite_item_id FK
        string required_prerequisite_delivery_status
        string required_prerequisite_payment_status
        boolean is_unlocked
        timestamptz unlocked_at
        timestamptz created_at
    }

    change_requests {
        bigint id PK
        bigint order_item_id FK
        bigint requested_by_employee_id FK
        string change_type
        string description
        string status
        bigint approved_by_employee_id FK
        timestamptz approved_at
        timestamptz created_at
    }

    accounts ||--o{ orders : "customer orders (1 Active Order Max)"
    contacts ||--o{ orders : "primary contact"
    orders ||--o{ order_items : "contains order items"
    deals ||--o{ order_items : "originating deal"
    employees ||--o{ order_items : "item closing sale"
    services ||--o{ order_items : "catalog service"
    service_requirement_templates ||--o{ order_items : "template snapshot"
    order_items ||--o{ order_item_requirements : "requirement value snapshots"
    service_requirement_fields ||--o{ order_item_requirements : "field reference"
    orders ||--o{ order_documents : "attached contracts"
    orders ||--o{ discount_requests : "discount proposals"
    discount_requests ||--o{ discount_request_items : "item discount breakdown"
    order_items ||--o{ discount_request_items : "target item"
    order_items ||--o{ order_item_dependencies : "dependent item"
    order_items ||--o{ order_item_dependencies : "prerequisite item"
    order_items ||--o{ change_requests : "scope change proposals"


    %% ============================================================================
    %% MODULE 6: PROJECT DELIVERY & PROGRESS (8 TABLES)
    %% ============================================================================

    projects {
        bigint id PK
        bigint order_item_id FK,UK "UNIQUE order_item_id"
        bigint project_template_id FK
        string project_name
        string status
        numeric materialized_progress_percent "DERIVED CACHE"
        timestamptz started_at
        timestamptz completed_at
        timestamptz created_at
        timestamptz updated_at
    }

    project_assignments {
        bigint id PK
        bigint project_id FK
        bigint employee_id FK
        string assignment_type "PRIMARY or SUPPORT"
        boolean is_active "Max 2 Active Primary"
        timestamptz assigned_at
        timestamptz unassigned_at
        string replacement_reason
    }

    project_milestones {
        bigint id PK
        bigint project_id FK
        string title
        numeric weight
        boolean is_completed
        timestamptz completed_at
        int sort_order
        timestamptz created_at
    }

    project_tasks {
        bigint id PK
        bigint milestone_id FK
        bigint assigned_to_employee_id FK
        string title
        numeric weight
        string status "TODO, IN_PROGRESS, BLOCKED, DONE"
        string blocked_reason
        timestamptz blocked_since
        timestamptz completed_at
        int sort_order
        timestamptz created_at
        timestamptz updated_at
    }

    project_comments {
        bigint id PK
        bigint project_id FK
        bigint author_employee_id FK
        string content
        timestamptz created_at
    }

    project_attachments {
        bigint id PK
        bigint project_id FK
        string file_title
        string file_url
        bigint uploaded_by_employee_id FK
        timestamptz uploaded_at
    }

    project_acceptances {
        bigint id PK
        bigint project_id FK
        bigint customer_contact_id FK
        string accepted_by_name
        timestamptz accepted_at
        string evidence_document
        bigint recorded_by_employee_id FK
        timestamptz created_at
    }

    project_credentials {
        bigint id PK
        bigint project_id FK
        string credential_type
        string ciphertext "ENCRYPTED VAULT"
        string nonce
        string auth_tag
        string key_version
        bigint updated_by_employee_id FK
        timestamptz updated_at
    }

    order_items ||--o| projects : "execution project (1-to-0..1 UNIQUE)"
    project_templates ||--o{ projects : "generated from template"
    projects ||--o{ project_assignments : "staff assignment history"
    employees ||--o{ project_assignments : "assigned dev/seo staff"
    projects ||--o{ project_milestones : "project milestones"
    project_milestones ||--o{ project_tasks : "project tasks"
    employees ||--o{ project_tasks : "assigned task performer"
    projects ||--o{ project_comments : "internal discussions"
    projects ||--o{ project_attachments : "design briefs and files"
    projects ||--o{ project_acceptances : "customer acceptance evidence"
    contacts ||--o{ project_acceptances : "customer accepted contact"
    employees ||--o{ project_acceptances : "recorded by employee"
    projects ||--o{ project_credentials : "secure vault"
    employees ||--o{ project_credentials : "updated by employee"


    %% ============================================================================
    %% MODULE 7: RECURRING SUBSCRIPTIONS & SEO (5 TABLES)
    %% ============================================================================

    subscriptions {
        bigint id PK
        bigint order_item_id FK,UK "UNIQUE order_item_id"
        bigint service_id FK
        string billing_interval
        int interval_count
        date start_date
        date end_date
        date renewal_date
        boolean auto_renew
        string status
        bigint previous_subscription_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    service_periods {
        bigint id PK
        bigint subscription_id FK
        int period_index "UNIQUE(subscription_id, period_index)"
        numeric period_net_value
        numeric vat_rate
        numeric vat_amount
        numeric gross_payable
        date start_date
        date end_date
        string execution_status
        string payment_status
        timestamptz created_at
    }

    service_period_assignments {
        bigint id PK
        bigint service_period_id FK
        bigint employee_id FK
        string assignment_type
        boolean is_active "Max 2 Active Primary"
        timestamptz assigned_at
        timestamptz unassigned_at
        string replacement_reason
    }

    service_period_acceptances {
        bigint id PK
        bigint service_period_id FK
        bigint customer_contact_id FK
        string accepted_by_name
        timestamptz accepted_at
        string evidence_document
        bigint recorded_by_employee_id FK
        timestamptz created_at
    }

    seo_articles {
        bigint id PK
        bigint service_period_id FK
        bigint author_employee_id FK
        string keyword
        string title
        string url
        bigint reviewer_employee_id FK
        timestamptz reviewed_at
        string status
        string kpi_period_id
        timestamptz deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    order_items ||--o| subscriptions : "recurring subscription (1-to-0..1 UNIQUE)"
    services ||--o{ subscriptions : "subscription service"
    subscriptions ||--o{ service_periods : "generic service periods"
    subscriptions ||--o{ subscriptions : "renewed from previous"
    service_periods ||--o{ service_period_assignments : "period staff assignment history"
    employees ||--o{ service_period_assignments : "assigned period staff"
    service_periods ||--o{ service_period_acceptances : "customer period acceptance evidence"
    contacts ||--o{ service_period_acceptances : "customer accepted contact"
    employees ||--o{ service_period_acceptances : "recorded by employee"
    service_periods ||--o{ seo_articles : "published articles"
    employees ||--o{ seo_articles : "article author"
    employees ||--o{ seo_articles : "article reviewer"


    %% ============================================================================
    %% MODULE 8: DAILY REPORTS & WORK LOGS (1 TABLE)
    %% ============================================================================

    daily_reports {
        bigint id PK
        bigint employee_id FK "UNIQUE(employee_id, report_date)"
        date report_date
        string difficulty
        string support_needed
        string next_plan
        string note
        timestamptz submitted_at
    }

    employees ||--o{ daily_reports : "submitted daily reports"


    %% ============================================================================
    %% MODULE 9: NEGOTIATED FINANCE & SETTLEMENTS (7 TABLES)
    %% ============================================================================

    order_item_payment_plans {
        bigint id PK
        bigint order_item_id FK "PARTIAL UNIQUE APPROVED"
        bigint template_id FK
        int version
        string status "DRAFT, APPROVED, SUPERSEDED, CANCELLED"
        bigint created_by_employee_id FK
        jsonb config_snapshot
        timestamptz approved_at
        timestamptz created_at
    }

    payment_installments {
        bigint id PK
        bigint payment_plan_id FK
        bigint service_period_id FK
        int installment_number
        date due_date
        numeric gross_amount_due
        string status
        timestamptz created_at
    }

    payments {
        bigint id PK
        string payment_code UK
        numeric gross_cash_amount "GROSS CASH RECEIVED"
        string payment_method
        string evidence_url
        bigint created_by_employee_id FK
        bigint confirmed_by_employee_id FK
        timestamptz confirmed_at
        string status
        timestamptz created_at
    }

    payment_allocations {
        bigint id PK
        bigint payment_id FK
        bigint order_item_id FK
        bigint installment_id FK
        bigint closing_sale_id FK
        numeric gross_allocated_amount
        numeric vat_allocated_amount
        numeric service_amount
        numeric net_eligible_amount "COMMISSION / KPI BASE"
        timestamptz confirmed_at
        timestamptz created_at
    }

    invoices {
        bigint id PK
        bigint order_id FK
        string invoice_number UK
        numeric total_amount
        numeric vat_amount
        timestamptz issued_at
        timestamptz created_at
    }

    invoice_items {
        bigint id PK
        bigint invoice_id FK
        bigint order_item_id FK
        numeric amount
        numeric vat_amount
    }

    order_item_settlements {
        bigint id PK
        bigint order_item_id FK,UK "UNIQUE order_item_id"
        numeric original_service_value
        numeric active_contract_value
        numeric cancelled_service_value
        numeric retained_amount "PARTIAL CANCELLATION BASE"
        numeric written_off_receivable
        bigint boss_confirmed_by_employee_id FK
        timestamptz boss_confirmed_at
        timestamptz created_at
    }

    order_items ||--o{ order_item_payment_plans : "payment plan version history"
    payment_plan_templates ||--o{ order_item_payment_plans : "template reference"
    order_item_payment_plans ||--o{ payment_installments : "negotiated installments"
    service_periods ||--o| payment_installments : "recurring period installment (0..1-to-0..1)"
    payments ||--o{ payment_allocations : "splits cash to items"
    order_items ||--o{ payment_allocations : "allocated order item"
    payment_installments ||--o{ payment_allocations : "allocated installment"
    employees ||--o{ payment_allocations : "closing sale attribution"
    employees ||--o{ payments : "created by employee"
    employees ||--o{ payments : "confirmed by employee (Boss)"
    orders ||--o{ invoices : "issued invoices"
    invoices ||--o{ invoice_items : "invoice line items"
    order_items ||--o{ invoice_items : "invoice item target"
    order_items ||--o| order_item_settlements : "settlement record (1-to-0..1 UNIQUE)"
    employees ||--o{ order_item_settlements : "boss confirmed by"


    %% ============================================================================
    %% MODULE 10: COMMISSION ENGINE (3 TABLES)
    %% ============================================================================

    commission_policies {
        bigint id PK
        string policy_name
        string policy_type "SALE, PROJECT_DELIVERY, TEAM_OVERRIDE"
        bigint service_id FK
        bigint position_id FK
        int assignee_count
        numeric rate
        string scope_key "STORED GENERATED EXCLUDE GIST"
        tstzrange effective_range "EXCLUDE GIST"
        timestamptz created_at
    }

    commissions {
        bigint id PK
        bigint policy_id FK
        bigint order_item_id FK
        bigint service_period_id FK
        bigint beneficiary_employee_id FK
        string commission_type
        numeric rate_snapshot
        numeric commission_base
        numeric calculated_amount
        numeric approved_amount
        bigint approved_by_employee_id FK
        string decision_reason
        string status
        timestamptz created_at
        timestamptz updated_at
    }

    commission_sources {
        bigint id PK
        bigint commission_id FK
        bigint payment_allocation_id FK "NULLABLE (STRICT FK)"
        bigint settlement_id FK "NULLABLE (STRICT FK)"
        numeric attributed_amount
        timestamptz created_at
    }

    services ||--o{ commission_policies : "service policy"
    positions ||--o{ commission_policies : "position policy"
    commission_policies ||--o{ commissions : "governed by policy"
    order_items ||--o{ commissions : "order item commission target"
    service_periods ||--o{ commissions : "recurring period commission target"
    employees ||--o{ commissions : "beneficiary employee"
    employees ||--o{ commissions : "approved by boss"
    commissions ||--o{ commission_sources : "traces sources"
    payment_allocations ||--o{ commission_sources : "1 allocation traces N commissions"
    order_item_settlements ||--o{ commission_sources : "1 settlement traces N commissions"


    %% ============================================================================
    %% MODULE 11: KPI ENGINE (3 TABLES)
    %% ============================================================================

    kpi_policies {
        bigint id PK
        string policy_name
        bigint position_id FK
        tstzrange effective_range
        timestamptz created_at
    }

    kpi_policy_tiers {
        bigint id PK
        bigint kpi_policy_id FK
        numeric min_threshold
        numeric max_threshold
        numeric reward_amount
        string tier_note
    }

    kpi_events {
        bigint id PK
        bigint employee_id FK
        bigint policy_id FK
        jsonb policy_snapshot_json
        string source_type
        bigint source_id
        string metric_type
        numeric metric_value
        numeric kpi_points
        numeric eligible_revenue
        string target_kpi_period
        timestamptz qualified_at
        timestamptz created_at
    }

    positions ||--o{ kpi_policies : "position kpi policy"
    kpi_policies ||--o{ kpi_policy_tiers : "reward tiers"
    kpi_policies ||--o{ kpi_events : "governed by policy"
    employees ||--o{ kpi_events : "performance events"


    %% ============================================================================
    %% MODULE 12: PAYROLL & EXPENSE DEDUPLICATION (5 TABLES)
    %% ============================================================================

    payroll_periods {
        bigint id PK
        string period_key UK "SINGLE SOURCE OF TRUTH"
        date start_date
        date end_date
        string status "OPEN, CALCULATING, REVIEW, APPROVED, LOCKED"
        timestamptz locked_at
        bigint locked_by_employee_id FK
        timestamptz created_at
        timestamptz updated_at
    }

    payrolls {
        bigint id PK
        bigint payroll_period_id FK "UNIQUE(payroll_period_id, employee_id)"
        bigint employee_id FK
        numeric base_salary
        numeric released_commission_amount
        numeric kpi_bonus_amount
        numeric team_override_amount
        numeric adjustment_amount
        numeric net_salary_amount
        timestamptz created_at
        timestamptz updated_at
    }

    payroll_items {
        bigint id PK
        bigint payroll_id FK
        string item_type
        numeric amount
        string description
        timestamptz created_at
    }

    payroll_adjustments {
        bigint id PK
        bigint target_payroll_id FK
        bigint origin_payroll_period_id FK
        numeric amount
        string reason
        bigint created_by_employee_id FK
        bigint approved_by_employee_id FK
        timestamptz created_at
    }

    expense_categories {
        bigint id PK
        string code UK
        string name
        string description
        timestamptz created_at
    }

    expenses {
        bigint id PK
        bigint category_id FK
        numeric amount
        date expense_date
        bigint created_by_employee_id FK
        bigint approved_by_employee_id FK
        string source_type
        bigint source_payroll_period_id FK "PARTIAL UNIQUE PAYROLL"
        string note
        timestamptz created_at
    }

    payroll_periods ||--o{ payrolls : "period payroll statements (LOCKED Trigger Protected)"
    employees ||--o{ payrolls : "employee pay statement"
    payrolls ||--o{ payroll_items : "pay breakdowns"
    payroll_periods ||--o{ payroll_adjustments : "origin payroll period"
    payrolls ||--o{ payroll_adjustments : "target payroll row"
    employees ||--o{ payroll_adjustments : "created by employee"
    employees ||--o{ payroll_adjustments : "approved by employee"
    expense_categories ||--o{ expenses : "categorized expense"
    employees ||--o{ expenses : "created by employee"
    employees ||--o{ expenses : "approved by employee"
    payroll_periods ||--o| expenses : "payroll expense source trace (PARTIAL UNIQUE)"


    %% ============================================================================
    %% MODULE 13: SYSTEM, NOTIFICATIONS, AUDIT & WEBHOOKS (3 TABLES)
    %% ============================================================================

    notifications {
        bigint id PK
        bigint employee_id FK
        string event_type
        string title
        string content
        string deep_link_url
        string entity_type
        bigint entity_id
        boolean is_read
        timestamptz created_at
    }

    webhook_events {
        bigint id PK
        string provider
        string external_event_id "UNIQUE(provider, external_event_id)"
        jsonb payload_json
        string status
        string processed_entity_type
        bigint processed_entity_id
        timestamptz received_at
        timestamptz processed_at
    }

    audit_logs {
        bigint id PK
        bigint actor_employee_id FK "NULLABLE for System"
        string actor_type "USER, SYSTEM, WEBHOOK, JOB"
        string action
        string entity_type
        bigint entity_id
        jsonb payload_before_sanitized "NO SECRETS"
        jsonb payload_after_sanitized "NO SECRETS"
        string ip_address
        timestamptz created_at
    }

    employees ||--o{ notifications : "recipient employee"
    employees ||--o{ audit_logs : "actor employee"
```
