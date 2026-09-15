# MẪU BÁO CÁO VÀ THEO DÕI SỰ CỐ UAT (UAT ISSUE LOG TEMPLATE)

> **Mục đích:** Chuẩn hóa quy trình ghi nhận, phân loại và theo dõi việc khắc phục các vấn đề phát sinh trong quá trình người dùng thực tế kiểm thử hệ thống (Human UAT).

---

## 1. TIÊU CHUẨN ĐỊNH NGHĨA MỨC ĐỘ NGHIÊM TRỌNG (SEVERITY)

| MỨC ĐỘ | TÊN TIẾNG VIỆT | ĐỊNH NGHĨA & TIÊU CHÍ | THỜI HẠN XỬ LÝ (SLA) |
| :---: | :--- | :--- | :---: |
| **CRITICAL** | **Khẩn cấp / Chặn toàn bộ** | Hệ thống sập (crash), lỗi 500 trắng màn hình, mất dữ liệu, rò rỉ bảo mật phân quyền chéo, không thể đăng nhập hoặc quy trình cốt lõi (Lead $\rightarrow$ Order $\rightarrow$ Payment) bị tắc nghẽn hoàn toàn không có cách xử lý thay thế. | Dưới 2 giờ |
| **HIGH** | **Nghiêm trọng** | Nghiệp vụ chính bị sai lệch (tính sai tiền, sai hoa hồng, không duyệt được đơn hàng, lộ mã kỹ thuật DB/FK constraint, form bắt nhập UUID thay vì tên người dùng). Gây hiểu lầm nghiêm trọng hoặc cản trở hoàn thành công việc. | Dưới 6 giờ |
| **MEDIUM** | **Trung bình / Khó thao tác** | Luồng nghiệp vụ vẫn hoàn thành được nhưng trải nghiệm khó khăn: format tiền dùng dấu phẩy kiểu Mỹ thay vì dấu chấm Việt Nam, thiếu cảnh báo hành động nguy hiểm, phải bấm nhiều bước không cần thiết, lỗi hiển thị responsive trên màn hình laptop 1366x768. | Dưới 24 giờ |
| **LOW** | **Nhẹ / Polish UI** | Sai sót nhỏ về chính tả, câu từ tiếng Việt chưa tự nhiên, khoảng cách lề (padding/margin) chưa đều, màu sắc icon chưa hài hòa, không ảnh hưởng đến nghiệp vụ. | Xử lý trước Go-Live |

---

## 2. QUY TRÌNH XỬ LÝ SỰ VỤ (UAT WORKFLOW)

$$\text{Mở lỗi [OPEN]} \longrightarrow \text{Tái hiện & Xác định Root Cause [REPRODUCED]} \longrightarrow \text{Khắc phục tối thiểu [IN_PROGRESS]} \longrightarrow \text{Kiểm tra hồi quy [RESOLVED]} \longrightarrow \text{Tester xác nhận & Đóng [CLOSED]}$$

* **OPEN:** Tester phát hiện và mở phiếu báo cáo lỗi.
* **REPRODUCED:** Đội ngũ kỹ thuật tái hiện thành công trên môi trường Staging.
* **IN_PROGRESS:** Đang áp dụng bản vá tối thiểu (minimum targeted fix).
* **RESOLVED:** Đã sửa xong, đã chạy kiểm thử hồi quy (regression test) pass 100%.
* **CLOSED:** Tester kiểm tra lại thực tế trên giao diện và xác nhận đóng lỗi.
* **REJECTED:** Không phải lỗi (sai nghiệp vụ hoặc thao tác không đúng điều kiện tiên quyết).

---

## 3. MẪU PHIẾU BÁO CÁO LỖI CHUẨN (BLANK TEMPLATE)

Copy khối markdown dưới đây cho mỗi sự cố phát sinh và gửi vào kênh theo dõi UAT:

```markdown
### [UAT-BUG-XXX] Tiêu đề ngắn gọn mô tả lỗi

* **Mã sự cố (ID):** UAT-BUG-XXX
* **UAT Baseline Version:** uat-v1.0.0
* **Vai trò kiểm thử (Role):** [BOSS | ADMIN | ACCOUNTANT | SALES_TEAM_LEADER | SALE | DEV_TEAM_LEADER | DEV | SEO_TEAM_LEADER | SEO]
* **Người phát hiện:** [Họ và tên Tester]
* **Thời gian phát hiện:** [dd/MM/yyyy HH:mm]
* **Màn hình / Trang (Page URL):** [Ví dụ: /orders/123 hoặc /payments]
* **Dữ liệu sử dụng (Data Used):** [Ví dụ: Mã đơn hàng ORD-2026-01, Lead ID 45, Số tiền 50.000.000 VND...]
* **Thiết bị & Màn hình:** [Laptop 1366x768 | Desktop 1920x1080 | Tablet 768px | Mobile 390px]

#### 1. Điều kiện tiên quyết (Preconditions)
* Tài khoản đang đăng nhập: `staging_...`
* Trạng thái dữ liệu ban đầu: (Ví dụ: Đơn hàng ORD-2026-01 đang ở trạng thái Chờ duyệt)

#### 2. Các bước tái hiện (Steps to Reproduce)
1. Bước 1: 
2. Bước 2: 
3. Bước 3: 

#### 3. Kết quả mong đợi (Expected Result)
* Giao diện/Hệ thống cần hiển thị hoặc thực hiện gì.

#### 4. Kết quả thực tế (Actual Result)
* Hệ thống thực tế phản hồi thế nào (kèm câu thông báo lỗi hoặc hành vi sai).

#### 5. Mức độ nghiêm trọng (Severity)
* [ ] CRITICAL
* [ ] HIGH
* [ ] MEDIUM
* [ ] LOW

#### 6. Bằng chứng đính kèm (Screenshots & Logs)
* Ảnh chụp màn hình lỗi (Screenshot): `[Dán link ảnh hoặc đính kèm file]`
* Lỗi Console / Network tab (nếu có):
```text
Dán log console hoặc status response lỗi tại đây (nếu có)
```

#### 7. Trạng thái theo dõi (Status)
* [x] OPEN
* [ ] IN_PROGRESS
* [ ] RESOLVED
* [ ] CLOSED
* [ ] REJECTED
```

---

## 4. VÍ DỤ MẪU ĐÃ ĐIỀN HOÀN CHỈNH (REFERENCE EXAMPLES)

### Ví dụ 1: Lỗi Mức độ HIGH (Sai sót trong phân công nhân sự)

```markdown
### [UAT-BUG-001] Nút chọn Sale chốt hợp đồng bắt nhập mã ID thay vì Họ và tên

* **Mã sự cố (ID):** UAT-BUG-001
* **UAT Baseline Version:** uat-v1.0.0
* **Vai trò kiểm thử (Role):** SALE
* **Người phát hiện:** Nguyễn Thị Mai (Tester Kinh Doanh)
* **Thời gian phát hiện:** 15/09/2026 14:20
* **Màn hình / Trang (Page URL):** `/deals/45` (Modal Chốt hợp đồng)
* **Dữ liệu sử dụng (Data Used):** Deal ID 45 "Gói Website Bất Động Sản", tài khoản `staging_sale`
* **Thiết bị & Màn hình:** Laptop 1366x768

#### 1. Điều kiện tiên quyết (Preconditions)
* Đăng nhập tài khoản `staging_sale`.
* Deal "Gói Website Bất Động Sản" đang ở trạng thái OPEN.

#### 2. Các bước tái hiện (Steps to Reproduce)
1. Mở chi tiết Deal `/deals/45`.
2. Bấm nút "Chốt hợp đồng (Đóng deal)".
3. Modal mở ra, quan sát trường "Nhân viên chốt hợp đồng".

#### 3. Kết quả mong đợi (Expected Result)
* Hiển thị ô tìm kiếm chọn nhân viên theo Họ tên kèm mã phụ (ví dụ: `Chuyên Viên Sales Team 1 (STG-SALE-01)`).

#### 4. Kết quả thực tế (Actual Result)
* Ô nhập bắt người dùng gõ số nguyên Employee ID (`12`), nhân viên kinh doanh không thể nhớ ID nội bộ trong database.

#### 5. Mức độ nghiêm trọng (Severity)
* [x] HIGH

#### 6. Bằng chứng đính kèm (Screenshots & Logs)
* Ảnh chụp màn hình: `attachments/modal_deal_closing_sale_id.png`

#### 7. Trạng thái theo dõi (Status)
* [ ] OPEN
* [x] RESOLVED (Đã thay bằng Searchable Select Họ tên + Avatar + Mã phụ)
* [x] CLOSED
```

---

### Ví dụ 2: Lỗi Mức độ MEDIUM (Định dạng tiền tệ chưa chuẩn tiếng Việt)

```markdown
### [UAT-BUG-002] Input số tiền chi phí dùng dấu phẩy kiểu Mỹ gây nhầm lẫn

* **Mã sự cố (ID):** UAT-BUG-002
* **UAT Baseline Version:** uat-v1.0.0
* **Vai trò kiểm thử (Role):** ACCOUNTANT
* **Người phát hiện:** Trần Minh Đức (Tester Kế Toán)
* **Thời gian phát hiện:** 15/09/2026 15:10
* **Màn hình / Trang (Page URL):** `/expenses` (Modal Tạo khoản chi)
* **Dữ liệu sử dụng (Data Used):** Khoản chi tiền mặt 10.000.000 VND, tài khoản `staging_accountant`
* **Thiết bị & Màn hình:** Desktop 1920x1080

#### 1. Điều kiện tiên quyết (Preconditions)
* Đăng nhập tài khoản `staging_accountant`.

#### 2. Các bước tái hiện (Steps to Reproduce)
1. Truy cập menu Quản lý chi phí `/expenses`.
2. Bấm "Tạo khoản chi".
3. Gõ vào ô số tiền: `10000000`.

#### 3. Kết quả mong đợi (Expected Result)
* Hiển thị phân cách hàng nghìn bằng dấu chấm chuẩn Việt Nam: `10.000.000 ₫`.

#### 4. Kết quả thực tế (Actual Result)
* Hiển thị phân cách dấu phẩy kiểu Mỹ: `10,000,000`, kế toán viên dễ nhầm với phần thập phân.

#### 5. Mức độ nghiêm trọng (Severity)
* [x] MEDIUM

#### 6. Bằng chứng đính kèm (Screenshots & Logs)
* Ảnh chụp màn hình: `attachments/expense_currency_comma.png`

#### 7. Trạng thái theo dõi (Status)
* [ ] OPEN
* [x] RESOLVED (Đã chuẩn hóa regex formatter sang dấu chấm hàng nghìn)
* [x] CLOSED
```

---

### Ví dụ 3: Lỗi Mức độ CRITICAL (Lỗ hổng bảo mật phân quyền chéo)

```markdown
### [UAT-BUG-003] Trưởng nhóm Sales Team 1 xem được Deal của Team 2

* **Mã sự cố (ID):** UAT-BUG-003
* **UAT Baseline Version:** uat-v1.0.0
* **Vai trò kiểm thử (Role):** SALES_TEAM_LEADER
* **Người phát hiện:** Vũ Tuấn Anh (QA Security)
* **Thời gian phát hiện:** 15/09/2026 16:00
* **Màn hình / Trang (Page URL):** `/deals/88`
* **Dữ liệu sử dụng (Data Used):** Deal ID 88 của Team Beta, tài khoản `staging_sales_leader` (Team Alpha)
* **Thiết bị & Màn hình:** Laptop 1366x768

#### 1. Điều kiện tiên quyết (Preconditions)
* Đăng nhập tài khoản `staging_sales_leader` (Team Kinh Doanh Alpha).
* Deal ID 88 thuộc sở hữu của thành viên Team Kinh Doanh Beta (`staging_sale_t2`).

#### 2. Các bước tái hiện (Steps to Reproduce)
1. Đăng nhập bằng `staging_sales_leader`.
2. Gõ trực tiếp lên URL: `http://localhost:5173/deals/88`.
3. Nhấn Enter.

#### 3. Kết quả mong đợi (Expected Result)
* Hệ thống chặn với thông báo "403 Không có quyền truy cập dữ liệu của nhóm khác".

#### 4. Kết quả thực tế (Actual Result)
* Trang vẫn mở ra toàn bộ thông tin giá trị hợp đồng và khách hàng của Team Beta.

#### 5. Mức độ nghiêm trọng (Severity)
* [x] CRITICAL

#### 6. Bằng chứng đính kèm (Screenshots & Logs)
* Response Network: `HTTP 200 OK` (lộ payload deal chi tiết).

#### 7. Trạng thái theo dõi (Status)
* [ ] OPEN
* [x] RESOLVED (Đã siết chặt kiểm tra team_id trong DealAuthorizationGuard)
* [x] CLOSED
```
