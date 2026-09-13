# Hướng Dẫn Chuẩn Bị & Import Dữ Liệu Doanh Nghiệp (Data Preparation & Import Guide)

Tài liệu hướng dẫn quy trình kiểm toán, làm sạch và chuẩn bị dữ liệu thực tế của doanh nghiệp trước khi đưa vào hệ thống CRM (môi trường Staging để UAT và Production khi Go-Live).

---

## 1. Nguyên Tắc Cốt Lõi (Core Principles)

1. **Tuyệt Đối Không Import Dữ Liệu Thật Khi Chưa Được Phê Duyệt**:
   - Dữ liệu khách hàng, số điện thoại, hợp đồng và tài chính của khách hàng thật chỉ được import vào Production sau khi Giám đốc/User ký duyệt.
   - Môi trường Staging UAT sử dụng dữ liệu giả lập (synthetic / mock data) có cấu trúc tương đương dữ liệu thực tế.
2. **Thứ Tự Nhập Liệu Chuẩn Nghiệp Vụ (Dependency Order)**:
   1. `positions` & `roles` (Chức vụ & Quyền hạn)
   2. `teams` (Phòng ban & Đội nhóm)
   3. `employees` & `team_memberships` & `salary_history` (Hồ sơ nhân viên & Bảng phân công)
   4. `services` & `service_requirement_templates` (Danh mục dịch vụ)
   5. `platforms` & `channels` & `sale_market_assignments` (Nguồn & Kênh tiếp cận)
   6. `commission_policies` & `kpi_policies` (Chính sách hoa hồng & KPI)
   7. `customers` / `accounts` & `contacts` (Khách hàng doanh nghiệp & Đầu mối liên hệ)
   8. `leads` (Khách hàng tiềm năng hiện có)
   9. `orders` & `order_items` & `projects` (Đơn hàng và dự án đang triển khai)

---

## 2. Danh Sách Bản Mẫu CSV (CSV Templates)

Các file mẫu chuẩn hóa được lưu trữ tại thư mục: [`docs/data-templates/`](file:///home/vuongductien/Tài%20liệu/du-an-cuoi-khoa-f8/docs/data-templates):

| Tệp Mẫu | Mục Đích | Trường Khóa | Ghi Chú Nghiệp Vụ |
| :--- | :--- | :--- | :--- |
| `employees_template.csv` | Danh sách nhân viên | `employee_code`, `email` | `position_code` phải khớp bảng `positions` |
| `teams_template.csv` | Danh sách phòng ban / team | `code` | `department` thuộc SALES, DEV, SEO, OPERATION |
| `customers_template.csv` | Thông tin khách hàng | `tax_code`, `phone` | Tự động tạo `account` và `contact` |
| `leads_template.csv` | Khách hàng tiềm năng | `phone`, `email` | Gán đúng `platform_code` và `channel_code` |
| `orders_template.csv` | Đơn hàng / Hợp đồng đang chạy | `order_title` | Phải duyệt qua trạng thái `PENDING_APPROVAL` |

---

## 3. Quy Trình Kiểm Tra & Xác Nhận Dữ Liệu (Validation Checklist)

Trước khi chạy script import:
- [x] Kiểm tra trùng lặp số điện thoại khách hàng (Lead phone de-duplication).
- [x] Định dạng ngày tháng chuẩn ISO `YYYY-MM-DD`.
- [x] Mã nhân viên duy nhất theo quy chuẩn (ví dụ `EMP-XXX`, `STG-XXX`).
- [x] Giá trị tiền tệ là số nguyên dương, tiền tệ chuẩn VND.
- [x] Mã chức vụ khớp với 6 canonical positions (`BOSS`, `ACCOUNTANT`, `SALE`, `SALES_TEAM_LEADER`, `DEV`, `SEO`).
