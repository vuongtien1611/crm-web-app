# BÁO CÁO CHI TIẾT CÁC VẤN ĐỀ, KHOẢNG TRỐNG & BẢNG PHÂN CÔNG BÀN GIAO (AUDIT ISSUES & WORK BREAKDOWN) — CRM VMAX

**Môi trường:** Local UAT (`http://localhost:5200` / `http://localhost:3200`)  
**Nhánh kiểm tra:** `feature/audit-16-30` (commit `1fd3a5f`)  
**Nguyên tắc vận hành:** **READ ONLY** — Tuyệt đối không sửa code, không sửa test, không đổi schema hay cấu hình.  
**Mục tiêu tài liệu:** Bàn giao danh mục lỗi và khoảng trống chức năng đáng tin cậy để đội ngũ phát triển xử lý độc lập.

---

## I. BẢNG PHÂN CÔNG CÔNG VIỆC BÀN GIAO THEO MODULE (WORK BREAKDOWN & HANDOVER TABLE)

| Issue ID | Mức ưu tiên | Module | Phân loại | Trạng thái kiểm chứng | File liên quan | Nguyên nhân gốc (Root Cause) | Đề xuất sửa tối thiểu (Minimal Fix) | Regression Test bắt buộc |
|---|---|---|---|---|---|---|---|---|
| **GAP-001** | **P0** | Orders & Projects | **MISSING UI** (Blocker) | **VERIFIED** | `apps/web/src/pages/orders/OrderDetailPage.tsx`:620–695<br>`apps/web/src/pages/projects/ProjectsListPage.tsx`:190–260 | Backend có sẵn `POST /api/order-items/:id/assign-project` nhưng giao diện `OrderDetailPage` thiếu nút bấm kích hoạt khi đơn `APPROVED` và `ProjectsListPage` chưa render view xử lý tab `?tab=assign`. | 1. Tại `OrderDetailPage.tsx`, thêm nút `<Button type="primary">Khởi tạo Project</Button>` mở Modal chọn nhân viên và gọi `assignProjectApi`.<br>2. Tại `ProjectsListPage.tsx`, render tab gom các order items chờ tạo project. | `pnpm --filter api test:project`<br>`pnpm --filter api test:order`<br>`pnpm --filter api test:phase-q-e2e` |
| **GAP-002** | **P1** | Orders & Finance | **MISSING UI** (Major) | **VERIFIED** | `apps/web/src/pages/orders/OrderDetailPage.tsx`<br>`apps/api/src/modules/orders/orders.service.ts` | Bảng `payment_installments` và `order_item_payment_plans` có sẵn trong DB nhưng màn hình chi tiết đơn hàng dự án chưa có block form lập và xem các đợt thanh toán theo mốc hợp đồng. | Bổ sung Card block "Kế hoạch đợt thanh toán" tại `OrderDetailPage.tsx` cho phép nhập % đặt cọc, ngày đến hạn và số tiền dự kiến. | `pnpm --filter api test:order`<br>`pnpm --filter api test:payment` |
| **SEC-001** | **P1** | Employees & Accounts | **SECURITY** (Major) | **VERIFIED** | `apps/api/src/modules/employees/employees.service.ts`:760<br>`apps/api/src/modules/employee-accounts/employee-accounts.service.ts`:180 | `OrganizationChartService.transferEmployee` có gọi thu hồi session Redis, nhưng `EmployeesService.promoteEmployee` và `updateEmployeeAccount` hoàn toàn bỏ sót lệnh này sau khi commit DB. | Inject `SessionService` vào `EmployeesService` và `EmployeeAccountsService`, gọi `await this.sessionService.revokeAllUserSessions(userId)` sau khi cập nhật role hoặc khóa tài khoản `isActive=false`. | `pnpm --filter api test:auth`<br>`pnpm --filter api test:account`<br>`pnpm --filter api test:boss-accounts` |
| **UI-001** | **P2** | Export (Leads, Orders, Payments, Projects, KPI, Expenses) | **MISSING UI INTEGRATION** | **VERIFIED** | `apps/web/src/components/export/ExportButton.tsx`<br>`apps/web/src/pages/leads/LeadsListPage.tsx`<br>`apps/web/src/pages/orders/OrdersListPage.tsx`<br>`apps/web/src/pages/payments/PaymentsListPage.tsx`<br>`apps/web/src/pages/projects/ProjectsListPage.tsx`<br>`apps/web/src/pages/kpi/KpiDashboardPage.tsx`<br>`apps/web/src/pages/expenses/ExpensesListPage.tsx` | Backend `ExportController` có đủ 7 endpoint streaming Excel, frontend có component `ExportButton.tsx` hoàn chỉnh với permission check, nhưng chưa được gắn vào header của 6 trang danh sách. | Import `ExportButton` vào phần `extra` của tiêu đề tại 6 trang danh sách, truyền đúng endpoint và quyền tương ứng (`LEAD_READ`, `ORDER_READ`, v.v.). | `pnpm --filter api test:export`<br>`pnpm build` |
| **CFG-001** | **P3** | Commissions & Teams | **BUSINESS POLICY / SEED DATA** | **VERIFIED** | Database table `commission_policies`<br>`apps/api/src/modules/commissions/services/commission-eligibility.service.ts`<br>`apps/api/src/modules/organization-chart/organization-chart.service.ts`:810 | 1. Trong bảng `commission_policies`, chỉ có cấu hình cho position 7 (DEV), hoàn toàn không có cấu hình cho position 8 (SEO). Backend xử lý an toàn trả về 0 commission.<br>2. API `changeLeader` chủ động ném lỗi `TEAM_LEADER_ROLE_POLICY_NOT_DEFINED` chờ ban hành quy định. | 1. Ban Giám Đốc phê duyệt bảng tỷ lệ hoa hồng kỹ thuật cho SEO (ví dụ 3% / 2%) và thêm seed bản ghi tương ứng vào `commission_policies`.<br>2. Ban hành quy trình bổ nhiệm Leader đi kèm quyết định nhân sự chính thức. | `pnpm --filter api test:commission`<br>`pnpm --filter api test:org-chart` |
| **UI-002** | **OPTIONAL** | System Admin & Observability | **ENHANCEMENT** (Optional) | **VERIFIED** | `apps/api/src/modules/queue/queue.controller.ts`<br>`apps/web/src/pages/Dashboard.tsx` | Endpoint `/api/system/queues` cung cấp metrics BullMQ cho ADMIN/BOSS nhưng chưa có màn hình dashboard kỹ thuật hiển thị biểu đồ này. Không ảnh hưởng nghiệp vụ cốt lõi. | (Tùy chọn) Xây dựng tab hoặc widget "Giám sát hàng đợi" trên Executive Dashboard hiển thị số lượng job active/completed/failed. | `pnpm --filter api test:jobs` |

---

## II. XÁC MINH CHI TIẾT & BẰNG CHỨNG TÁI HIỆN THỰC TẾ

### 1. `GAP-001` `[CRITICAL - MISSING UI]` — Thiếu nút tạo Project từ Order Item đã duyệt
- **Trạng thái kiểm chứng:** **VERIFIED (CONFIRMED)**
- **Môi trường tái hiện:** Local UAT (`http://localhost:5200` & API `:3200`)
- **Tài khoản kiểm tra:** `staging_boss` (BOSS) hoặc `staging_dev_leader` (DEV_TEAM_LEADER)
- **Các bước tái hiện thực tế:**
  1. Đăng nhập bằng `staging_boss`, mở đơn hàng `http://localhost:5200/orders/1` (đơn hàng đã có trạng thái `APPROVED`).
  2. Cuộn xuống bảng *Danh sách dịch vụ trong đơn hàng (Order Items)*.
  3. Cột *Thao tác* chỉ hiển thị nút "Yêu cầu thay đổi (CR)". Không tồn tại bất kỳ nút bấm nào có tên "Khởi tạo Project", "Tạo dự án" hoặc "Phân công".
  4. Mở thanh địa chỉ, truy cập `http://localhost:5200/projects?tab=assign` (đây là URL được gắn trong Sidebar "Phân công Project" của Dev Leader).
  5. Màn hình chỉ tải danh sách dự án thông thường, hoàn toàn bỏ qua query `tab=assign`, không hiển thị danh sách các `order_items` đang chờ tạo dự án.
- **Bằng chứng mã nguồn:**
  - `apps/web/src/pages/orders/OrderDetailPage.tsx`: Cột thao tác của bảng Order Items (dòng 670–690) chỉ bọc logic sửa/xóa khi DRAFT và mở modal CR.
  - `apps/web/src/pages/projects/ProjectsListPage.tsx`: Dòng 194 chỉ đọc `query.get('status')`, không hề có state hay tabs component xử lý `tab=assign`.
  - Backend đã sẵn sàng endpoint: `POST /api/order-items/:id/assign-project` (`projects.controller.ts:45`).
- **Hệ quả:** Luồng E2E thuần UI bị đứt gãy tại bước chuyển giao từ Đơn hàng sang Kỹ thuật triển khai.

---

### 2. `GAP-002` `[MAJOR - MISSING UI]` — Chưa có giao diện lập kế hoạch đợt thanh toán (Installments)
- **Trạng thái kiểm chứng:** **VERIFIED (CONFIRMED)**
- **Môi trường tái hiện:** Local UAT (`http://localhost:5200/orders/:id`)
- **Tài khoản kiểm tra:** `staging_sale`, `staging_accountant`, `staging_boss`
- **Các bước tái hiện thực tế:**
  1. Đăng nhập bằng `staging_sale`, mở một đơn hàng hợp đồng dự án phần mềm.
  2. Quan sát toàn bộ giao diện: Chỉ có thẻ Tóm tắt đơn hàng (Tổng tiền, Giảm giá, Đã thanh toán, Còn lại) và bảng dịch vụ.
  3. Không có khu vực hoặc modal nào cho phép người dùng chia nhỏ tiến độ thanh toán (Ví dụ: Đợt 1 đặt cọc 40%, Đợt 2 bàn giao nghiệm thu 60%).
- **Bằng chứng mã nguồn & DB:**
  - Database có đầy đủ bảng `order_item_payment_plans` và `payment_installments`.
  - Backend API tính công nợ phải thu (`/api/finance/receivables`) phụ thuộc vào ngày đến hạn của các đợt này.
  - Hiện tại dữ liệu `payment_installments` chỉ được tự động sinh ra cho các gói dịch vụ định kỳ (`Subscriptions`), còn đơn hợp đồng thông thường hoàn toàn thiếu UI thiết lập.

---

### 3. `SEC-001` `[MAJOR - SECURITY]` — Chưa tự động thu hồi Session Redis khi đổi Role hoặc Khóa tài khoản
- **Trạng thái kiểm chứng:** **VERIFIED (CONFIRMED)**
- **Môi trường tái hiện:** Live Backend API (`http://localhost:3200`) & Redis (`crm_redis:6379`)
- **Tài khoản kiểm tra:** `staging_sale` (User bị đổi quyền) và `staging_boss` (User thực hiện)
- **Các bước tái hiện thực tế:**
  1. Trình duyệt A: Đăng nhập bằng `staging_sale`, nhận Bearer Token hợp lệ (hiệu lực 15 phút), gọi `GET /api/leads` thành công (`200 OK`).
  2. Trình duyệt B: Đăng nhập bằng `staging_boss`, mở `/employees/5` (nhân viên Sale Team 1), bấm "Tăng / Giáng chức", chuyển vị trí sang nhân viên thử việc hoặc thay đổi role.
  3. Kiểm tra mã nguồn Backend `apps/api/src/modules/employees/employees.service.ts`:
     - Method `promoteEmployee` (dòng 540–764) cập nhật bảng `employees`, cập nhật bảng `user_roles`, cập nhật `team_memberships`, ghi `employee_position_history`, ghi `audit_logs`... và `return` ngay sau khi transaction commit.
     - **Hoàn toàn không có dòng lệnh gọi `sessionService.revokeAllUserSessions(emp.user_id)`.**
  4. Trình duyệt A: Tiếp tục gửi request bằng token cũ trong vòng 15 phút -> Request vẫn thành công do session trong Redis chưa bị xóa.
- **Đối chứng với Sơ đồ tổ chức:**
  - Tại `apps/api/src/modules/organization-chart/organization-chart.service.ts` dòng 708–710:
    ```typescript
    if (result.userId && (result.isCrossDepartment || result.wasLeader)) {
      await this.sessionService.revokeAllUserSessions(result.userId);
    }
    ```
    Chỉ có Sơ đồ tổ chức được trang bị cơ chế này, còn phân hệ Quản lý nhân sự và Quản lý tài khoản bị bỏ sót.

---

### 4. `CFG-001` `[P3 - BUSINESS POLICY / SEED DATA]` — Đối chiếu hoa hồng SEO với Frozen Rules
- **Trạng thái kiểm chứng:** **VERIFIED (CONFIRMED SEED DATA / CONFIGURATION DEFECT)**
- **Đối chiếu với Frozen Rules:**
  - Quy tắc đóng băng quy định rõ: *DEV/SEO PRIMARY hưởng 3% (1 người) hoặc 2%/người (2 người), SUPPORT hưởng 0%.*
- **Bằng chứng thực tế trong Database (`crm_postgres` container):**
  - Truy vấn `SELECT id, code, name FROM positions;`:
    - `id = 7`: `code = 'DEV'` (Lập Trình Viên / Kỹ Thuật Dự Án)
    - `id = 8`: `code = 'SEO'` (Chuyên Viên SEO / Content)
  - Truy vấn `SELECT * FROM commission_policies WHERE policy_type = 'PROJECT_DELIVERY';`:
    - Chỉ có các dòng cấu hình với `position_id = 7` (DEV), rate `0.0300` (1 assignee) và `0.0200` (2 assignees).
    - **Hoàn toàn không có bất kỳ dòng nào cấu hình cho `position_id = 8` (SEO).**
- **Bằng chứng mã nguồn Backend (`commission-eligibility.service.ts`):**
  - Service tìm kiếm chính sách hoa hồng kỹ thuật bằng truy vấn:
    `WHERE position_id = emp.position_id AND policy_type = 'PROJECT_DELIVERY'`
  - Khi nhân viên là SEO (`position_id = 8`), truy vấn trả về rỗng. Service ghi log cảnh báo và trả về mảng rỗng (0 hoa hồng) chứ không gây crash.
- **Kết luận:** Đây là **LỖI THIẾU DỮ LIỆU CẤU HÌNH (SEED/CONFIG DEFECT)**, logic code tính toán hoa hồng kỹ thuật hoàn toàn tuân thủ frozen rule. Không được tự ý thêm chính sách vào DB production/staging khi chưa có quyết định phê duyệt.

---

### 5. `UI-001` `[P2 - MISSING UI INTEGRATION]` — Rà soát ma trận quyền và nhu cầu xuất Excel
- **Trạng thái kiểm chứng:** **VERIFIED (CONFIRMED)**
- **Phân tích chi tiết 6 trang danh sách:**

| Trang danh sách | Quyền Backend bắt buộc | Các Role có quyền trong RBAC | Mức độ cần thiết nghiệp vụ | Tình trạng hiện tại |
|---|---|---|---|---|
| `/leads` (Leads) | `LEAD_READ` | `BOSS`, `ADMIN`, `SALES_TEAM_LEADER`, `SALE` | **RẤT CAO** (Xuất danh sách khách hàng để phân tích chiến dịch) | Thiếu nút trên header |
| `/orders` (Đơn hàng) | `ORDER_READ` | `BOSS`, `ADMIN`, `ACCOUNTANT`, `SALES_TEAM_LEADER`, `SALE` | **RẤT CAO** (Kế toán & Sale đối soát doanh số hợp đồng) | Thiếu nút trên header |
| `/payments` (Phiếu thu) | `PAYMENT_READ` | `BOSS`, `ADMIN`, `ACCOUNTANT` | **RẤT CAO** (Đối soát dòng tiền thực thu ngân hàng) | Thiếu nút trên header |
| `/projects` (Dự án) | `PROJECT_READ` | `BOSS`, `ADMIN`, `DEV_TEAM_LEADER`, `DEV`, `SEO_TEAM_LEADER`, `SEO` | **TRUNG BÌNH** (Báo cáo danh mục dự án theo kỳ) | Thiếu nút trên header |
| `/kpi` (KPI hiệu suất) | `KPI_READ` | Toàn bộ 9 Canonical Roles | **TRUNG BÌNH** (Xuất số liệu đánh giá xếp loại nhân sự) | Thiếu nút trên header |
| `/expenses` (Chi phí) | `EXPENSE_READ` | `BOSS`, `ADMIN`, `ACCOUNTANT` | **RẤT CAO** (Kế toán lập bảng kê chi phí phục vụ báo cáo tài chính) | Thiếu nút trên header |

- **Kết luận:** Cần gắn component `<ExportButton />` lên cả 6 trang, component đã tự tích hợp `<PermissionGate>` nên chỉ những role có quyền trên mới nhìn thấy nút bấm.

---

### 6. `UI-002` `[OPTIONAL - ENHANCEMENT]` — Giám sát hàng đợi hệ thống BullMQ
- **Trạng thái kiểm chứng:** **VERIFIED (CONFIRMED OPTIONAL)**
- **Đánh giá:** Endpoint `/api/system/queues` hoạt động tốt, trả về metrics chi tiết của Redis BullMQ. Đây là tính năng giám sát kỹ thuật nội bộ dành cho DevOps/Tech Lead, không thuộc luồng nghiệp vụ kinh doanh của người dùng cuối CRM.
- **Xếp loại:** **OPTIONAL ENHANCEMENT**, không tính là lỗi của đợt bàn giao UAT.
