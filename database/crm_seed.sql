-- PHẦN 4 - TẠO FILE crm_seed.sql
-- Dữ liệu mẫu (Mock data) cho CRM Database Schema (Demo & Backend Test) - Bản Số Ít

-- 1. RBAC (Role & Permission)
INSERT INTO role (id, name, description) VALUES 
('10000000-0000-0000-0000-000000000001', 'Admin', 'Toàn quyền hệ thống'),
('10000000-0000-0000-0000-000000000002', 'Sales Manager', 'Quản lý phòng kinh doanh'),
('10000000-0000-0000-0000-000000000003', 'Sales Rep', 'Nhân viên kinh doanh'),
('10000000-0000-0000-0000-000000000004', 'Marketing', 'Chuyên viên tiếp thị'),
('10000000-0000-0000-0000-000000000005', 'Support', 'Hỗ trợ khách hàng');

-- 2. USERS (15 Users)
INSERT INTO "user" (id, email, password_hash, full_name, phone) VALUES 
('20000000-0000-0000-0000-000000000001', 'admin@crm.local', 'hash', 'Nguyễn Văn Quản Trị', '0900000001'),
('20000000-0000-0000-0000-000000000002', 'sm1@crm.local', 'hash', 'Trần Minh Đức', '0900000002'),
('20000000-0000-0000-0000-000000000003', 'sm2@crm.local', 'hash', 'Lê Hoàng Nam', '0900000003'),
('20000000-0000-0000-0000-000000000004', 'sr1@crm.local', 'hash', 'Phạm Thu Trang', '0900000004'),
('20000000-0000-0000-0000-000000000005', 'sr2@crm.local', 'hash', 'Hoàng Ngọc Ánh', '0900000005'),
('20000000-0000-0000-0000-000000000006', 'sr3@crm.local', 'hash', 'Vũ Đức Mạnh', '0900000006'),
('20000000-0000-0000-0000-000000000007', 'sr4@crm.local', 'hash', 'Đặng Kim Sơn', '0900000007'),
('20000000-0000-0000-0000-000000000008', 'sr5@crm.local', 'hash', 'Bùi Hải Yến', '0900000008'),
('20000000-0000-0000-0000-000000000009', 'sr6@crm.local', 'hash', 'Đỗ Thanh Tuấn', '0900000009'),
('20000000-0000-0000-0000-000000000010', 'sr7@crm.local', 'hash', 'Ngô Bá Khá', '0900000010'),
('20000000-0000-0000-0000-000000000011', 'sr8@crm.local', 'hash', 'Lý Tự Trọng', '0900000011'),
('20000000-0000-0000-0000-000000000012', 'mkt1@crm.local', 'hash', 'Chu Vĩnh Toàn', '0900000012'),
('20000000-0000-0000-0000-000000000013', 'mkt2@crm.local', 'hash', 'Vương Lệ Quyên', '0900000013'),
('20000000-0000-0000-0000-000000000014', 'sup1@crm.local', 'hash', 'Tạ Bích Hữu', '0900000014'),
('20000000-0000-0000-0000-000000000015', 'sup2@crm.local', 'hash', 'Tiêu Phong', '0900000015');

INSERT INTO user_role (user_id, role_id) VALUES 
('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001'),
('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002'),
('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003'),
('20000000-0000-0000-0000-000000000012', '10000000-0000-0000-0000-000000000004'),
('20000000-0000-0000-0000-000000000014', '10000000-0000-0000-0000-000000000005');

-- 3. TEAMS & MEMBERS
INSERT INTO team (id, name) VALUES 
('30000000-0000-0000-0000-000000000001', 'Sales Hà Nội'),
('30000000-0000-0000-0000-000000000002', 'Sales HCM'),
('30000000-0000-0000-0000-000000000003', 'Marketing');

INSERT INTO team_member (team_id, user_id) VALUES 
('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004'),
('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005'),
('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000006'),
('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000007'),
('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000012');

-- 4. LEAD SOURCES
INSERT INTO lead_source (id, code, name) VALUES 
('40000000-0000-0000-0000-000000000001', 'WEBSITE', 'Website'),
('40000000-0000-0000-0000-000000000002', 'FACEBOOK', 'Facebook'),
('40000000-0000-0000-0000-000000000003', 'GOOGLE', 'Google Ads'),
('40000000-0000-0000-0000-000000000004', 'ZALO', 'Zalo OA'),
('40000000-0000-0000-0000-000000000005', 'REFERRAL', 'Giới thiệu'),
('40000000-0000-0000-0000-000000000006', 'MANUAL', 'Nhập thủ công');

-- 5. LEAD STATUSES
INSERT INTO lead_status (id, code, name, is_converted) VALUES 
('50000000-0000-0000-0000-000000000001', 'NEW', 'Mới', FALSE),
('50000000-0000-0000-0000-000000000002', 'CONTACTED', 'Đã liên hệ', FALSE),
('50000000-0000-0000-0000-000000000003', 'QUALIFIED', 'Tiềm năng', FALSE),
('50000000-0000-0000-0000-000000000004', 'CONVERTED', 'Đã chuyển đổi', TRUE),
('50000000-0000-0000-0000-000000000005', 'LOST', 'Thất bại', FALSE);

-- 6. ACCOUNTS & CONTACTS (12 Doanh nghiệp, 20 Liên hệ)
INSERT INTO account (id, name, industry, segment, owner_id) VALUES 
('a0000000-0000-0000-0000-000000000001', 'Công ty Cổ phần Minh Phát', 'IT', 'vip', '20000000-0000-0000-0000-000000000004'),
('a0000000-0000-0000-0000-000000000002', 'Công ty TNHH Đông Á', 'Finance', 'regular', '20000000-0000-0000-0000-000000000004'),
('a0000000-0000-0000-0000-000000000003', 'Công ty TNHH Thiết bị Việt', 'Retail', 'potential', '20000000-0000-0000-0000-000000000005'),
('a0000000-0000-0000-0000-000000000004', 'Công ty Cổ phần Nội thất An Gia', 'Real Estate', 'vip', '20000000-0000-0000-0000-000000000006'),
('a0000000-0000-0000-0000-000000000005', 'Tập đoàn Hòa Bình', 'Construction', 'vip', '20000000-0000-0000-0000-000000000007'),
('a0000000-0000-0000-0000-000000000006', 'Công ty TNHH Dược Phẩm Xanh', 'Healthcare', 'regular', '20000000-0000-0000-0000-000000000008'),
('a0000000-0000-0000-0000-000000000007', 'CTCP Vận tải Biển Đông', 'Logistics', 'potential', '20000000-0000-0000-0000-000000000009'),
('a0000000-0000-0000-0000-000000000008', 'Công ty May mặc Việt Thành', 'Manufacturing', 'regular', '20000000-0000-0000-0000-000000000010'),
('a0000000-0000-0000-0000-000000000009', 'Hệ thống Giáo dục Alpha', 'Education', 'vip', '20000000-0000-0000-0000-000000000011'),
('a0000000-0000-0000-0000-000000000010', 'Công ty Cổ phần Truyền thông Số', 'Media', 'potential', '20000000-0000-0000-0000-000000000004'),
('a0000000-0000-0000-0000-000000000011', 'Tập đoàn Nông nghiệp Sạch', 'Agriculture', 'vip', '20000000-0000-0000-0000-000000000005'),
('a0000000-0000-0000-0000-000000000012', 'Công ty TNHH Du lịch Sài Gòn', 'Tourism', 'regular', '20000000-0000-0000-0000-000000000006');

INSERT INTO contact (id, account_id, first_name, last_name, email, is_primary) VALUES 
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'An', 'Nguyễn Văn', 'an.nguyen@minhphat.com', TRUE),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Bình', 'Lê Thế', 'binh.le@minhphat.com', FALSE),
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Cường', 'Phạm Quốc', 'cuong.pham@donga.com', TRUE),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000003', 'Dương', 'Trần Thùy', 'duong.tran@thietbiviet.com', TRUE),
('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004', 'Linh', 'Ngô Gia', 'linh.ngo@angia.com', TRUE),
('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000005', 'Hùng', 'Lê Hữu', 'hung.le@hoabinh.com', TRUE),
('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000006', 'Trí', 'Nguyễn Đức', 'tri.nguyen@duocxanh.com', TRUE),
('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000007', 'Sơn', 'Đinh Thanh', 'son.dinh@biendong.com', TRUE),
('c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000008', 'Tú', 'Đỗ Xuân', 'tu.do@vietthanh.com', TRUE),
('c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000009', 'Loan', 'Hoàng Kim', 'loan.hoang@alpha.edu', TRUE),
('c0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000010', 'Trang', 'Bùi Quỳnh', 'trang.bui@truyenthong.com', TRUE),
('c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000011', 'Khánh', 'Phùng Quốc', 'khanh.phung@nongnghiep.com', TRUE),
('c0000000-0000-0000-0000-000000000013', 'a0000000-0000-0000-0000-000000000012', 'Vinh', 'Cao Hữu', 'vinh.cao@dulichsaigon.com', TRUE),
('c0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000001', 'Khương', 'Võ Duy', 'khuong.vo@minhphat.com', FALSE),
('c0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000002', 'Nga', 'Đào Thúy', 'nga.dao@donga.com', FALSE),
('c0000000-0000-0000-0000-000000000016', 'a0000000-0000-0000-0000-000000000003', 'Vy', 'Huỳnh Hạ', 'vy.huynh@thietbiviet.com', FALSE),
('c0000000-0000-0000-0000-000000000017', 'a0000000-0000-0000-0000-000000000004', 'Ngọc', 'Lâm Bảo', 'ngoc.lam@angia.com', FALSE),
('c0000000-0000-0000-0000-000000000018', 'a0000000-0000-0000-0000-000000000005', 'My', 'Hồ Trà', 'my.ho@hoabinh.com', FALSE),
('c0000000-0000-0000-0000-000000000019', 'a0000000-0000-0000-0000-000000000006', 'Khải', 'Đoàn Quang', 'khai.doan@duocxanh.com', FALSE),
('c0000000-0000-0000-0000-000000000020', 'a0000000-0000-0000-0000-000000000007', 'Quang', 'Lý Tấn', 'quang.ly@biendong.com', FALSE);

-- 7. TAGS
INSERT INTO tag (id, name, color) VALUES 
('t0000000-0000-0000-0000-000000000001', 'VIP', 'red'),
('t0000000-0000-0000-0000-000000000002', 'Tiềm năng', 'blue'),
('t0000000-0000-0000-0000-000000000003', 'Enterprise', 'green'),
('t0000000-0000-0000-0000-000000000004', 'SME', 'yellow'),
('t0000000-0000-0000-0000-000000000005', 'Cần chăm sóc', 'orange');

-- 8. LEADS (40 Leads)
INSERT INTO lead (full_name, source_id, status_id, expected_value, owner_id)
SELECT 
    'Khách hàng Tiềm năng ' || i,
    (CASE WHEN i%6 = 0 THEN '40000000-0000-0000-0000-000000000001'
          WHEN i%6 = 1 THEN '40000000-0000-0000-0000-000000000002'
          WHEN i%6 = 2 THEN '40000000-0000-0000-0000-000000000003'
          WHEN i%6 = 3 THEN '40000000-0000-0000-0000-000000000004'
          WHEN i%6 = 4 THEN '40000000-0000-0000-0000-000000000005'
          ELSE '40000000-0000-0000-0000-000000000006' END)::uuid,
    (CASE WHEN i%5 = 0 THEN '50000000-0000-0000-0000-000000000001'
          WHEN i%5 = 1 THEN '50000000-0000-0000-0000-000000000002'
          WHEN i%5 = 2 THEN '50000000-0000-0000-0000-000000000003'
          WHEN i%5 = 3 THEN '50000000-0000-0000-0000-000000000004'
          ELSE '50000000-0000-0000-0000-000000000005' END)::uuid,
    (i * 1000000.00),
    (CASE WHEN i%3 = 0 THEN '20000000-0000-0000-0000-000000000004'
          WHEN i%3 = 1 THEN '20000000-0000-0000-0000-000000000005'
          ELSE '20000000-0000-0000-0000-000000000006' END)::uuid
FROM generate_series(1, 40) AS i;

-- Đặt một số Lead đã chuyển đổi
UPDATE lead SET converted_at = CURRENT_TIMESTAMP, converted_account_id = 'a0000000-0000-0000-0000-000000000001', converted_contact_id = 'c0000000-0000-0000-0000-000000000001' WHERE status_id = '50000000-0000-0000-0000-000000000004';

-- 9. PIPELINES & STAGES
INSERT INTO pipeline (id, name) VALUES ('60000000-0000-0000-0000-000000000001', 'Pipeline Bán Hàng Chuẩn');

INSERT INTO pipeline_stage (id, pipeline_id, code, name, order_index, default_probability, is_closed_won, is_closed_lost) VALUES 
('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', 'NEW', 'Khám phá nhu cầu', 0, 10, FALSE, FALSE),
('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', 'QUALIFIED', 'Xác định tiềm năng', 1, 30, FALSE, FALSE),
('70000000-0000-0000-0000-000000000003', '60000000-0000-0000-0000-000000000001', 'PROPOSAL', 'Gửi báo giá', 2, 60, FALSE, FALSE),
('70000000-0000-0000-0000-000000000004', '60000000-0000-0000-0000-000000000001', 'NEGOTIATION', 'Đàm phán', 3, 80, FALSE, FALSE),
('70000000-0000-0000-0000-000000000005', '60000000-0000-0000-0000-000000000001', 'WON', 'Thành công (Won)', 4, 100, TRUE, FALSE),
('70000000-0000-0000-0000-000000000006', '60000000-0000-0000-0000-000000000001', 'LOST', 'Thất bại (Lost)', 5, 0, FALSE, TRUE);

-- 10. DEALS (25 Deals)
INSERT INTO deal (id, name, account_id, contact_id, pipeline_id, stage_id, amount, probability, expected_close_date, owner_id)
SELECT 
    gen_random_uuid(),
    'Giao dịch phần mềm CRM - ' || i,
    (CASE WHEN i%12=0 THEN 'a0000000-0000-0000-0000-000000000012' ELSE ('a0000000-0000-0000-0000-00000000000' || (i%12)::text)::uuid END),
    (CASE WHEN i%12=0 THEN 'c0000000-0000-0000-0000-000000000013' ELSE ('c0000000-0000-0000-0000-00000000000' || (i%12)::text)::uuid END),
    '60000000-0000-0000-0000-000000000001',
    (CASE WHEN i%6 = 0 THEN '70000000-0000-0000-0000-000000000001'
          WHEN i%6 = 1 THEN '70000000-0000-0000-0000-000000000002'
          WHEN i%6 = 2 THEN '70000000-0000-0000-0000-000000000003'
          WHEN i%6 = 3 THEN '70000000-0000-0000-0000-000000000004'
          WHEN i%6 = 4 THEN '70000000-0000-0000-0000-000000000005'
          ELSE '70000000-0000-0000-0000-000000000006' END)::uuid,
    (i * 15000000.00),
    (CASE WHEN i%2 = 0 THEN NULL ELSE 50 END), -- Test Default Probability (COALESCE)
    CURRENT_DATE + (i * 2),
    (CASE WHEN i%4 = 0 THEN '20000000-0000-0000-0000-000000000004'
          WHEN i%4 = 1 THEN '20000000-0000-0000-0000-000000000005'
          WHEN i%4 = 2 THEN '20000000-0000-0000-0000-000000000006'
          ELSE NULL END) -- Some unassigned deals for LEFT JOIN test
FROM generate_series(1, 25) AS i;

-- Deal Stage History
INSERT INTO deal_stage_history (deal_id, old_stage_id, new_stage_id)
SELECT id, '70000000-0000-0000-0000-000000000001', stage_id FROM deal LIMIT 10;

-- 11. LEAD ASSIGNMENT RULES
INSERT INTO lead_assignment_rule (id, name, rule_type) VALUES 
('80000000-0000-0000-0000-000000000001', 'Chia Lead Miền Bắc', 'round_robin'),
('80000000-0000-0000-0000-000000000002', 'Chia Lead Theo Nguồn', 'source');

INSERT INTO lead_assignment_rule_member (rule_id, user_id, order_index) VALUES 
('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', 0),
('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000005', 1),
('80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000006', 2);

-- Lịch sử chia Lead
INSERT INTO lead_assignment_history (lead_id, rule_id, assigned_to)
SELECT id, '80000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004' FROM lead LIMIT 5;

-- 12. DISCOUNT REQUESTS & APPROVALS
INSERT INTO discount_request (id, deal_id, requester_id, requested_discount_percent, reason, status)
SELECT 
    gen_random_uuid(),
    d.id,
    '20000000-0000-0000-0000-000000000004',
    15.50,
    'Khách hàng thân thiết lâu năm, xin giảm giá để chốt HĐ.',
    (CASE WHEN d.amount < 150000000 THEN 'approved' WHEN d.amount > 300000000 THEN 'rejected' ELSE 'pending' END)
FROM deal d LIMIT 5;

-- 13. ACTIVITIES (50 bản ghi)
INSERT INTO activity (type, subject, description, due_date, status, lead_id, owner_id)
SELECT 
    'call',
    'Gọi điện chăm sóc lần ' || i,
    'Ghi chú cuộc gọi với khách...',
    CURRENT_DATE + i,
    'pending',
    l.id,
    '20000000-0000-0000-0000-000000000004'
FROM lead l CROSS JOIN generate_series(1, 1) AS i LIMIT 25;

INSERT INTO activity (type, subject, description, status, deal_id, owner_id)
SELECT 
    'meeting',
    'Họp chốt Deal ' || d.name,
    'Thuyết trình sản phẩm',
    'completed',
    d.id,
    '20000000-0000-0000-0000-000000000005'
FROM deal d CROSS JOIN generate_series(1, 1) AS i LIMIT 25;

-- 14. TICKETS
INSERT INTO ticket (id, subject, description, account_id, contact_id, status, priority)
SELECT 
    gen_random_uuid(),
    'Hỗ trợ kỹ thuật cấu hình ' || i,
    'Khách báo lỗi kết nối...',
    (CASE WHEN i%12=0 THEN 'a0000000-0000-0000-0000-000000000012' ELSE ('a0000000-0000-0000-0000-00000000000' || (i%12)::text)::uuid END),
    (CASE WHEN i%12=0 THEN 'c0000000-0000-0000-0000-000000000013' ELSE ('c0000000-0000-0000-0000-00000000000' || (i%12)::text)::uuid END),
    (CASE WHEN i%4=0 THEN 'open' WHEN i%4=1 THEN 'in_progress' WHEN i%4=2 THEN 'resolved' ELSE 'closed' END),
    (CASE WHEN i%3=0 THEN 'high' WHEN i%3=1 THEN 'medium' ELSE 'low' END)
FROM generate_series(1, 12) AS i;

-- Ticket Replies
INSERT INTO ticket_reply (ticket_id, user_id, message)
SELECT id, '20000000-0000-0000-0000-000000000014', 'Chào anh/chị, em đang kiểm tra hệ thống ạ.' FROM ticket LIMIT 5;

-- 15. CAMPAIGNS & ENROLLMENTS
INSERT INTO campaign (id, name, status) VALUES 
('90000000-0000-0000-0000-000000000001', 'Drip Email: Chào mừng Khách hàng', 'active'),
('90000000-0000-0000-0000-000000000002', 'Drip Email: Re-engage Khách hàng cũ', 'active');

INSERT INTO email_template (id, name, subject, body_html) VALUES 
('e0000000-0000-0000-0000-000000000001', 'Welcome Day 1', 'Cảm ơn bạn đã quan tâm', '<h1>Chào bạn!</h1><p>Cảm ơn...</p>'),
('e0000000-0000-0000-0000-000000000002', 'Followup Day 3', 'Bạn cần hỗ trợ gì không?', '<p>Chúng tôi có thể giúp gì...</p>'),
('e0000000-0000-0000-0000-000000000003', 'Promo Day 7', 'Tặng bạn voucher 20%', '<h2>Voucher: CRM20</h2>');

INSERT INTO campaign_step (id, campaign_id, step_order, action_type, template_id, delay_minutes) VALUES 
('f0000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 0, 'email', 'e0000000-0000-0000-0000-000000000001', 0),
('f0000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000001', 1, 'email', 'e0000000-0000-0000-0000-000000000002', 4320), -- 3 days
('f0000000-0000-0000-0000-000000000003', '90000000-0000-0000-0000-000000000001', 2, 'task', NULL, 10080); -- 7 days

INSERT INTO campaign_enrollment (id, campaign_id, lead_id, current_step_id, next_run_at, status)
SELECT 
    gen_random_uuid(),
    '90000000-0000-0000-0000-000000000001', 
    id, 
    'f0000000-0000-0000-0000-000000000001',
    CURRENT_TIMESTAMP + INTERVAL '1 hour',
    'active'
FROM lead LIMIT 15;

INSERT INTO email_message (recipient_email, subject, enrollment_id, status)
SELECT 'test@test.com', 'Welcome Day 1', id, 'sent' FROM campaign_enrollment;

-- 16. LIVE CHAT
INSERT INTO chat_session (id, visitor_identifier, status) VALUES 
('b0000000-0000-0000-0000-000000000001', '192.168.1.1', 'ended'),
('b0000000-0000-0000-0000-000000000002', '192.168.1.2', 'active');

INSERT INTO chat_message (session_id, sender_type, message) VALUES 
('b0000000-0000-0000-0000-000000000001', 'visitor', 'Cho mình hỏi giá CRM?'),
('b0000000-0000-0000-0000-000000000001', 'agent', 'Dạ CRM giá 500k/tháng ạ.');

-- 17. AUTOMATION RULES
INSERT INTO automation_rule (id, name, trigger_event, conditions, actions) VALUES 
(gen_random_uuid(), 'Gửi mail khi Lead đăng ký', 'lead_created', '{"source": "WEBSITE"}', '{"action": "enroll_campaign", "campaign_id": "90000000-0000-0000-0000-000000000001"}'),
(gen_random_uuid(), 'Cảnh báo Deal giá trị cao', 'deal_created', '{"amount_greater_than": 100000000}', '{"action": "notify_manager"}'),
(gen_random_uuid(), 'Đóng Ticket tự động', 'ticket_idle_7_days', '{}', '{"action": "change_status", "status": "closed"}');

-- 18. WEBHOOKS & NOTIFICATIONS
INSERT INTO webhook_inbound (provider, external_id, payload) VALUES 
('facebook', 'fb-1234', '{"leadgen_id":"fb-1234"}'),
('google', 'gg-5678', '{"gclid":"gg-5678"}'),
('zalo', 'za-9999', '{"zalo_id":"za-9999"}');

INSERT INTO notification (user_id, type, title, is_read) VALUES 
('20000000-0000-0000-0000-000000000004', 'deal_assigned', 'Deal mới được gán cho bạn', FALSE),
('20000000-0000-0000-0000-000000000005', 'lead_assigned', 'Lead mới từ Web', TRUE);

-- 19. AUDIT LOGS
INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES 
('20000000-0000-0000-0000-000000000001', 'CREATE', 'LEAD', gen_random_uuid()),
('20000000-0000-0000-0000-000000000002', 'UPDATE', 'DEAL', gen_random_uuid()),
('20000000-0000-0000-0000-000000000004', 'CHANGE_STAGE', 'DEAL', gen_random_uuid()),
('20000000-0000-0000-0000-000000000002', 'APPROVE_DISCOUNT', 'DISCOUNT_REQUEST', gen_random_uuid());
