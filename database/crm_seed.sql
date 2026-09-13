-- ============================================================================
-- CRM SYSTEM MASTER & REFERENCE DATA SEED SCRIPT
-- Target Schema: PostgreSQL DDL Schema V4.2 (crm_order_schema.sql)
-- Version: V4.5 (Final Convergent & Audited Seed)
--
-- Principles:
-- - Convergent Execution: Safe to re-run multiple times; updates existing master/reference
--   data to canonical configuration and removes deprecated mappings without creating duplicate rows.
-- - Zero Demo Business Data: NO fake Orders, Payments, Commissions, or KPI Events.
-- - Strict Business Flow Alignment: Seeds ONLY Confirmed Business Rules.
-- - Sale Commission Base & Release Convention:
--   * NORMAL SERVICE:
--     - COMMISSION BASE = order_items.net_service_value (after approved discount, pre-VAT).
--     - RELEASE CONDITION: Customer Acceptance / Completed AND Order Item FULLY_PAID.
--       -> Status transitions: UNEARNED -> RELEASED.
--       -> Payment Confirmation alone DOES NOT release normal Sale Commission.
--          (e.g., Order Item = 10M, Paid = 10M, Customer Acceptance not yet recorded
--           -> FULLY_PAID = TRUE, but Sale Commission remains UNEARNED until Customer Acceptance).
--   * RECURRING SERVICE (SEO):
--     - COMMISSION BASE = service_period.period_net_value.
--     - RELEASE CONDITION: ServicePeriod ACCEPTED AND ServicePeriod FULLY_PAID
--       -> Period Sale Commission RELEASED.
--   * PARTIAL CANCELLATION:
--     - COMMISSION BASE = settlement.retained_amount.
--     - RELEASE CONDITION: Boss Settlement Confirmed AND retained_amount > 0
--       -> RELEASED according to cancellation rules.
--   * Payment allocations / net_eligible_amount are strictly used for payment eligibility trigger,
--     Sale KPI cash revenue, Team Leader Override, attribution, and audit source tracing.
-- - 5 Open Business Rules: Explicitly NOT SEEDED with warning comments.
-- ============================================================================

-- ============================================================================
-- 0. DEPRECATED DATA CLEANUP (Convergent Cleanup for Schema Updates)
-- ============================================================================
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE code = 'PROJECT_UPDATE_PROGRESS'
);

DELETE FROM permissions
WHERE code = 'PROJECT_UPDATE_PROGRESS';


-- ============================================================================
-- 1. POSITIONS (6 Core Positions)
-- ============================================================================
INSERT INTO positions (code, name, description) VALUES
('BOSS', 'Giám Đốc Điều Hành', 'Ban quản trị tối cao, người duyệt cuối cùng mọi thanh toán, hợp đồng và chính sách'),
('ACCOUNTANT', 'Kế Toán Trưởng / Kế Toán Viên', 'Phụ trách tạo thanh toán, quản lý hóa đơn và chi phí tài chính'),
('SALE', 'Chuyên Viên Kinh Doanh', 'Nhân viên tư vấn, tìm kiếm khách hàng và chốt đơn hàng'),
('SALES_TEAM_LEADER', 'Trưởng Nhóm Kinh Doanh', 'Quản lý nhóm kinh doanh, phân bổ lead và theo dõi tiến độ team'),
('DEV', 'Lập Trình Viên / Kỹ Thuật Dự Án', 'Chuyên viên kỹ thuật chịu trách nhiệm triển khai và hoàn thành dự án Website/Phần mềm'),
('SEO', 'Chuyên Viên SEO / Content', 'Chuyên viên tối ưu hóa công cụ tìm kiếm và sản xuất bài viết chuẩn SEO')
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name, 
    description = EXCLUDED.description;


-- ============================================================================
-- 2. ROLES (7 Core Technical Roles)
-- ============================================================================
INSERT INTO roles (code, name, description) VALUES
('ADMIN', 'System Administrator', 'Toàn quyền quản trị hệ thống kỹ thuật và cấu hình phân quyền'),
('BOSS', 'Executive Director', 'Toàn quyền phê duyệt kinh doanh, tài chính, hoa hồng, lương và nghiệm thu'),
('ACCOUNTANT', 'Accountant', 'Chuyên viên tài chính kế toán - Tạo thanh toán, hóa đơn và ghi nhận chi phí'),
('SALE', 'Sales Representative', 'Chuyên viên kinh doanh - Quản lý Lead, Deal, Order và hoạt động bán hàng cá nhân'),
('SALES_TEAM_LEADER', 'Sales Team Leader', 'Trưởng nhóm kinh doanh - Quản lý phân bổ Lead và báo cáo doanh số nhóm'),
('DEV_TEAM_LEADER', 'Dev Team Leader', 'Trưởng nhóm kỹ thuật lập trình - Phân công dự án, theo dõi task và tiến độ nhóm'),
('DEV', 'Software Developer', 'Kỹ thuật viên - Theo dõi và cập nhật tiến độ công việc dự án được phân công'),
('SEO_TEAM_LEADER', 'SEO Team Leader', 'Trưởng nhóm SEO - Phân công dự án SEO, theo dõi tiến độ và doanh số thực thu nhóm'),
('SEO', 'SEO Specialist', 'Chuyên viên SEO - Theo dõi và thực hiện công việc dự án SEO được phân công')
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name, 
    description = EXCLUDED.description;


-- ============================================================================
-- 3. PERMISSIONS (69 Semantic Capabilities across 26 Functional Modules)
-- NOTE: PROJECT_UPDATE_PROGRESS is REMOVED as progress_percent is CACHE DERIVED
-- ============================================================================
INSERT INTO permissions (code, name, module, description) VALUES
-- AUTH
('AUTH_LOGIN', 'Đăng nhập hệ thống', 'AUTH', 'Quyền đăng nhập vào giao diện làm việc'),
('AUTH_RESET_PASSWORD', 'Đặt lại mật khẩu', 'AUTH', 'Quyền yêu cầu đổi mật khẩu cá nhân'),

-- EMPLOYEE & HR
('EMPLOYEE_READ', 'Xem danh sách nhân viên', 'EMPLOYEE', 'Quyền xem hồ sơ và danh sách nhân viên'),
('EMPLOYEE_CREATE', 'Tạo mới nhân viên', 'EMPLOYEE', 'Quyền thêm nhân viên mới vào hệ thống'),
('EMPLOYEE_UPDATE', 'Cập nhật nhân viên', 'EMPLOYEE', 'Quyền chỉnh sửa thông tin hồ sơ nhân viên'),
('EMPLOYEE_DELETE', 'Vô hiệu hóa nhân viên', 'EMPLOYEE', 'Quyền ngưng hoạt động nhân viên'),

-- TEAM MANAGEMENT
('TEAM_READ', 'Xem thông tin Team', 'TEAM', 'Quyền xem danh sách và thành viên Team'),
('TEAM_CREATE', 'Tạo Team mới', 'TEAM', 'Quyền tạo nhóm kinh doanh mới'),
('TEAM_UPDATE', 'Cập nhật Team', 'TEAM', 'Quyền sửa đổi thông tin nhóm kinh doanh'),
('TEAM_ASSIGN_MEMBER', 'Phân bổ thành viên Team', 'TEAM', 'Quyền gán/điều chuyển nhân viên vào Team'),

-- LEAD MANAGEMENT
('LEAD_READ', 'Xem danh sách Lead', 'LEAD', 'Quyền xem thông tin Lead được phân công hoặc toàn nhóm'),
('LEAD_CREATE', 'Tạo mới Lead', 'LEAD', 'Quyền nhập Lead mới vào hệ thống'),
('LEAD_UPDATE', 'Cập nhật Lead', 'LEAD', 'Quyền chỉnh sửa thông tin và trạng thái Lead'),
('LEAD_ASSIGN', 'Phân bổ Lead', 'LEAD', 'Quyền gán Lead cho nhân viên kinh doanh'),
('LEAD_QUALIFY', 'Đánh giá chất lượng Lead', 'LEAD', 'Quyền phân loại POTENTIAL / NOT_POTENTIAL'),

-- SALES CONTENT
('CONTENT_READ', 'Xem nội dung bài tiếp thị', 'CONTENT', 'Quyền xem thông tin Sales Content'),
('CONTENT_CREATE', 'Tạo nội dung tiếp thị', 'CONTENT', 'Quyền xuất bản bài tiếp thị thu Lead'),

-- DEAL MANAGEMENT
('DEAL_READ', 'Xem thông tin Cơ hội kinh doanh', 'DEAL', 'Quyền xem Deal bán hàng'),
('DEAL_CREATE', 'Tạo mới Cơ hội kinh doanh', 'DEAL', 'Quyền chuyển Lead thành Deal'),
('DEAL_UPDATE', 'Cập nhật Deal', 'DEAL', 'Quyền điều chỉnh giá trị và giai đoạn đàm phán Deal'),
('DEAL_CLOSE', 'Chốt Deal (Won/Lost)', 'DEAL', 'Quyền đóng Deal thành công hoặc thất bại'),

-- CUSTOMER MANAGEMENT
('CUSTOMER_ACCOUNT_READ', 'Xem thông tin Doanh nghiệp', 'CUSTOMER', 'Quyền xem Hồ sơ Doanh nghiệp khách hàng'),
('CUSTOMER_ACCOUNT_CREATE', 'Tạo mới Doanh nghiệp', 'CUSTOMER', 'Quyền thêm Doanh nghiệp khách hàng'),
('CUSTOMER_ACCOUNT_UPDATE', 'Cập nhật Doanh nghiệp', 'CUSTOMER', 'Quyền sửa đổi hồ sơ Doanh nghiệp'),
('CUSTOMER_CONTACT_READ', 'Xem thông tin Người liên hệ', 'CUSTOMER', 'Quyền xem danh sách Contact khách hàng'),
('CUSTOMER_CONTACT_CREATE', 'Tạo mới Người liên hệ', 'CUSTOMER', 'Quyền thêm Contact khách hàng'),

-- ORDER MANAGEMENT
('ORDER_READ', 'Xem đơn hàng', 'ORDER', 'Quyền xem danh sách đơn hàng'),
('ORDER_CREATE', 'Tạo đơn hàng DRAFT', 'ORDER', 'Quyền lên đơn hàng nháp'),
('ORDER_SUBMIT', 'Gửi duyệt đơn hàng', 'ORDER', 'Quyền gửi đơn hàng lên cấp trên phê duyệt'),
('ORDER_CANCEL', 'Hủy đơn hàng', 'ORDER', 'Quyền hủy bỏ đơn hàng'),

-- ORDER APPROVAL
('ORDER_APPROVE', 'Phê duyệt đơn hàng', 'ORDER_APPROVAL', 'Quyền phê duyệt chính thức đơn hàng'),
('ORDER_REJECT', 'Từ chối đơn hàng', 'ORDER_APPROVAL', 'Quyền từ chối phê duyệt đơn hàng'),

-- DISCOUNT APPROVAL
('DISCOUNT_REQUEST_CREATE', 'Tạo yêu cầu chiết khấu', 'DISCOUNT', 'Quyền gửi yêu cầu giảm giá đơn hàng'),
('DISCOUNT_APPROVE', 'Phê duyệt chiết khấu', 'DISCOUNT', 'Quyền phê duyệt tỷ lệ giảm giá'),
('DISCOUNT_REJECT', 'Từ chối chiết khấu', 'DISCOUNT', 'Quyền từ chối mức giảm giá'),

-- PROJECT DELIVERY
('PROJECT_READ', 'Xem tiến độ dự án', 'PROJECT', 'Quyền xem tiến độ công việc và Milestone dự án'),
('PROJECT_CREATE', 'Khởi tạo dự án', 'PROJECT', 'Quyền sinh dự án từ đơn hàng dịch vụ'),
('PROJECT_UPDATE_STATUS', 'Cập nhật trạng thái dự án', 'PROJECT', 'Quyền thay đổi trạng thái triển khai dự án'),
('PROJECT_TASK_UPDATE', 'Cập nhật Task dự án', 'PROJECT', 'Quyền đánh dấu hoàn thành Task công việc'),

-- PROJECT ASSIGNMENT
('PROJECT_ASSIGN', 'Phân công kỹ thuật dự án', 'PROJECT_ASSIGNMENT', 'Quyền gán Dev Primary/Support vào dự án'),
('PROJECT_UNASSIGN', 'Hủy phân công kỹ thuật', 'PROJECT_ASSIGNMENT', 'Quyền tháo gỡ Dev khỏi dự án'),

-- PROJECT ACCEPTANCE
('PROJECT_ACCEPTANCE_RECORD', 'Ghi nhận Nghiệm thu dự án', 'PROJECT_ACCEPTANCE', 'Quyền ghi nhận biên bản nghiệm thu khách hàng'),

-- SEO MANAGEMENT
('SEO_ARTICLE_READ', 'Xem bài viết SEO', 'SEO', 'Quyền xem danh sách bài viết SEO'),
('SEO_ARTICLE_CREATE', 'Viết bài SEO mới', 'SEO', 'Quyền tạo bài viết SEO theo kỳ dịch vụ'),
('SEO_ARTICLE_UPDATE', 'Sửa bài viết SEO', 'SEO', 'Quyền cập nhật nội dung bài viết SEO'),
('SEO_ARTICLE_SUBMIT', 'Gửi duyệt bài viết SEO', 'SEO', 'Quyền nộp bài SEO lên cấp phê duyệt'),

-- SEO REVIEW
('SEO_ARTICLE_REVIEW', 'Duyệt bài viết SEO', 'SEO_REVIEW', 'Quyền đánh giá nghiệm thu chất lượng bài SEO'),
('SEO_ARTICLE_PUBLISH', 'Xuất bản bài viết SEO', 'SEO_REVIEW', 'Quyền ghi nhận bài SEO hợp lệ tính KPI'),

-- PAYMENT MANAGEMENT
('PAYMENT_CREATE', 'Tạo giao dịch thanh toán', 'PAYMENT', 'Quyền nhập thông tin tiền thu từ khách hàng'),
('PAYMENT_READ', 'Xem giao dịch thanh toán', 'PAYMENT', 'Quyền xem danh sách khoản tiền thu'),
('PAYMENT_REJECT', 'Từ chối giao dịch thanh toán', 'PAYMENT', 'Quyền từ chối chứng từ thanh toán'),

-- PAYMENT CONFIRMATION
('PAYMENT_CONFIRM', 'Xác nhận thu tiền (Boss Confirm)', 'PAYMENT_CONFIRM', 'Quyền Boss xác nhận tiền vào tài khoản để ghi nhận doanh số'),

-- INVOICE MANAGEMENT
('INVOICE_READ', 'Xem hóa đơn', 'INVOICE', 'Quyền xem hóa đơn tài chính'),
('INVOICE_CREATE', 'Xuất hóa đơn', 'INVOICE', 'Quyền lập hóa đơn cho đơn hàng'),

-- COMMISSION ENGINE
('COMMISSION_READ', 'Xem hoa hồng nhân viên', 'COMMISSION', 'Quyền xem bảng tính hoa hồng'),
('COMMISSION_ADJUST', 'Điều chỉnh hoa hồng', 'COMMISSION', 'Quyền điều chỉnh số tiền hoa hồng thủ công'),

-- COMMISSION APPROVAL
('COMMISSION_APPROVE', 'Phê duyệt hoa hồng', 'COMMISSION_APPROVE', 'Quyền Boss duyệt giải ngân hoa hồng'),
('COMMISSION_REJECT', 'Bác bỏ hoa hồng', 'COMMISSION_APPROVE', 'Quyền từ chối hoa hồng'),

-- KPI ENGINE
('KPI_READ', 'Xem kết quả KPI', 'KPI', 'Quyền xem bảng tính điểm và thưởng KPI'),
('KPI_CALCULATE', 'Tính toán KPI kỳ', 'KPI', 'Quyền chốt kết quả KPI hàng tháng'),

-- PAYROLL ENGINE
('PAYROLL_READ', 'Xem bảng lương', 'PAYROLL', 'Quyền xem phiếu lương nhân viên'),
('PAYROLL_CALCULATE', 'Tính toán bảng lương', 'PAYROLL', 'Quyền lập bảng lương tháng'),
('PAYROLL_REVIEW', 'Rà soát bảng lương', 'PAYROLL', 'Quyền thẩm định các khoản cộng trừ lương'),
('PAYROLL_APPROVE', 'Duyệt bảng lương', 'PAYROLL', 'Quyền phê duyệt bảng lương chính thức'),
('PAYROLL_LOCK', 'Khóa kỳ lương (Payroll Lock)', 'PAYROLL', 'Quyền chốt khóa bất biến dữ liệu lương kỳ'),

-- EXPENSE MANAGEMENT
('EXPENSE_READ', 'Xem chi phí doanh nghiệp', 'EXPENSE', 'Quyền xem danh mục chi phí'),
('EXPENSE_CREATE', 'Tạo khoản chi mới', 'EXPENSE', 'Quyền nhập khoản chi phí vận hành'),
('EXPENSE_APPROVE', 'Duyệt chi', 'EXPENSE', 'Quyền duyệt xuất quỹ chi trả'),

-- REPORTING & AUDIT
('REPORT_SALES_READ', 'Xem báo cáo kinh doanh', 'REPORT', 'Quyền xem báo cáo doanh số & lead'),
('REPORT_FINANCE_READ', 'Xem báo cáo tài chính', 'REPORT', 'Quyền xem báo cáo dòng tiền & thu chi'),
('REPORT_PROJECT_READ', 'Xem báo cáo dự án', 'REPORT', 'Quyền xem báo cáo tiến độ kỹ thuật'),
('REPORT_KPI_READ', 'Xem báo cáo KPI', 'REPORT', 'Quyền xem thống kê hiệu suất nhân sự'),
('AUDIT_READ', 'Xem nhật ký hệ thống (Audit Log)', 'AUDIT', 'Quyền tra cứu lịch sử thao tác hệ thống'),

-- SYSTEM CONFIG
('SYSTEM_CONFIG_READ', 'Xem cấu hình hệ thống', 'SYSTEM_CONFIG', 'Quyền xem tham số kỹ thuật'),
('SYSTEM_CONFIG_UPDATE', 'Sửa cấu hình hệ thống', 'SYSTEM_CONFIG', 'Quyền thay đổi cài đặt hệ thống')
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name, 
    module = EXCLUDED.module,
    description = EXCLUDED.description;


-- ============================================================================
-- 4. ROLE PERMISSIONS MAPPING (Strict Convergent Mapping for 7 Core Roles)
-- ============================================================================

-- A. ADMIN: Full System Technical Capability (69 Permissions)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'ADMIN';

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

-- B. BOSS: Business Approvals, Finance Confirm/Create, Commission, Payroll, Reports (39 Permissions)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'BOSS'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'EMPLOYEE_READ', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE',
    'TEAM_READ', 'TEAM_CREATE', 'TEAM_UPDATE', 'TEAM_ASSIGN_MEMBER',
    'LEAD_READ', 'LEAD_ASSIGN', 'LEAD_QUALIFY',
    'DEAL_READ', 'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_CONTACT_READ',
    'ORDER_READ', 'ORDER_APPROVE', 'ORDER_REJECT',
    'DISCOUNT_APPROVE', 'DISCOUNT_REJECT',
    'PROJECT_READ', 'PROJECT_ASSIGN', 'PROJECT_UNASSIGN', 'PROJECT_ACCEPTANCE_RECORD',
    'SEO_ARTICLE_READ', 'SEO_ARTICLE_REVIEW', 'SEO_ARTICLE_PUBLISH',
    'PAYMENT_CREATE', 'PAYMENT_READ', 'PAYMENT_CONFIRM', 'PAYMENT_REJECT',
    'INVOICE_READ', 'COMMISSION_READ', 'COMMISSION_ADJUST', 'COMMISSION_APPROVE', 'COMMISSION_REJECT',
    'KPI_READ', 'KPI_CALCULATE',
    'PAYROLL_READ', 'PAYROLL_CALCULATE', 'PAYROLL_REVIEW', 'PAYROLL_APPROVE', 'PAYROLL_LOCK',
    'EXPENSE_READ', 'EXPENSE_APPROVE',
    'REPORT_SALES_READ', 'REPORT_FINANCE_READ', 'REPORT_PROJECT_READ', 'REPORT_KPI_READ',
    'AUDIT_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'BOSS' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'EMPLOYEE_READ', 'EMPLOYEE_CREATE', 'EMPLOYEE_UPDATE',
    'TEAM_READ', 'TEAM_CREATE', 'TEAM_UPDATE', 'TEAM_ASSIGN_MEMBER',
    'LEAD_READ', 'LEAD_ASSIGN', 'LEAD_QUALIFY',
    'DEAL_READ', 'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_CONTACT_READ',
    'ORDER_READ', 'ORDER_APPROVE', 'ORDER_REJECT',
    'DISCOUNT_APPROVE', 'DISCOUNT_REJECT',
    'PROJECT_READ', 'PROJECT_ASSIGN', 'PROJECT_UNASSIGN', 'PROJECT_ACCEPTANCE_RECORD',
    'SEO_ARTICLE_READ', 'SEO_ARTICLE_REVIEW', 'SEO_ARTICLE_PUBLISH',
    'PAYMENT_CREATE', 'PAYMENT_READ', 'PAYMENT_CONFIRM', 'PAYMENT_REJECT',
    'INVOICE_READ', 'COMMISSION_READ', 'COMMISSION_ADJUST', 'COMMISSION_APPROVE', 'COMMISSION_REJECT',
    'KPI_READ', 'KPI_CALCULATE',
    'PAYROLL_READ', 'PAYROLL_CALCULATE', 'PAYROLL_REVIEW', 'PAYROLL_APPROVE', 'PAYROLL_LOCK',
    'EXPENSE_READ', 'EXPENSE_APPROVE',
    'REPORT_SALES_READ', 'REPORT_FINANCE_READ', 'REPORT_PROJECT_READ', 'REPORT_KPI_READ',
    'AUDIT_READ'
)
ON CONFLICT DO NOTHING;

-- C. ACCOUNTANT: Payments Creation, Invoices, Expenses, Payroll Calculation (16 Permissions - NO PAYMENT_CONFIRM)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'ACCOUNTANT'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'EMPLOYEE_READ', 'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_CONTACT_READ',
    'ORDER_READ', 'PAYMENT_CREATE', 'PAYMENT_READ',
    'INVOICE_READ', 'INVOICE_CREATE',
    'EXPENSE_READ', 'EXPENSE_CREATE',
    'PAYROLL_READ', 'PAYROLL_CALCULATE', 'PAYROLL_REVIEW',
    'REPORT_FINANCE_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'ACCOUNTANT' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'EMPLOYEE_READ', 'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_CONTACT_READ',
    'ORDER_READ', 'PAYMENT_CREATE', 'PAYMENT_READ',
    'INVOICE_READ', 'INVOICE_CREATE',
    'EXPENSE_READ', 'EXPENSE_CREATE',
    'PAYROLL_READ', 'PAYROLL_CALCULATE', 'PAYROLL_REVIEW',
    'REPORT_FINANCE_READ'
)
ON CONFLICT DO NOTHING;

-- D. SALE: Lead/Deal/Order/Activity within Sales Scope (25 Permissions - NO PAYMENT_CREATE)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'SALE'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'LEAD_READ', 'LEAD_CREATE', 'LEAD_UPDATE', 'LEAD_QUALIFY',
    'CONTENT_READ', 'CONTENT_CREATE',
    'DEAL_READ', 'DEAL_CREATE', 'DEAL_UPDATE', 'DEAL_CLOSE',
    'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_ACCOUNT_CREATE', 'CUSTOMER_ACCOUNT_UPDATE',
    'CUSTOMER_CONTACT_READ', 'CUSTOMER_CONTACT_CREATE',
    'ORDER_READ', 'ORDER_CREATE', 'ORDER_SUBMIT',
    'DISCOUNT_REQUEST_CREATE', 'PROJECT_READ', 'COMMISSION_READ', 'KPI_READ',
    'REPORT_SALES_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SALE' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'LEAD_READ', 'LEAD_CREATE', 'LEAD_UPDATE', 'LEAD_QUALIFY',
    'CONTENT_READ', 'CONTENT_CREATE',
    'DEAL_READ', 'DEAL_CREATE', 'DEAL_UPDATE', 'DEAL_CLOSE',
    'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_ACCOUNT_CREATE', 'CUSTOMER_ACCOUNT_UPDATE',
    'CUSTOMER_CONTACT_READ', 'CUSTOMER_CONTACT_CREATE',
    'ORDER_READ', 'ORDER_CREATE', 'ORDER_SUBMIT',
    'DISCOUNT_REQUEST_CREATE', 'PROJECT_READ', 'COMMISSION_READ', 'KPI_READ',
    'REPORT_SALES_READ'
)
ON CONFLICT DO NOTHING;

-- E. SALES_TEAM_LEADER: Sale Capabilities + Team Lead Assignment + Team Reports (29 Permissions - NO PAYMENT_CREATE)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'SALES_TEAM_LEADER'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'TEAM_READ', 'LEAD_READ', 'LEAD_CREATE', 'LEAD_UPDATE', 'LEAD_ASSIGN', 'LEAD_QUALIFY',
    'CONTENT_READ', 'CONTENT_CREATE',
    'DEAL_READ', 'DEAL_CREATE', 'DEAL_UPDATE', 'DEAL_CLOSE',
    'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_ACCOUNT_CREATE', 'CUSTOMER_ACCOUNT_UPDATE',
    'CUSTOMER_CONTACT_READ', 'CUSTOMER_CONTACT_CREATE',
    'ORDER_READ', 'ORDER_CREATE', 'ORDER_SUBMIT',
    'DISCOUNT_REQUEST_CREATE', 'PROJECT_READ', 'COMMISSION_READ', 'KPI_READ',
    'REPORT_SALES_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SALES_TEAM_LEADER' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'TEAM_READ', 'LEAD_READ', 'LEAD_CREATE', 'LEAD_UPDATE', 'LEAD_ASSIGN', 'LEAD_QUALIFY',
    'CONTENT_READ', 'CONTENT_CREATE',
    'DEAL_READ', 'DEAL_CREATE', 'DEAL_UPDATE', 'DEAL_CLOSE',
    'CUSTOMER_ACCOUNT_READ', 'CUSTOMER_ACCOUNT_CREATE', 'CUSTOMER_ACCOUNT_UPDATE',
    'CUSTOMER_CONTACT_READ', 'CUSTOMER_CONTACT_CREATE',
    'ORDER_READ', 'ORDER_CREATE', 'ORDER_SUBMIT',
    'DISCOUNT_REQUEST_CREATE', 'PROJECT_READ', 'COMMISSION_READ', 'KPI_READ',
    'REPORT_SALES_READ'
)
ON CONFLICT DO NOTHING;

-- F. DEV: Project Tasks, Status Updates & Personal Commission (NO PAYMENT, NO PAYROLL)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'DEV'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'DEV' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
)
ON CONFLICT DO NOTHING;

-- F2. DEV_TEAM_LEADER: Dev Capabilities + Project Assignment & Team Read
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'DEV_TEAM_LEADER'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'PROJECT_ASSIGN', 'PROJECT_UNASSIGN', 'PROJECT_CREATE',
    'TEAM_READ', 'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'DEV_TEAM_LEADER' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'PROJECT_ASSIGN', 'PROJECT_UNASSIGN', 'PROJECT_CREATE',
    'TEAM_READ', 'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
)
ON CONFLICT DO NOTHING;

-- G. SEO: SEO Project Tasks & Personal Commission (NO CMS/article management)
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'SEO'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SEO' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
)
ON CONFLICT DO NOTHING;

-- G2. SEO_TEAM_LEADER: SEO Project Assignment, Team Read & Revenue Tracking
DELETE FROM role_permissions rp
USING roles r, permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code = 'SEO_TEAM_LEADER'
  AND p.code NOT IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'PROJECT_ASSIGN', 'PROJECT_UNASSIGN',
    'TEAM_READ', 'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
  );

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r CROSS JOIN permissions p
WHERE r.code = 'SEO_TEAM_LEADER' AND p.code IN (
    'AUTH_LOGIN', 'AUTH_RESET_PASSWORD',
    'PROJECT_READ', 'PROJECT_UPDATE_STATUS', 'PROJECT_TASK_UPDATE',
    'PROJECT_ASSIGN', 'PROJECT_UNASSIGN',
    'TEAM_READ', 'CUSTOMER_CONTACT_READ', 'KPI_READ', 'REPORT_PROJECT_READ', 'COMMISSION_READ'
)
ON CONFLICT DO NOTHING;


-- ============================================================================
-- 5. PLATFORMS (5 Core Marketing Platforms)
-- ============================================================================
INSERT INTO platforms (code, name, is_active) VALUES
('FACEBOOK', 'Facebook Ads & Fanpage', TRUE),
('TIKTOK', 'TikTok Ads & Shop', TRUE),
('GOOGLE', 'Google Search & Display Ads', TRUE),
('WEBSITE', 'Website Landing Page Direct', TRUE),
('ZALO', 'Zalo Official Account & Ads', TRUE)
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name, 
    is_active = EXCLUDED.is_active;


-- ============================================================================
-- 6. CHANNELS (5 Core Acquisition Channels)
-- ============================================================================
INSERT INTO channels (code, name, is_active) VALUES
('ORGANIC', 'SEO & Organic Content Search', TRUE),
('PAID_ADS', 'Quảng Cáo Trả Phí', TRUE),
('REFERRAL', 'Khách Hàng Giới Thiệu', TRUE),
('DIRECT', 'Khách Hàng Tìm Đến Trực Tiếp', TRUE),
('MANUAL', 'Nhập Thủ Công Từ Outreach/Telesale', TRUE)
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name, 
    is_active = EXCLUDED.is_active;


-- ============================================================================
-- 7. SERVICES CATALOG (9 Standard Services)
-- ============================================================================
INSERT INTO services (code, name, service_type, description, is_active) VALUES
('WEB', 'Thiết Kế & Lập Trình Website Doanh Nghiệp', 'PROJECT', 'Dịch vụ thiết kế và lập trình website trọn gói theo yêu cầu', TRUE),
('SEO', 'Dịch Vụ SEO Website Tổng Thể', 'RECURRING', 'Dịch vụ tối ưu hóa công cụ tìm kiếm và đẩy từ khóa duy trì theo tháng/quý', TRUE),
('FACEBOOK_ADS', 'Quản Lý Quảng Cáo Facebook', 'RECURRING', 'Dịch vụ chạy và tối ưu hóa chiến dịch quảng cáo Facebook Ads', TRUE),
('GOOGLE_ADS', 'Quản Lý Quảng Cáo Google Ads', 'RECURRING', 'Dịch vụ tư vấn và vận hành quảng cáo Google Search/Shopping', TRUE),
('TIKTOK_ADS', 'Quản Lý Quảng Cáo TikTok Ads', 'RECURRING', 'Dịch vụ chạy quảng cáo video và gian hàng TikTok Shop', TRUE),
('HOSTING', 'Cho Thụe & Quản Trị Server/Hosting', 'RECURRING', 'Dịch vụ lưu trữ dữ liệu website và hạ tầng máy chủ', TRUE),
('DOMAIN', 'Đăng Ký & Duy Trì Tên Miền', 'RECURRING', 'Dịch vụ duy trì tên miền thương hiệu doanh nghiệp', TRUE),
('MAINTENANCE', 'Bảo Trì & Nâng Cấp Website', 'PROJECT', 'Dịch vụ kiểm tra, sửa lỗi và nâng cấp tính năng website', TRUE),
('SOFTWARE', 'Phát Triển Phần Mềm Theo Yêu Cầu', 'PROJECT', 'Dịch vụ phân tích, thiết kế và lập trình phần mềm doanh nghiệp', TRUE)
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name, 
    service_type = EXCLUDED.service_type,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active;


-- ============================================================================
-- 8. EXPENSE CATEGORIES (13 Operating Expense Categories)
-- ============================================================================
INSERT INTO expense_categories (code, name, description) VALUES
('SALARY_PAYROLL', 'Chi Phí Lương & Hoa Hồng Nhân Viên', 'Khoản chi trả lương cố định, thưởng KPI và hoa hồng kinh doanh'),
('OFFICE_RENT', 'Chi Phí Thuê Văn Phòng', 'Khoản chi thuê mặt bằng làm việc định kỳ hàng tháng'),
('ELECTRICITY', 'Chi Phí Điện Vận Hành', 'Khoản chi trả tiền điện văn phòng'),
('WATER', 'Chi Phí Nước Sinh Hoạt', 'Khoản chi trả tiền nước văn phòng'),
('INTERNET', 'Chi Phí Mạng Internet & Viễn Thông', 'Khoản chi trả cước internet và tổng đài điện thoại'),
('FACEBOOK_ADS', 'Chi Phí Chạy Quảng Cáo Facebook', 'Khoản nạp tiền trả cho Facebook Ads Manager'),
('GOOGLE_ADS', 'Chi Phí Chạy Quảng Cáo Google', 'Khoản nạp tiền trả cho Google Ads Billing'),
('TIKTOK_ADS', 'Chi Phí Chạy Quảng Cáo TikTok', 'Khoản nạp tiền trả cho TikTok Ads Manager'),
('SOFTWARE', 'Chi Phí Phần Mềm & Bản Quyền Tool', 'Khoản chi mua phần mềm làm việc, SaaS và license'),
('HOSTING', 'Chi Phí Hạ Tầng Máy Chủ & Cloud', 'Khoản chi duy trì server, VPS, AWS và Cloud hosting'),
('DOMAIN', 'Chi Phí Tên Miền Doanh Nghiệp', 'Khoản chi đăng ký và duy trì domain với nhà cung cấp'),
('EQUIPMENT', 'Chi Phí Thiết Bị Văn Phòng', 'Khoản chi mua sắm máy tính, bàn ghế và trang thiết bị'),
('OTHER', 'Chi Phí Khác', 'Các khoản chi phí vận hành phát sinh ngoài danh mục')
ON CONFLICT (code) DO UPDATE SET 
    name = EXCLUDED.name, 
    description = EXCLUDED.description;


-- ============================================================================
-- 9. PAYMENT PLAN TEMPLATES (Generic Templates - CONVERGENT via DO Block Upsert)
-- ============================================================================
-- OPEN BUSINESS RULE - NOT SEEDED:
-- Website < 5,000,000đ → 100% upfront.
-- Website > 5,000,000đ → 50/50.
-- Website = 5,000,000đ → OPEN BUSINESS RULE - NOT SEEDED.
-- Các template dưới đây là reusable configuration mẫu, KHÔNG tự động áp dụng policy.
-- ============================================================================
DO $$
DECLARE
    v_service_id BIGINT;
BEGIN
    SELECT id INTO v_service_id FROM services WHERE code = 'WEB';

    -- 1) UPFRONT_100
    IF EXISTS (SELECT 1 FROM payment_plan_templates WHERE service_id = v_service_id AND plan_name = 'UPFRONT_100') THEN
        UPDATE payment_plan_templates 
        SET config_json = '{"description": "Thanh toán 100% ngay khi ký hợp đồng", "installments": [{"number": 1, "percent": 100, "trigger": "CONTRACT_SIGNED"}]}'::jsonb,
            is_active = TRUE
        WHERE service_id = v_service_id AND plan_name = 'UPFRONT_100';
    ELSE
        INSERT INTO payment_plan_templates (service_id, plan_name, config_json, is_active)
        VALUES (v_service_id, 'UPFRONT_100', '{"description": "Thanh toán 100% ngay khi ký hợp đồng", "installments": [{"number": 1, "percent": 100, "trigger": "CONTRACT_SIGNED"}]}'::jsonb, TRUE);
    END IF;

    -- 2) FIFTY_FIFTY
    IF EXISTS (SELECT 1 FROM payment_plan_templates WHERE service_id = v_service_id AND plan_name = 'FIFTY_FIFTY') THEN
        UPDATE payment_plan_templates 
        SET config_json = '{"description": "Thanh toán 50% đặt cọc, 50% khi nghiệm thu bàn giao", "installments": [{"number": 1, "percent": 50, "trigger": "CONTRACT_SIGNED"}, {"number": 2, "percent": 50, "trigger": "PROJECT_DELIVERY"}]}'::jsonb,
            is_active = TRUE
        WHERE service_id = v_service_id AND plan_name = 'FIFTY_FIFTY';
    ELSE
        INSERT INTO payment_plan_templates (service_id, plan_name, config_json, is_active)
        VALUES (v_service_id, 'FIFTY_FIFTY', '{"description": "Thanh toán 50% đặt cọc, 50% khi nghiệm thu bàn giao", "installments": [{"number": 1, "percent": 50, "trigger": "CONTRACT_SIGNED"}, {"number": 2, "percent": 50, "trigger": "PROJECT_DELIVERY"}]}'::jsonb, TRUE);
    END IF;

    -- 3) CUSTOM_INSTALLMENTS
    IF EXISTS (SELECT 1 FROM payment_plan_templates WHERE service_id = v_service_id AND plan_name = 'CUSTOM_INSTALLMENTS') THEN
        UPDATE payment_plan_templates 
        SET config_json = '{"description": "Thanh toán theo tiến độ 3 đợt (40-30-30)", "installments": [{"number": 1, "percent": 40, "trigger": "CONTRACT_SIGNED"}, {"number": 2, "percent": 30, "trigger": "DESIGN_APPROVED"}, {"number": 3, "percent": 30, "trigger": "PROJECT_DELIVERY"}]}'::jsonb,
            is_active = TRUE
        WHERE service_id = v_service_id AND plan_name = 'CUSTOM_INSTALLMENTS';
    ELSE
        INSERT INTO payment_plan_templates (service_id, plan_name, config_json, is_active)
        VALUES (v_service_id, 'CUSTOM_INSTALLMENTS', '{"description": "Thanh toán theo tiến độ 3 đợt (40-30-30)", "installments": [{"number": 1, "percent": 40, "trigger": "CONTRACT_SIGNED"}, {"number": 2, "percent": 30, "trigger": "DESIGN_APPROVED"}, {"number": 3, "percent": 30, "trigger": "PROJECT_DELIVERY"}]}'::jsonb, TRUE);
    END IF;
END $$;


-- ============================================================================
-- 10. COMMISSION POLICIES (Confirmed Business Flow Rules - CONVERGENT via DO Block Upsert)
-- ============================================================================
DO $$
DECLARE
    v_pos_sale BIGINT;
    v_pos_tl BIGINT;
    v_pos_dev BIGINT;
    v_srv_web BIGINT;
BEGIN
    SELECT id INTO v_pos_sale FROM positions WHERE code = 'SALE';
    SELECT id INTO v_pos_tl FROM positions WHERE code = 'SALES_TEAM_LEADER';
    SELECT id INTO v_pos_dev FROM positions WHERE code = 'DEV';
    SELECT id INTO v_srv_web FROM services WHERE code = 'WEB';

    -- 1) Sale Commission Policy: SALE Position -> 6%
    IF EXISTS (SELECT 1 FROM commission_policies WHERE policy_type = 'SALE' AND position_id = v_pos_sale AND service_id IS NULL AND assignee_count IS NULL) THEN
        UPDATE commission_policies 
        SET rate = 0.0600, policy_name = 'Chính Sách Hoa Hồng Closing Sale (Vị trí SALE)', effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
        WHERE policy_type = 'SALE' AND position_id = v_pos_sale AND service_id IS NULL AND assignee_count IS NULL;
    ELSE
        INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
        VALUES ('Chính Sách Hoa Hồng Closing Sale (Vị trí SALE)', 'SALE', NULL, v_pos_sale, NULL, 0.0600, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
    END IF;

    -- 2) Sale Commission Policy: SALES_TEAM_LEADER Position -> 4% (Personal Sale)
    IF EXISTS (SELECT 1 FROM commission_policies WHERE policy_type = 'SALE' AND position_id = v_pos_tl AND service_id IS NULL AND assignee_count IS NULL) THEN
        UPDATE commission_policies 
        SET rate = 0.0400, policy_name = 'Chính Sách Hoa Hồng Closing Sale (Vị trí SALES_TEAM_LEADER)', effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
        WHERE policy_type = 'SALE' AND position_id = v_pos_tl AND service_id IS NULL AND assignee_count IS NULL;
    ELSE
        INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
        VALUES ('Chính Sách Hoa Hồng Closing Sale (Vị trí SALES_TEAM_LEADER)', 'SALE', NULL, v_pos_tl, NULL, 0.0400, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
    END IF;

    -- 3) Project Delivery Commission: 3% for 1 Primary Dev
    IF EXISTS (SELECT 1 FROM commission_policies WHERE policy_type = 'PROJECT_DELIVERY' AND service_id = v_srv_web AND position_id = v_pos_dev AND assignee_count = 1) THEN
        UPDATE commission_policies 
        SET rate = 0.0300, policy_name = 'Chính Sách Hoa Hồng Kỹ Thuật Project (1 Dev Chính)', effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
        WHERE policy_type = 'PROJECT_DELIVERY' AND service_id = v_srv_web AND position_id = v_pos_dev AND assignee_count = 1;
    ELSE
        INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
        VALUES ('Chính Sách Hoa Hồng Kỹ Thuật Project (1 Dev Chính)', 'PROJECT_DELIVERY', v_srv_web, v_pos_dev, 1, 0.0300, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
    END IF;

    -- 4) Project Delivery Commission: 2% EACH for 2 Primary Devs
    IF EXISTS (SELECT 1 FROM commission_policies WHERE policy_type = 'PROJECT_DELIVERY' AND service_id = v_srv_web AND position_id = v_pos_dev AND assignee_count = 2) THEN
        UPDATE commission_policies 
        SET rate = 0.0200, policy_name = 'Chính Sách Hoa Hồng Kỹ Thuật Project (2 Dev Chính)', effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
        WHERE policy_type = 'PROJECT_DELIVERY' AND service_id = v_srv_web AND position_id = v_pos_dev AND assignee_count = 2;
    ELSE
        INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
        VALUES ('Chính Sách Hoa Hồng Kỹ Thuật Project (2 Dev Chính)', 'PROJECT_DELIVERY', v_srv_web, v_pos_dev, 2, 0.0200, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
    END IF;

    -- 5) Team Leader Override Policy: 2% Override for Sales Team Leader
    IF EXISTS (SELECT 1 FROM commission_policies WHERE policy_type = 'TEAM_OVERRIDE' AND position_id = v_pos_tl AND service_id IS NULL AND assignee_count IS NULL) THEN
        UPDATE commission_policies 
        SET rate = 0.0200, policy_name = 'Chính Sách Thưởng Override Sales Team Leader', effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
        WHERE policy_type = 'TEAM_OVERRIDE' AND position_id = v_pos_tl AND service_id IS NULL AND assignee_count IS NULL;
    ELSE
        INSERT INTO commission_policies (policy_name, policy_type, service_id, position_id, assignee_count, rate, effective_range)
        VALUES ('Chính Sách Thưởng Override Sales Team Leader', 'TEAM_OVERRIDE', NULL, v_pos_tl, NULL, 0.0200, tstzrange('2026-01-01 00:00:00+00', NULL, '[)'));
    END IF;
END $$;


-- ============================================================================
-- 11. KPI POLICIES & TIERS (Fully Convergent via DO Block Upsert & Canonical Thresholds)
-- ============================================================================

-- 1) SALE KPI Policy: Confirmed Cash Revenue Tiers (120M -> +1M, 150M -> +2M, 200M -> +3M)
DO $$
DECLARE
    v_policy_id BIGINT;
    v_position_id BIGINT;
BEGIN
    SELECT id INTO v_position_id FROM positions WHERE code = 'SALE';
    
    -- Check if policy already exists
    SELECT id INTO v_policy_id 
    FROM kpi_policies 
    WHERE position_id = v_position_id AND metric_type = 'CASH_REVENUE';

    IF v_policy_id IS NOT NULL THEN
        UPDATE kpi_policies 
        SET policy_name = 'Chính Sách Thưởng KPI Doanh Thu Thực Thu Sales', effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
        WHERE id = v_policy_id;
    ELSE
        INSERT INTO kpi_policies (policy_name, position_id, metric_type, effective_range)
        VALUES ('Chính Sách Thưởng KPI Doanh Thu Thực Thu Sales', v_position_id, 'CASH_REVENUE', tstzrange('2026-01-01 00:00:00+00', NULL, '[)'))
        RETURNING id INTO v_policy_id;
    END IF;

    -- Upsert tiers idempotently & convergently
    IF v_policy_id IS NOT NULL THEN
        -- Tier 1: min_threshold = 0.00
        IF EXISTS (SELECT 1 FROM kpi_policy_tiers WHERE kpi_policy_id = v_policy_id AND min_threshold = 0.00) THEN
            UPDATE kpi_policy_tiers 
            SET max_threshold = 120000000.00, reward_amount = 0.00, tier_note = 'Dưới 120 triệu - Khởi động (Không thưởng)'
            WHERE kpi_policy_id = v_policy_id AND min_threshold = 0.00;
        ELSE
            INSERT INTO kpi_policy_tiers (kpi_policy_id, min_threshold, max_threshold, reward_amount, tier_note)
            VALUES (v_policy_id, 0.00, 120000000.00, 0.00, 'Dưới 120 triệu - Khởi động (Không thưởng)');
        END IF;

        -- Tier 2: min_threshold = 120000000.00
        IF EXISTS (SELECT 1 FROM kpi_policy_tiers WHERE kpi_policy_id = v_policy_id AND min_threshold = 120000000.00) THEN
            UPDATE kpi_policy_tiers 
            SET max_threshold = 150000000.00, reward_amount = 1000000.00, tier_note = 'Từ 120 triệu đến dưới 150 triệu - Thưởng 1,000,000đ'
            WHERE kpi_policy_id = v_policy_id AND min_threshold = 120000000.00;
        ELSE
            INSERT INTO kpi_policy_tiers (kpi_policy_id, min_threshold, max_threshold, reward_amount, tier_note)
            VALUES (v_policy_id, 120000000.00, 150000000.00, 1000000.00, 'Từ 120 triệu đến dưới 150 triệu - Thưởng 1,000,000đ');
        END IF;

        -- Tier 3: min_threshold = 150000000.00
        IF EXISTS (SELECT 1 FROM kpi_policy_tiers WHERE kpi_policy_id = v_policy_id AND min_threshold = 150000000.00) THEN
            UPDATE kpi_policy_tiers 
            SET max_threshold = 200000000.00, reward_amount = 2000000.00, tier_note = 'Từ 150 triệu đến dưới 200 triệu - Thưởng 2,000,000đ'
            WHERE kpi_policy_id = v_policy_id AND min_threshold = 150000000.00;
        ELSE
            INSERT INTO kpi_policy_tiers (kpi_policy_id, min_threshold, max_threshold, reward_amount, tier_note)
            VALUES (v_policy_id, 150000000.00, 200000000.00, 2000000.00, 'Từ 150 triệu đến dưới 200 triệu - Thưởng 2,000,000đ');
        END IF;

        -- Tier 4: min_threshold = 200000000.00
        IF EXISTS (SELECT 1 FROM kpi_policy_tiers WHERE kpi_policy_id = v_policy_id AND min_threshold = 200000000.00) THEN
            UPDATE kpi_policy_tiers 
            SET max_threshold = NULL, reward_amount = 3000000.00, tier_note = 'Từ 200 triệu trở lên - Thưởng 3,000,000đ'
            WHERE kpi_policy_id = v_policy_id AND min_threshold = 200000000.00;
        ELSE
            INSERT INTO kpi_policy_tiers (kpi_policy_id, min_threshold, max_threshold, reward_amount, tier_note)
            VALUES (v_policy_id, 200000000.00, NULL, 3000000.00, 'Từ 200 triệu trở lên - Thưởng 3,000,000đ');
        END IF;
    END IF;
END $$;

-- 2) SEO KPI Policy: Confirmed Valid Articles Count Tiers (100 -> +1M, 150 -> +2M)
DO $$
DECLARE
    v_policy_id BIGINT;
    v_position_id BIGINT;
BEGIN
    SELECT id INTO v_position_id FROM positions WHERE code = 'SEO';

    -- Check if policy already exists
    SELECT id INTO v_policy_id 
    FROM kpi_policies 
    WHERE position_id = v_position_id AND metric_type = 'SEO_ARTICLE_COUNT';

    IF v_policy_id IS NOT NULL THEN
        UPDATE kpi_policies 
        SET policy_name = 'Chính Sách Thưởng KPI Bài Viết Chuẩn SEO', effective_range = tstzrange('2026-01-01 00:00:00+00', NULL, '[)')
        WHERE id = v_policy_id;
    ELSE
        INSERT INTO kpi_policies (policy_name, position_id, metric_type, effective_range)
        VALUES ('Chính Sách Thưởng KPI Bài Viết Chuẩn SEO', v_position_id, 'SEO_ARTICLE_COUNT', tstzrange('2026-01-01 00:00:00+00', NULL, '[)'))
        RETURNING id INTO v_policy_id;
    END IF;

    -- Upsert tiers idempotently & convergently
    IF v_policy_id IS NOT NULL THEN
        -- Tier 1: min_threshold = 0.00
        IF EXISTS (SELECT 1 FROM kpi_policy_tiers WHERE kpi_policy_id = v_policy_id AND min_threshold = 0.00) THEN
            UPDATE kpi_policy_tiers 
            SET max_threshold = 100.00, reward_amount = 0.00, tier_note = 'Dưới 100 bài viết - Cơ bản (Không thưởng)'
            WHERE kpi_policy_id = v_policy_id AND min_threshold = 0.00;
        ELSE
            INSERT INTO kpi_policy_tiers (kpi_policy_id, min_threshold, max_threshold, reward_amount, tier_note)
            VALUES (v_policy_id, 0.00, 100.00, 0.00, 'Dưới 100 bài viết - Cơ bản (Không thưởng)');
        END IF;

        -- Tier 2: min_threshold = 100.00
        IF EXISTS (SELECT 1 FROM kpi_policy_tiers WHERE kpi_policy_id = v_policy_id AND min_threshold = 100.00) THEN
            UPDATE kpi_policy_tiers 
            SET max_threshold = 150.00, reward_amount = 1000000.00, tier_note = 'Từ 100 đến dưới 150 bài viết - Thưởng 1,000,000đ'
            WHERE kpi_policy_id = v_policy_id AND min_threshold = 100.00;
        ELSE
            INSERT INTO kpi_policy_tiers (kpi_policy_id, min_threshold, max_threshold, reward_amount, tier_note)
            VALUES (v_policy_id, 100.00, 150.00, 1000000.00, 'Từ 100 đến dưới 150 bài viết - Thưởng 1,000,000đ');
        END IF;

        -- Tier 3: min_threshold = 150.00
        IF EXISTS (SELECT 1 FROM kpi_policy_tiers WHERE kpi_policy_id = v_policy_id AND min_threshold = 150.00) THEN
            UPDATE kpi_policy_tiers 
            SET max_threshold = NULL, reward_amount = 2000000.00, tier_note = 'Từ 150 bài viết trở lên - Thưởng 2,000,000đ'
            WHERE kpi_policy_id = v_policy_id AND min_threshold = 150.00;
        ELSE
            INSERT INTO kpi_policy_tiers (kpi_policy_id, min_threshold, max_threshold, reward_amount, tier_note)
            VALUES (v_policy_id, 150.00, NULL, 2000000.00, 'Từ 150 bài viết trở lên - Thưởng 2,000,000đ');
        END IF;
    END IF;
END $$;

-- ============================================================================
-- OPEN BUSINESS RULE - NOT SEEDED (DEV KPI & BONUS):
-- 1. Các khoảng thưởng KPI Dev (<5, >7<10, >15<20, >20) vẫn đang OPEN.
-- 2. Mốc Dev Bonus 10/15 (KPI Points vs Completed Website count) chưa chốt tiêu chí.
-- TUYỆT ĐỐI KHÔNG SEED DỮ LIỆU GIẢ HOẶC CHỌN THAY NGUYÊN TẮC CHO DEV KPI POLICIES.
-- ============================================================================


-- ============================================================================
-- 12. 5 OPEN BUSINESS RULES AUDIT CHECKLIST
-- ============================================================================
-- [PASS] Rule 1: Website < 5M (100%), Website > 5M (50/50), Website = 5M -> OPEN BUSINESS RULE - NOT SEEDED.
-- [PASS] Rule 2: Dev KPI gaps (<5, 7-10, 15-20, >20) -> OPEN BUSINESS RULE - NOT SEEDED.
-- [PASS] Rule 3: Dev Bonus 10/15 (KPI Points vs Completed Website count) -> OPEN BUSINESS RULE - NOT SEEDED.
-- [PASS] Rule 4: Late Customer Acceptance sau khi Payroll LOCKED -> OPEN BUSINESS RULE - NOT SEEDED.
-- [PASS] Rule 5: Management Revenue / Management Profit recognition -> OPEN BUSINESS RULE - NOT SEEDED.

-- ============================================================================
-- END OF CRM MASTER & REFERENCE DATA SEED SCRIPT (V4.5)
-- ============================================================================
