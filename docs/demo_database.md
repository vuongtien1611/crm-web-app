# Tài Liệu Database CRM Demo (Version 1.0 - Bản Số Ít)

Tài liệu hướng dẫn triển khai và các câu hỏi vấn đáp bảo vệ đồ án CRM Database.

## 1. Hướng dẫn khởi tạo Database

Để thiết lập môi trường hoàn chỉnh, chạy lần lượt các lệnh sau trên Server:

```bash
# 1. Tạo Database trắng (Môi trường test, không dùng DB Production)
createdb crm_test

# 2. Import Schema Cấu trúc (Bắt buộc chạy đầu tiên)
psql -d crm_test -f database/crm_schema.sql

# 3. Import Seed Data (Dữ liệu mẫu B2B chuyên nghiệp)
psql -d crm_test -f database/crm_seed.sql

# 4. Chạy Unit Test kiểm thử Ràng Buộc (Đảm bảo integrity)
psql -d crm_test -f database/test_constraints.sql

# 5. Chạy các Query Demo phục vụ Dashboard
psql -d crm_test -f database/crm_demo_queries.sql
```

## 2. Tóm tắt các Module Database (37 Bảng)
- **Core & RBAC**: `"user"`, `role`, `permission`, `team`, `team_member`.
- **Customer 360**: `account`, `contact`, `tag`, `account_tag`.
- **Lead & Assignment**: `lead`, `lead_source`, `lead_status`, `lead_assignment_rule`, `lead_assignment_history`.
- **Sales & Pipeline**: `deal`, `pipeline`, `pipeline_stage`, `deal_stage_history`, `discount_request`, `discount_approval_step`.
- **Care (Hậu mãi)**: `ticket`, `ticket_reply`, `activity`.
- **Marketing (Automation)**: `campaign`, `campaign_step`, `campaign_enrollment`, `email_template`, `email_message`.
- **Chat & System**: `chat_session`, `chat_message`, `automation_rule`, `webhook_inbound`, `notification`, `audit_log`.

## 3. Các Constraint Tinh Hoa Đáng Chú Ý (Điểm Cộng)
- **Composite FK Pipeline/Stage**: Ép Deal không thể chọn nhầm Stage của Pipeline khác.
- **Composite FK Account/Contact**: Contact trong Deal hoặc Ticket bắt buộc phải trực thuộc đúng Account đó.
- **Activity Single Entity**: Dùng `CHECK(num_nonnulls(...) = 1)` bảo đảm Activity không bị gắn mập mờ nhiều thực thể.
- **Discount History RESTRICT**: Lịch sử phê duyệt (`discount_approval_step` và `discount_request`) sử dụng ON DELETE RESTRICT, chống xóa cứng.
- **Partial Unique Webhook**: `CREATE UNIQUE INDEX ... WHERE external_id IS NOT NULL` chống ghi đè payload trùng của bên thứ 3.
- **Soft Delete**: Các Entities cốt lõi (lead, deal, account, ticket) chỉ sử dụng cờ `deleted_at`.
- **Trigger `updated_at`**: Đẩy trách nhiệm cập nhật timestamp về Database qua hàm Trigger tự động.

## 4. Trả Lời Vấn Đáp (10 Câu hỏi Bảo Vệ Đồ Án)

**Q1: Tại sao dùng UUID làm Khóa Chính thay vì Serial ID?**
A: UUID (gen_random_uuid) giúp dễ dàng gộp (merge) dữ liệu từ nhiều shard/database, ẩn giấu số lượng bản ghi thực tế của hệ thống khỏi user, và phân tán tải sinh ID cho Backend.

**Q2: Tại sao riêng bảng Audit Log lại dùng BIGINT GENERATED ALWAYS AS IDENTITY?**
A: Audit Log là dạng dữ liệu "Append-Only" (chỉ thêm mới, không sửa/xóa) ghi liên tiếp với tốc độ cao. BIGINT tuần tự giúp giảm phân mảnh (fragmentation) cho cây B-Tree Index, tối ưu I/O ghi tốt hơn so với độ ngẫu nhiên của UUID.

**Q3: Tại sao Forecast Revenue lại dùng SQL VIEW (view_forecast_pipeline)?**
A: Doanh thu dự báo phụ thuộc vào Amount, Xác suất (Probability) của Deal và Xác suất mặc định của Stage. Tạo bảng vật lý sẽ phải duy trì Trigger đồng bộ rất tốn kém và nguy cơ sai sót. SQL View tính toán Real-time qua `COALESCE` là chuẩn hóa an toàn nhất.

**Q4: Tại sao bảng deal lại không có cột Status (Open/Won/Lost)?**
A: Quyết định dựa trên chuẩn hóa 3NF. Trạng thái Đóng/Mở của Deal được suy ra hoàn toàn từ cấu hình `is_closed_won` hoặc `is_closed_lost` của Pipeline Stage. Nếu lưu `status` trực tiếp trên Deal, hệ thống sẽ chứa Dữ liệu dẫn xuất bị lặp (Redundancy), dễ dẫn đến mâu thuẫn.

**Q5: Tại sao Contact bắt buộc thuộc Account (`account_id NOT NULL`)?**
A: CRM này tuân theo luồng nghiệp vụ B2B (Business-to-Business). Khách hàng cốt lõi là Doanh Nghiệp (Account). Một người liên hệ (Contact) bắt buộc phải đại diện cho một Doanh nghiệp.

**Q6: Bạn dùng Composite FK cho Pipeline và Stage để làm gì?**
A: Để loại bỏ hoàn toàn lỗi Logic ứng dụng. Giả sử Pipeline A có Stage X, Pipeline B có Stage Y. Composite FK `(pipeline_id, stage_id)` ép Deal nếu đã chọn Pipeline A thì Database CHỈ cho phép gán Stage X, từ chối Stage Y ở cấp độ CSDL.

**Q7: ON DELETE RESTRICT khác CASCADE như thế nào trong nghiệp vụ CRM?**
A: CASCADE tự động xóa sạch bảng con khi xóa bảng cha (gây mất dữ liệu tác nghiệp nếu user ấn nhầm). RESTRICT sẽ "Báo Lỗi" và chặn việc xóa bảng cha nếu vẫn còn dữ liệu con bên trong. Trong CRM, bắt buộc dùng RESTRICT để ép người dùng chỉ được dùng Soft Delete, giữ lại dữ liệu kế toán/lịch sử.

**Q8: Tại sao lại cần Partial Index (`WHERE deleted_at IS NULL`)?**
A: Hơn 95% các truy vấn trên giao diện người dùng chỉ gọi ra các bản ghi "đang sống". Việc tạo Partial Index với mệnh đề WHERE giúp cây B-Tree Index cực kỳ nhẹ, không chứa rác, mang lại tốc độ truy vấn List/Dashboard cực nhanh.

**Q9: Activity dùng `num_nonnulls` để làm gì?**
A: Bảng Activity được thiết kế theo kiểu đa hình. Một Activity có thể gắn cho Lead, hoặc Account, hoặc Deal... Ràng buộc `CHECK (num_nonnulls(...) = 1)` buộc mỗi Activity CHỈ ĐƯỢC PHÉP liên kết với đúng 1 đối tượng, không hơn không kém.

**Q10: Vì sao CHECK constraint về Status bắt buộc phải đi kèm NOT NULL?**
A: Trong PostgreSQL, mệnh đề CHECK (ví dụ: `status IN ('open', 'closed')`) sẽ bỏ qua và ngầm hiểu là Hợp lệ (Pass) nếu giá trị là `NULL`. Để Database thực sự từ chối những trạng thái vô nghĩa, cột đó bắt buộc phải có `NOT NULL`.
