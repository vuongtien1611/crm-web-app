CREATE INDEX IF NOT EXISTS idx_leads_assigned_sale_created_at
    ON leads (assigned_sale_id, created_at DESC)
    WHERE assigned_sale_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_creator_employee_id
    ON leads (creator_employee_id)
    WHERE creator_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_assignment_history_lead_assigned_at
    ON lead_assignment_history (lead_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_activities_employee_occurred_at
    ON sales_activities (employee_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_activities_lead_occurred_at
    ON sales_activities (lead_id, occurred_at DESC)
    WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_order_created_at
    ON order_items (order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_item_requirements_order_item_id
    ON order_item_requirements (order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_documents_order_id
    ON order_documents (order_id);
CREATE INDEX IF NOT EXISTS idx_discount_requests_order_status
    ON discount_requests (order_id, status);
CREATE INDEX IF NOT EXISTS idx_order_item_dependencies_prerequisite_item_id
    ON order_item_dependencies (prerequisite_item_id);
CREATE INDEX IF NOT EXISTS idx_change_requests_order_item_status
    ON change_requests (order_item_id, status);
CREATE INDEX IF NOT EXISTS idx_project_assignments_active_project
    ON project_assignments (project_id, employee_id)
    WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_project_assignments_active_employee
    ON project_assignments (employee_id, project_id)
    WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_project_milestones_project_id
    ON project_milestones (project_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_milestone_id
    ON project_tasks (milestone_id);
CREATE INDEX IF NOT EXISTS idx_project_tasks_assigned_employee_status
    ON project_tasks (assigned_to_employee_id, status)
    WHERE assigned_to_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_project_comments_project_created_at
    ON project_comments (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_attachments_project_id
    ON project_attachments (project_id);
CREATE INDEX IF NOT EXISTS idx_project_credentials_project_id
    ON project_credentials (project_id);
CREATE INDEX IF NOT EXISTS idx_service_period_assignments_active_period
    ON service_period_assignments (service_period_id, employee_id)
    WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_service_period_assignments_active_employee
    ON service_period_assignments (employee_id, service_period_id)
    WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_seo_articles_period_status_created_at
    ON seo_articles (service_period_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_installments_payment_plan_id
    ON payment_installments (payment_plan_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_payment_id
    ON payment_allocations (payment_id);
CREATE INDEX IF NOT EXISTS idx_payment_allocations_installment_id
    ON payment_allocations (installment_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order_id
    ON invoices (order_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id
    ON invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_order_item_id
    ON invoice_items (order_item_id);
CREATE INDEX IF NOT EXISTS idx_commissions_beneficiary_status_created_at
    ON commissions (beneficiary_employee_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payrolls_employee_period
    ON payrolls (employee_id, payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_payroll_items_payroll_id
    ON payroll_items (payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_target_payroll_id
    ON payroll_adjustments (target_payroll_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adjustments_origin_period_id
    ON payroll_adjustments (origin_payroll_period_id);
CREATE INDEX IF NOT EXISTS idx_notifications_employee_unread_created_at
    ON notifications (employee_id, created_at DESC)
    WHERE is_read = FALSE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at
    ON audit_logs (actor_employee_id, created_at DESC)
    WHERE actor_employee_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_created_at
    ON audit_logs (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_user
    ON user_roles (role_id, user_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_role
    ON role_permissions (permission_id, role_id);
