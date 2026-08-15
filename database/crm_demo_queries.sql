-- PHẦN 6 - TẠO crm_demo_queries.sql
-- Danh sách các câu SQL phục vụ Demo, Test Dashboard, và Báo cáo theo Yêu cầu Khóa luận (Bản Số Ít)

-- 1. Lấy Lead của một Sales
SELECT full_name, email, expected_value, created_at 
FROM lead 
WHERE owner_id = '20000000-0000-0000-0000-000000000004' AND deleted_at IS NULL;

-- 2. Lead theo nguồn
SELECT ls.name AS source, COUNT(l.id) AS total_leads
FROM lead l 
JOIN lead_source ls ON l.source_id = ls.id 
WHERE l.deleted_at IS NULL
GROUP BY ls.name;

-- 3. Lead theo trạng thái
SELECT st.name AS status, COUNT(l.id) AS total_leads
FROM lead l 
JOIN lead_status st ON l.status_id = st.id 
WHERE l.deleted_at IS NULL
GROUP BY st.name;

-- 4. Lead mới trong 7 ngày
SELECT full_name, created_at 
FROM lead 
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days' AND deleted_at IS NULL;

-- 5. Conversion Rate (Tỉ lệ chuyển đổi)
SELECT 
  ROUND((SUM(CASE WHEN st.is_converted THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(l.id), 0)), 2) AS conversion_rate_percent 
FROM lead l 
JOIN lead_status st ON l.status_id = st.id 
WHERE l.deleted_at IS NULL;

-- 6. Thời gian trung bình Lead → Converted (Số ngày)
SELECT 
  ROUND(AVG(EXTRACT(EPOCH FROM (converted_at - created_at))/86400)::numeric, 1) AS avg_days_to_convert
FROM lead 
WHERE converted_at IS NOT NULL AND deleted_at IS NULL;

-- 7. Kanban Board: Group Deal theo Stage
SELECT s.name AS stage, COUNT(d.id) AS deals_count, SUM(d.amount) AS total_amount
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id
WHERE d.deleted_at IS NULL
GROUP BY s.order_index, s.name 
ORDER BY s.order_index;

-- 8. Pipeline Value (Tổng giá trị Pipeline chưa đóng)
SELECT p.name AS pipeline, SUM(d.amount) AS total_value
FROM deal d 
JOIN pipeline p ON d.pipeline_id = p.id
JOIN pipeline_stage s ON d.stage_id = s.id
WHERE s.is_closed_won = FALSE AND s.is_closed_lost = FALSE AND d.deleted_at IS NULL
GROUP BY p.name;

-- 9. Forecast theo tháng (Dựa vào view chuẩn hóa)
SELECT TO_CHAR(forecast_month, 'YYYY-MM') AS month, SUM(weighted_value) AS forecasted_revenue
FROM view_forecast_pipeline 
GROUP BY TO_CHAR(forecast_month, 'YYYY-MM') 
ORDER BY month;

-- 10. Forecast theo Sales
SELECT owner_name, SUM(weighted_value) AS forecasted_revenue
FROM view_forecast_pipeline 
GROUP BY owner_name 
ORDER BY forecasted_revenue DESC;

-- 11. Deal Won
SELECT d.name, a.name AS account_name, d.amount 
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id 
JOIN account a ON d.account_id = a.id
WHERE s.is_closed_won = TRUE AND d.deleted_at IS NULL;

-- 12. Deal Lost
SELECT d.name, a.name AS account_name, d.amount 
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id 
JOIN account a ON d.account_id = a.id
WHERE s.is_closed_lost = TRUE AND d.deleted_at IS NULL;

-- 13. Tỷ lệ Won/Lost
SELECT 
  SUM(CASE WHEN s.is_closed_won THEN 1 ELSE 0 END) AS won_deals,
  SUM(CASE WHEN s.is_closed_lost THEN 1 ELSE 0 END) AS lost_deals,
  ROUND(SUM(CASE WHEN s.is_closed_won THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(d.id), 0), 2) AS win_rate_percent
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id
WHERE (s.is_closed_won = TRUE OR s.is_closed_lost = TRUE) AND d.deleted_at IS NULL;

-- 14. Doanh số theo Sales (Deal đã Won)
SELECT u.full_name, SUM(d.amount) AS total_won_amount
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id 
JOIN "user" u ON d.owner_id = u.id
WHERE s.is_closed_won = TRUE AND d.deleted_at IS NULL
GROUP BY u.full_name;

-- 15. Doanh số theo Team
SELECT t.name, SUM(d.amount) AS team_revenue
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id
JOIN team_member tm ON d.owner_id = tm.user_id 
JOIN team t ON tm.team_id = t.id
WHERE s.is_closed_won = TRUE AND d.deleted_at IS NULL
GROUP BY t.name;

-- 16. Top 5 Sales theo Won Revenue
SELECT u.full_name, SUM(d.amount) AS total_won
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id 
JOIN "user" u ON d.owner_id = u.id
WHERE s.is_closed_won = TRUE AND d.deleted_at IS NULL
GROUP BY u.full_name 
ORDER BY total_won DESC 
LIMIT 5;

-- 17. Deal sắp đến ngày close (Trong 30 ngày)
SELECT name, amount, expected_close_date 
FROM deal 
WHERE expected_close_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 30 
  AND deleted_at IS NULL;

-- 18. Deal đang Negotiation
SELECT d.name, a.name AS account, d.amount 
FROM deal d 
JOIN pipeline_stage s ON d.stage_id = s.id 
JOIN account a ON d.account_id = a.id
WHERE s.code = 'NEGOTIATION' AND d.deleted_at IS NULL;

-- 19. Activity đến hạn hôm nay
SELECT subject, type, due_date 
FROM activity 
WHERE DATE(due_date) = CURRENT_DATE AND status = 'pending';

-- 20. Activity quá hạn
SELECT subject, type, due_date 
FROM activity 
WHERE due_date < CURRENT_TIMESTAMP AND status = 'pending';

-- 21. Ticket chưa xử lý
SELECT subject, priority, created_at 
FROM ticket 
WHERE status = 'open' AND deleted_at IS NULL;

-- 22. Ticket sắp quá SLA
SELECT subject, sla_resolve_at 
FROM ticket 
WHERE status IN ('open', 'in_progress') AND deleted_at IS NULL 
  AND sla_resolve_at < CURRENT_TIMESTAMP + INTERVAL '2 hours';

-- 23. Lịch sử chăm sóc Account (Timeline 360)
SELECT type, subject, status, created_at 
FROM activity 
WHERE account_id = 'a0000000-0000-0000-0000-000000000001' 
ORDER BY created_at DESC;

-- 24. Lịch sử Activity của Lead
SELECT type, subject, status, due_date 
FROM activity 
WHERE lead_id IS NOT NULL 
ORDER BY created_at DESC;

-- 25. Lead Assignment History
SELECT l.full_name, u.full_name AS assigned_to, r.name AS rule_name, h.assigned_at 
FROM lead_assignment_history h
JOIN lead l ON h.lead_id = l.id
JOIN "user" u ON h.assigned_to = u.id
LEFT JOIN lead_assignment_rule r ON h.rule_id = r.id
ORDER BY h.assigned_at DESC;

-- 26. Deal Stage History
SELECT d.name AS deal_name, s1.name AS old_stage, s2.name AS new_stage, h.changed_at 
FROM deal_stage_history h
JOIN deal d ON h.deal_id = d.id
LEFT JOIN pipeline_stage s1 ON h.old_stage_id = s1.id
JOIN pipeline_stage s2 ON h.new_stage_id = s2.id
ORDER BY h.changed_at DESC;

-- 27. Discount đang chờ duyệt
SELECT d.name AS deal_name, dr.requested_discount_percent, dr.reason, dr.created_at
FROM discount_request dr
JOIN deal d ON dr.deal_id = d.id
WHERE dr.status = 'pending';

-- 28. Email Campaign đang active
SELECT name, created_at 
FROM campaign 
WHERE status = 'active';

-- 29. Campaign Enrollment đến lịch chạy (Worker Query)
SELECT e.id, c.name AS campaign, e.next_run_at 
FROM campaign_enrollment e
JOIN campaign c ON e.campaign_id = c.id
WHERE e.status = 'active' AND e.next_run_at <= CURRENT_TIMESTAMP;

-- 30. Email open/click rate
SELECT 
  ROUND((SUM(CASE WHEN status IN ('opened', 'clicked') THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0)), 2) AS open_click_rate
FROM email_message;

-- 31. Notification chưa đọc
SELECT title, created_at 
FROM notification 
WHERE user_id = '20000000-0000-0000-0000-000000000004' AND is_read = FALSE;

-- 32. Audit Log theo Entity
SELECT action, entity_id, created_at 
FROM audit_log 
WHERE entity_type = 'DEAL'
ORDER BY created_at DESC LIMIT 10;

-- 33. Permission của một User
SELECT DISTINCT p.name AS permission_name 
FROM permission p 
JOIN role_permission rp ON p.id = rp.permission_id
JOIN user_role ur ON rp.role_id = ur.role_id 
WHERE ur.user_id = '20000000-0000-0000-0000-000000000004';

-- 34. Team Members
SELECT u.full_name, t.name AS team_name 
FROM "user" u 
JOIN team_member tm ON u.id = tm.user_id 
JOIN team t ON tm.team_id = t.id;

-- 35. Webhook lỗi xử lý
SELECT provider, external_id, created_at 
FROM webhook_inbound 
WHERE processed_status = 'failed';
