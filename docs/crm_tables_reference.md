# Cẩm Nang Chi Tiết Về Các Bảng Trong CSDL CRM (Database Tables Reference)

Tài liệu này giải thích chi tiết ý nghĩa, vai trò, các trường dữ liệu quan trọng, mối quan hệ khóa ngoại (Foreign Key) và các điểm lưu ý học thuật của từng bảng trong số **37 bảng** của hệ thống CRM. Đây là tài liệu giúp bạn nắm vững kiến trúc CSDL để tự tin trả lời bất kỳ câu hỏi nào từ Hội đồng giảng viên.

---

## MỤC LỤC PHÂN NHÓM 37 BẢNG
1. **Module 1: RBAC & Teams (Phân quyền và Đội nhóm)** - 7 bảng
2. **Module 2: Customer 360 (Khách hàng & Liên hệ)** - 5 bảng
3. **Module 3: Lead Management (Quản lý Lead & Phân bổ)** - 5 bảng
4. **Module 4: Pipeline & Deals (Quy trình Bán hàng & Cơ hội)** - 4 bảng
5. **Module 5: Discount Approval (Phê duyệt Giảm giá)** - 2 bảng
6. **Module 6: Customer Support (Chăm sóc Khách hàng)** - 2 bảng
7. **Module 7: Activity (Tác nghiệp & Tương tác)** - 1 bảng
8. **Module 8: Marketing Campaign (Chiến dịch Email tự động)** - 5 bảng
9. **Module 9: Live Chat (Trực tuyến)** - 2 bảng
10. **Module 10: Automation (Tự động hóa hệ thống)** - 1 bảng
11. **Module 11: Webhook & Notifications (Kết nối & Thông báo)** - 2 bảng
12. **Module 12: Audit Logs (Ghi nhật ký hệ thống)** - 1 bảng

---

## 1. MODULE 1: RBAC & TEAMS (PHÂN QUYỀN VÀ ĐỘI NHÓM)

Hệ thống phân quyền dựa trên vai trò (Role-Based Access Control) kết hợp cơ cấu phòng ban kinh doanh.

### 1. Bảng `role` (Vai trò)
- **Mục đích**: Định nghĩa các chức danh/vai trò trong hệ thống (ví dụ: Admin, Sales Manager, Sales Rep, Support, Marketing).
- **Trường cốt lõi**: `name` (tên vai trò, duy nhất), `description`.

### 2. Bảng `permission` (Quyền hạn)
- **Mục đích**: Định nghĩa các quyền hạn cụ thể trong hệ thống để bảo vệ API (ví dụ: `lead:create`, `deal:approve`, `report:view`).
- **Trường cốt lõi**: `name` (tên quyền, duy nhất), `module` (phân cụm quyền để dễ quản lý trên UI).

### 3. Bảng `role_permission` (Bảng trung gian Quyền - Vai trò)
- **Mục đích**: Liên kết nhiều-nhiều giữa `role` và `permission`. Một vai trò có nhiều quyền và một quyền có thể gán cho nhiều vai trò.
- **Trường cốt lõi**: `role_id` và `permission_id` làm Khóa chính liên hợp (Composite PK).
- **Khóa ngoại**: Cascade DELETE khi xóa vai trò hoặc quyền.

### 4. Bảng `"user"` (Người dùng/Nhân viên)
- **Mục đích**: Lưu thông tin tài khoản đăng nhập của nhân viên công ty.
- **Trường cốt lõi**: `email` (duy nhất), `password_hash`, `status` (active/inactive/suspended).
- > [!IMPORTANT]
  > **Mẹo trả lời giảng viên**: Tên bảng được viết trong dấu ngoặc kép `"user"` vì `USER` là từ khóa dự trữ của PostgreSQL. Việc bao ngoặc kép giúp hệ thống biên dịch SQL hiểu đây là thực thể bảng vật lý, tránh lỗi syntax.

### 5. Bảng `user_role` (Bảng trung gian Người dùng - Vai trò)
- **Mục đích**: Liên kết nhiều-nhiều giữa `"user"` và `role`. Một nhân viên có thể kiêm nhiệm nhiều vai trò (ví dụ: vừa làm Admin vừa làm Sales Manager).
- **Trường cốt lõi**: `user_id` và `role_id`.

### 6. Bảng `team` (Đội nhóm bán hàng)
- **Mục đích**: Quản lý các nhóm kinh doanh theo khu vực hoặc sản phẩm (ví dụ: Sales miền Bắc, Sales miền Nam).
- **Trường cốt lõi**: `name` (duy nhất), `description`.

### 7. Bảng `team_member` (Thành viên nhóm)
- **Mục đích**: Liên kết nhiều-nhiều giữa `team` và `"user"`. Một nhân viên có thể thuộc một hoặc nhiều đội nhóm.
- **Trường cốt lõi**: `team_id` và `user_id`.

---

## 2. MODULE 2: CUSTOMER 360 (KHÁCH HÀNG & LIÊN HỆ)

Quản lý thông tin cốt lõi của doanh nghiệp khách hàng và người liên hệ trực tiếp trong môi trường B2B.

### 8. Bảng `account` (Khách hàng Doanh nghiệp)
- **Mục đích**: Lưu thông tin pháp nhân doanh nghiệp (Khách hàng B2B).
- **Trường cốt lõi**: `name` (tên công ty), `segment` (VIP, regular, potential), `owner_id` (nhân viên phụ trách chăm sóc tài khoản này).
- **Soft Delete**: Có cột `deleted_at`. Khi doanh nghiệp ngừng hợp tác, ta chỉ đánh dấu xóa mềm để không ảnh hưởng dữ liệu hóa đơn/lịch sử giao dịch.

### 9. Bảng `contact` (Người liên hệ đại diện)
- **Mục đích**: Lưu thông tin cá nhân của các nhân sự làm việc trong `account` (ví dụ: Giám đốc mua hàng, Kế toán trưởng).
- **Trường cốt lõi**: `account_id` (Bắt buộc phải có - `NOT NULL`), `first_name`, `last_name`, `email`, `phone`, `job_title`, `is_primary` (cờ đánh dấu đây là người làm việc chính).
- **Khóa ngoại**: Liên kết sang `account(id)` với ràng buộc `ON DELETE RESTRICT` để tránh việc xóa doanh nghiệp làm mất sạch thông tin người liên hệ.
- > [!NOTE]
  > **Mẹo trả lời giảng viên**: Có ràng buộc `UNIQUE (account_id, id)` để phục vụ việc tạo Composite FK ở bảng giao dịch (`deal`) và bảng hỗ trợ (`ticket`), đảm bảo tính nhất quán dữ liệu B2B.

### 10. Bảng `tag` (Nhãn dán phân loại)
- **Mục đích**: Gắn nhãn tự do cho khách hàng (ví dụ: "Ngành Dệt May", "Khách hàng khó tính", "Nguồn giới thiệu").
- **Trường cốt lõi**: `name` (duy nhất), `color` (mã màu hiển thị giao diện).

### 11. Bảng `account_tag` (Bảng trung gian Nhãn - Doanh nghiệp)
- **Mục đích**: Quan hệ nhiều-nhiều giữa `account` và `tag`.
- **Trường cốt lõi**: `account_id` và `tag_id`.

---

## 3. MODULE 3: LEAD MANAGEMENT (QUẢN LÝ LEAD & PHÂN BỔ)

Phân hệ thu thập cơ hội thô (Leads) đa kênh và phân bổ tự động cho đội ngũ kinh doanh.

### 12. Bảng `lead_source` (Nguồn Lead)
- **Mục đích**: Định nghĩa các kênh đổ Lead về (Website, Facebook Ads, Google Ads, Zalo OA, Import Excel).
- **Trường cốt lõi**: `code` (mã kênh, ví dụ: `FB_ADS`), `name` (tên hiển thị).

### 13. Bảng `lead_status` (Trạng thái Lead)
- **Mục đích**: Các bước xử lý Lead (Mới, Đã liên hệ, Tiềm năng, Đã chuyển đổi, Thất bại).
- **Trường cốt lõi**: `is_converted` (Cờ BOOLEAN NOT NULL). Khi Sales bấm "Convert" Lead sang Khách hàng, hệ thống dựa vào cờ này để kích hoạt luồng tự động tạo `account` và `contact`.

### 14. Bảng `lead` (Dữ liệu Lead thô)
- **Mục đích**: Lưu thông tin người đăng ký quan tâm dịch vụ nhưng chưa thẩm định sâu.
- **Trường cốt lõi**: `full_name`, `company_name`, `source_id`, `status_id` (`NOT NULL`), `expected_value` (giá trị dự kiến, `>= 0`), `converted_account_id` và `converted_contact_id` (dùng để lưu vết sau khi chuyển đổi).
- **Soft Delete**: Sử dụng `deleted_at`.

### 15. Bảng `lead_assignment_rule` (Quy tắc phân bổ Lead)
- **Mục đích**: Lưu cấu hình chia Lead tự động (ví dụ: Round Robin - chia đều xoay vòng, Geo Location - theo địa lý, Source - chia theo nguồn quảng cáo).
- **Trường cốt lõi**: `rule_type`, `conditions` (dạng dữ liệu JSONB chứa các quy tắc logic nghiệp vụ linh hoạt).

### 16. Bảng `lead_assignment_rule_member` (Thành viên nhận Lead)
- **Mục đích**: Danh sách các Sales được tham gia vào quy tắc chia Lead tự động.
- **Trường cốt lõi**: `rule_id`, `user_id`, `order_index` (thứ tự chia xoay vòng, bắt đầu từ 0 và không âm), `is_active`.
- **Ràng buộc**: `UNIQUE(rule_id, order_index)` để đảm bảo không có hai Sales nào trùng vị trí xoay vòng trong cùng một rule chia Lead.

### 17. Bảng `lead_assignment_history` (Lịch sử chia Lead)
- **Mục đích**: Ghi log chi tiết hệ thống đã chia Lead này cho ai, lúc nào, bằng rule gì để phục vụ audit/khiếu nại của Sales.
- **Khóa ngoại**: Liên kết tới `lead(id)` dùng `ON DELETE RESTRICT` để không làm mất dấu vết tác nghiệp chia Lead kể cả khi Lead bị xóa.

---

## 4. MODULE 4: PIPELINE & DEALS (QUY TRÌNH BÁN HÀNG & CƠ HỘI)

Đây là phân hệ lõi của hoạt động kinh doanh, theo dõi quy trình thương lượng báo giá.

### 18. Bảng `pipeline` (Quy trình bán hàng)
- **Mục đích**: Định nghĩa luồng bán hàng (ví dụ: Quy trình bán phần mềm B2B, Quy trình bán gói dịch vụ tư vấn).
- **Trường cốt lõi**: `name`, `is_active`.

### 19. Bảng `pipeline_stage` (Bước/Giai đoạn bán hàng)
- **Mục đích**: Định nghĩa các bước trong Pipeline (ví dụ: Nhận thức -> Gửi báo giá -> Đàm phán -> Won -> Lost).
- **Trường cốt lõi**: `pipeline_id`, `code` (mã bước), `order_index` (thứ tự Kanban, `>= 0`), `default_probability` (xác suất chiến thắng mặc định của bước này, từ 0-100), `is_closed_won` và `is_closed_lost`.
- **Ràng buộc**: `CONSTRAINT chk_won_lost_exclusive CHECK (NOT (is_closed_won = TRUE AND is_closed_lost = TRUE))` chặn không cho thiết lập một Stage vừa thắng vừa thua cùng lúc.

### 20. Bảng `deal` (Cơ hội/Giao dịch bán hàng)
- **Mục đích**: Lưu trữ thông tin một đơn hàng đang đàm phán.
- **Trường cốt lõi**: `account_id`, `contact_id`, `pipeline_id`, `stage_id`, `amount` (giá trị đơn hàng, `>= 0`), `probability` (xác suất thực tế do Sales tự đánh giá, nếu NULL sẽ dùng mặc định của Stage).
- > [!IMPORTANT]
    > **Ràng buộc Composite FK cực quan trọng (Điểm cộng lớn khi bảo vệ đồ án)**:
    > 1. `FOREIGN KEY (pipeline_id, stage_id) REFERENCES pipeline_stage(pipeline_id, id)`: Chặn lỗi Deal thuộc Pipeline A nhưng lại trỏ sang Stage của Pipeline B.
    > 2. `FOREIGN KEY (account_id, contact_id) REFERENCES contact(account_id, id)`: Đảm bảo Contact gắn vào Deal bắt buộc phải là nhân viên trực thuộc đúng Account của Deal đó.

### 21. Bảng `deal_stage_history` (Lịch sử chuyển đổi Stage của Deal)
- **Mục đích**: Lưu vết mỗi lần Deal chuyển từ Stage cũ sang Stage mới (dùng để vẽ biểu đồ báo cáo vận tốc bán hàng - Sales Velocity).
- **Khóa ngoại**: Liên kết tới `deal(id)` dùng `ON DELETE RESTRICT` để bảo vệ lịch sử dòng tiền.

---

## 5. MODULE 5: DISCOUNT APPROVAL (PHÊ DUYỆT GIẢM GIÁ)

Kiểm soát chặt chẽ chính sách chiết khấu/giảm giá trên từng Deal để bảo toàn lợi nhuận doanh nghiệp.

### 22. Bảng `discount_request` (Yêu cầu giảm giá)
- **Mục đích**: Khi Sales muốn chiết khấu cho khách hàng vượt khung, họ phải tạo phiếu yêu cầu phê duyệt.
- **Trường cốt lõi**: `deal_id`, `requester_id`, `requested_discount_percent` (tỷ lệ phần trăm giảm giá, từ 0-100), `reason` (lý do xin giảm giá, bắt buộc), `status` (pending/approved/rejected).

### 23. Bảng `discount_approval_step` (Các bước phê duyệt chi tiết)
- **Mục đích**: Quy trình duyệt nhiều cấp (ví dụ: Cấp 1 Trưởng nhóm duyệt, Cấp 2 Giám đốc duyệt).
- **Trường cốt lõi**: `request_id`, `approver_id`, `step_order` (thứ tự bước duyệt, bắt đầu từ 0 và không âm), `status`, `comments` (ý kiến phê duyệt).
- **Ràng buộc**: `UNIQUE (request_id, step_order)` để đảm bảo một phiếu yêu cầu không bị lặp thứ tự duyệt.

---

## 6. MODULE 6: CUSTOMER SUPPORT (CHĂM SÓC KHÁCH HÀNG)

Hệ thống quản lý phản hồi, khiếu nại (Ticketing System) theo cam kết chất lượng dịch vụ (SLA).

### 24. Bảng `ticket` (Phiếu yêu cầu hỗ trợ)
- **Mục đích**: Tiếp nhận lỗi/yêu cầu từ khách hàng sau bán.
- **Trường cốt lõi**: `subject`, `account_id`, `contact_id`, `priority` (low/medium/high/urgent), `status` (open/in_progress/resolved/closed), `sla_resolve_at` (thời hạn bắt buộc phải xử lý xong).
- **Khóa ngoại**: Composite FK liên kết `(account_id, contact_id)` sang bảng `contact` để đảm bảo người báo lỗi đúng là người của doanh nghiệp đó.

### 25. Bảng `ticket_reply` (Trao đổi trong Ticket)
- **Mục đích**: Lưu các tin nhắn qua lại giữa nhân viên hỗ trợ (Support Agent) và khách hàng.
- **Trường cốt lõi**: `ticket_id`, `user_id` (nhân viên trả lời, nếu khách hàng gửi từ portal thì để NULL), `message`, `is_internal` (BOOLEAN - cờ ghi chú nội bộ giữa các Sales/Support với nhau, khách hàng không nhìn thấy).

---

## 7. MODULE 7: ACTIVITY (TÁC NGHIỆP & TƯƠNG TÁC)

Quản lý toàn bộ lịch trình làm việc, lịch hẹn, cuộc gọi của nhân viên.

### 26. Bảng `activity` (Hoạt động tương tác)
- **Mục đích**: Lưu vết lịch hẹn gặp, cuộc gọi điện, gửi email chăm sóc.
- **Trường cốt lõi**: `type` (call/meeting/email/task/note/zalo), `subject`, `due_date` (hạn hoàn thành), `status` (pending/completed/canceled).
- > [!IMPORTANT]
  > **Ràng buộc thiết kế đa hình (Polymorphic Relation)**:
  > Bảng chứa các cột FK: `lead_id`, `account_id`, `contact_id`, `deal_id`, `ticket_id`. 
  > Sử dụng ràng buộc: `CONSTRAINT chk_activity_single_entity CHECK (num_nonnulls(lead_id, account_id, contact_id, deal_id, ticket_id) = 1)`.
  > **Mẹo trả lời**: Điều này ép buộc một Activity chỉ được phép thuộc về duy nhất một đối tượng cụ thể (ví dụ: cuộc gọi này là chăm sóc cho Lead A, hoặc cuộc họp này bàn về Deal B), ngăn chặn dữ liệu rác liên kết lung tung.

---

## 8. MODULE 8: MARKETING CAMPAIGN (CHIẾN DỊCH EMAIL TỰ ĐỘNG)

Quản lý các chuỗi email tự động theo kịch bản (Drip Email Marketing) để nuôi dưỡng Lead.

### 27. Bảng `email_template` (Mẫu Email)
- **Mục đích**: Lưu tiêu đề và nội dung HTML của các email gửi đi.
- **Trường cốt lõi**: `name`, `subject`, `body_html`.

### 28. Bảng `campaign` (Chiến dịch Marketing)
- **Mục đích**: Khởi tạo một chiến dịch Marketing tự động (ví dụ: Nuôi dưỡng Lead mới đăng ký).
- **Trường cốt lõi**: `name`, `status` (draft/active/completed).

### 29. Bảng `campaign_step` (Các bước trong chiến dịch)
- **Mục đích**: Thiết lập các bước gửi email/tạo task nối tiếp nhau (ví dụ: Bước 0 gửi email Welcome ngay lập tức; Bước 1 gửi email giới thiệu tính năng sau 3 ngày).
- **Trường cốt lõi**: `campaign_id`, `step_order` (thứ tự bước, không âm), `action_type` (email hoặc task), `template_id` (trỏ đến mẫu email nếu action là email), `delay_minutes` (thời gian chờ trước khi chạy bước này).
- **Ràng buộc**: `CONSTRAINT chk_email_template CHECK ((action_type = 'email' AND template_id IS NOT NULL) OR (action_type <> 'email'))`. Nếu hành động là gửi email thì bắt buộc phải chọn Template mẫu.

### 30. Bảng `campaign_enrollment` (Thành viên tham gia chiến dịch)
- **Mục đích**: Danh sách các Lead hoặc Contact đang tham gia chạy chuỗi email tự động này.
- **Trường cốt lõi**: `campaign_id`, `lead_id` hoặc `contact_id` (sử dụng check constraint `num_nonnulls(lead_id, contact_id) = 1` để đảm bảo đối tượng tham gia chỉ là Lead hoặc Contact).
- **Khóa ngoại**: Composite FK liên hợp `FOREIGN KEY (campaign_id, current_step_id) REFERENCES campaign_step(campaign_id, id) ON DELETE RESTRICT` để đảm bảo hệ thống đang chạy email của bước nào thì không ai được phép xóa bước đó trong cấu hình chiến dịch.

### 31. Bảng `email_message` (Nhật ký gửi Email)
- **Mục đích**: Lưu log từng email thực tế đã gửi đi cho khách hàng nào, trạng thái nhận email thế nào.
- **Trường cốt lõi**: `recipient_email`, `subject`, `enrollment_id`, `status` (pending/sent/opened/clicked/bounced).

---

## 9. MODULE 9: LIVE CHAT (TRỰC TUYẾN)

Hệ thống lưu trữ lịch sử hội thoại từ widget chat trên website.

### 32. Bảng `chat_session` (Phiên hội thoại)
- **Mục đích**: Quản lý một phiên chat của khách vãng lai ghé thăm web.
- **Trường cốt lõi**: `visitor_identifier` (địa chỉ IP hoặc mã cookie khách truy cập), `lead_id` (liên kết với Lead nếu họ để lại email đăng ký), `support_user_id` (sales hoặc bot phụ trách chat).

### 33. Bảng `chat_message` (Tin nhắn chat)
- **Mục đích**: Nội dung tin nhắn chi tiết trong phiên chat.
- **Trường cốt lõi**: `session_id`, `sender_type` (visitor/agent/bot), `message` (nội dung text).

---

## 10. MODULE 10: AUTOMATION (TỰ ĐỘNG HÓA HỆ THỐNG)

Cấu hình các quy tắc tự động hóa theo mô hình Trigger - Action.

### 34. Bảng `automation_rule` (Quy tắc tự động)
- **Mục đích**: Định nghĩa các rule hệ thống (ví dụ: Khi Lead tạo mới -> tự động đẩy vào Campaign Chăm Sóc).
- **Trường cốt lõi**: `trigger_event` (sự kiện kích hoạt), `conditions` (dạng JSONB chứa điều kiện lọc dữ liệu), `actions` (dạng JSONB chứa chuỗi hành động thực thi tự động).

---

## 11. MODULE 11: WEBHOOK & NOTIFICATIONS (KẾT NỐI & THÔNG BÁO)

### 35. Bảng `webhook_inbound` (Nhận Webhook từ hệ thống khác)
- **Mục đích**: Nhận dữ liệu bắn về từ bên thứ ba (như Facebook Lead Form, Google Form).
- **Trường cốt lõi**: `provider`, `external_id` (ID của sự kiện phía đối tác), `payload` (chứa toàn bộ data JSON của đối tác gửi về).
- > [!IMPORTANT]
  > **Chỉ mục Partial Unique Index**: 
  > Tạo index `CREATE UNIQUE INDEX idx_webhook_external_id ON webhook_inbound(provider, external_id) WHERE external_id IS NOT NULL;`.
  > **Mẹo trả lời**: Ràng buộc này đảm bảo hệ thống không bao giờ xử lý trùng lặp một Lead/Webhook bắn về 2 lần từ Facebook/Google, đồng thời bỏ qua các webhook không có ID bên ngoài (external_id = NULL).

### 36. Bảng `notification` (Thông báo người dùng)
- **Mục đích**: Đẩy thông báo chuông cho nhân viên trên hệ thống CRM (ví dụ: "Bạn được gán phụ trách một Deal mới").
- **Trường cốt lõi**: `user_id` (nhân viên nhận), `title`, `message`, `is_read` (đọc hay chưa).

---

## 12. MODULE 12: AUDIT LOGS (GHI NHẬT KÝ HỆ THỐNG)

### 37. Bảng `audit_log` (Nhật ký kiểm toán)
- **Mục đích**: Ghi lại lịch sử ai đã thêm, sửa, xóa bất cứ thứ gì trong CRM để phục vụ thanh tra dữ liệu và bảo mật.
- **Trường cốt lõi**: `id` (sử dụng **BIGINT GENERATED ALWAYS AS IDENTITY** làm khóa chính thay vì UUID để tối ưu tốc độ chèn log liên tục), `user_id` (ai làm), `action` (hành động: CREATE, UPDATE, DELETE), `entity_type` (bảng nào bị tác động), `old_data` và `new_data` (dạng JSONB lưu snapshot dữ liệu trước và sau khi thay đổi).
