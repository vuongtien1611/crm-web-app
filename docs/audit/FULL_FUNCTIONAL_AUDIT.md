# BÁO CÁO RÀ SOÁT CHỨC NĂNG TOÀN DIỆN (FULL FUNCTIONAL AUDIT REPORT) — CRM VMAX

**Môi trường:** Local UAT (`http://localhost:5200` / API `http://localhost:3200`)  
**Nhánh kiểm tra:** `feature/audit-16-30` (commit `1fd3a5f`, sạch và đồng bộ với `origin/feature/audit-16-30`)  
**Chế độ thực hiện:** **READ ONLY** — Tuyệt đối không chỉnh sửa code, cấu hình, test, seed, schema hay migration.  
**Cơ sở dữ liệu:** PostgreSQL 16 (`crm_db` - 328 nhân sự) & Redis 7 (`crm_redis`).  
**Ngày cập nhật:** 2026-11-13  

---

## I. TỔNG QUAN PHẠM VI & PHƯƠNG PHÁP KIỂM ĐỊNH

Cuộc rà soát chức năng toàn diện được thực hiện trên toàn bộ repository với các phương pháp kiểm chứng độc lập:
1. **Kiểm kê mã nguồn tĩnh (Static AST Scan):** Quét toàn bộ **84 file TSX** thuộc giao diện người dùng (`pages`, `components`, `layout`), định danh chính xác **361 thẻ `<Button>`**, **57 `<Modal>`**, **177 `<Form>`**, và **10 `<Tabs>`**. Mỗi nút và hành động đều được đánh mã định danh duy nhất từ `ACT-001` đến `ACT-361` trong [BUTTON_ACTION_INVENTORY.md](file:///home/vuongductien/Tài%20liệu/du-an-cuoi-khoa-f8/docs/audit/BUTTON_ACTION_INVENTORY.md).
2. **Xác minh giao diện trực tiếp (UI Runtime Verification):** Đối chiếu với dữ liệu phiên kiểm thử tự động Browser UAT và **39 ảnh chụp màn hình (screenshots)** tại 4 độ phân giải tiêu chuẩn (`390×844`, `768×1024`, `1366×768`, `1920×1080`), xác nhận DOM rendering, network responses, và console không lỗi.
3. **Xác minh API thời gian thực (API Runtime Verification):** Sử dụng script kiểm thử tự động với Bearer Token của **12 tài khoản canonical staging roles**, gửi request tới toàn bộ các endpoint nghiệp vụ, ghi nhận chính xác ma trận mã trạng thái HTTP (`200 OK`, `403 Forbidden`, `404 Not Found`).
4. **Kiểm tra hành động thuần Client-side (Static UI Verification):** Đối với các nút thao tác thuần giao diện không phát sinh HTTP request (như đóng modal, hủy thao tác, reset form, chuyển view), kiểm tra logic sự kiện và state bindings trực tiếp trong mã nguồn TSX; **không dùng API PASS để thay thế bằng chứng tương tác**.
5. **Kiểm tra cách ly dữ liệu (Data Scope Isolation):** Đối soát kết quả truy vấn dữ liệu chéo giữa Team 1 và Team 2 trên các thực thể Leads, Deals, Orders, Projects, và Daily Reports, bảo đảm tính độc lập dữ liệu tuyệt đối giữa các nhóm kinh doanh và kỹ thuật.
6. **Đối chiếu các quy tắc đóng băng (Frozen Business Rules):** Rà soát nghiêm ngặt các công thức hoa hồng, phân quyền phê duyệt của BOSS, tính bất biến của bảng lương snapshot, quy tắc dòng tiền thực chi của chi phí và việc không tự tính số dư tiền mặt khi thiếu dữ liệu kiểm kê.

---

## II. BẢNG TỔNG HỢP KIỂM ĐỊNH 361 NÚT BẤM (TỔNG HỢP TỰ ĐỘNG TỪ INVENTORY)

> **Quy ước phân loại trạng thái hành động (Hoàn toàn loại trừ nhau — Tổng 361 actions):**
> - **`UI RUNTIME PASS` (134 actions):** Đã tương tác click/submit trực tiếp trên giao diện trình duyệt thật trong phiên Browser UAT, có bằng chứng URL, DOM state, console và network clean.
> - **`API RUNTIME PASS` (154 actions):** Nút gọi API backend, đã xác minh qua HTTP request thực tế với 12 tài khoản canonical tokens, phản hồi đúng mã 200/403/404 và logic RBAC backend.
> - **`STATIC VERIFIED` (72 actions):** Hành động thuần client-side UI (đóng modal, hủy form, chuyển route không gọi API, đổi view) được rà soát trực tiếp qua logic JSX, props và event handlers.
> - **`BLOCKED` (1 action - `ACT-338`):** Nút ExportButton đã code nhưng chưa được import gắn vào 6 trang danh sách (`UI-001`).
> - **`FAIL` (0 actions):** Không phát hiện nút chết hoặc lỗi crash 500 runtime.

| STT | Phân hệ (Module) | Tổng Buttons | UI RUNTIME PASS | API RUNTIME PASS | STATIC VERIFIED | BLOCKED | Mức ưu tiên cao nhất |
|---|---|---:|---:|---:|---:|---:|---|
| 1 | **Dashboard** | 37 | 37 | 0 | 0 | 0 | PASS |
| 2 | **Auth & Login** | 7 | 2 | 3 | 2 | 0 | MAJOR (`SEC-001`) |
| 3 | **Acquisition (Nguồn tiếp thị & Kênh)** | 13 | 0 | 8 | 5 | 0 | PASS |
| 4 | **Commissions (Hoa hồng)** | 8 | 0 | 6 | 2 | 0 | INFO (`CFG-001`) |
| 5 | **Daily Reports (Báo cáo ngày)** | 28 | 0 | 25 | 3 | 0 | PASS |
| 6 | **Deals (Cơ hội kinh doanh)** | 15 | 0 | 8 | 7 | 0 | PASS |
| 7 | **Employee Accounts & BOSS PIN** | 16 | 0 | 10 | 6 | 0 | MAJOR (`SEC-001`) |
| 8 | **Employees (Danh sách & Chi tiết)** | 22 | 0 | 16 | 6 | 0 | PASS |
| 9 | **Expenses (Chi phí & Phê duyệt)** | 14 | 6 | 4 | 4 | 0 | PASS |
| 10 | **Finance (Tổng quan, Công nợ, Dòng tiền)** | 15 | 0 | 10 | 5 | 0 | PASS |
| 11 | **KPI (Chỉ số hiệu suất)** | 5 | 0 | 3 | 2 | 0 | PASS |
| 12 | **Leads (Khách hàng tiềm năng)** | 22 | 0 | 16 | 6 | 0 | PASS |
| 13 | **Notifications (Thông báo realtime)** | 12 | 6 | 6 | 0 | 0 | PASS |
| 14 | **Orders (Đơn hàng & Phê duyệt)** | 33 | 31 | 2 | 0 | 0 | **CRITICAL (`GAP-001`)** |
| 15 | **Organization Chart (Sơ đồ nhân sự)** | 10 | 10 | 0 | 0 | 0 | PASS |
| 16 | **Payments (Thanh toán & Phân bổ)** | 14 | 12 | 2 | 0 | 0 | PASS |
| 17 | **Payroll (Bảng lương & Khóa kỳ)** | 15 | 11 | 2 | 2 | 0 | PASS (Fixed AUD-028) |
| 18 | **Projects (Dự án & Phân công)** | 20 | 0 | 14 | 6 | 0 | **CRITICAL (`GAP-001`)** |
| 19 | **Subscriptions (Dịch vụ định kỳ)** | 11 | 0 | 5 | 6 | 0 | PASS |
| 20 | **Teams (Nhóm chuyên môn)** | 19 | 0 | 10 | 9 | 0 | INFO (`CFG-001`) |
| 21 | **Leader Workspaces (Sales, Dev, SEO)** | 16 | 16 | 0 | 0 | 0 | PASS |
| 22 | **Layout & Common (Header, Nav, Detail)**| 4 | 3 | 1 | 0 | 0 | PASS |
| 23 | **Export & Storage (Tệp & Xuất file)** | 5 | 0 | 3 | 1 | 1 | MEDIUM (`UI-001`) |
| **TỔNG** | **TOÀN BỘ CODEBASE** | **361** | **134** | **154** | **72** | **1** | **CRITICAL (`GAP-001`)** |

---

## III. ĐỐI CHIẾU 5 NGUYÊN TẮC NGHIỆP VỤ ĐÓNG BĂNG (FROZEN BUSINESS RULES)

### 1. Chính sách Hoa hồng SEO: PRIMARY / SUPPORT
- **Hiện trạng trong DB (`crm_db.commission_policies`):**
  - Vị trí `SALE`: 6% trên giá trị thực thu của hợp đồng.
  - Vị trí `SALES_TEAM_LEADER`: 4% khi tự chốt bán hàng + 2% override trên doanh số toàn nhóm.
  - Vị trí `DEV` (`PROJECT_DELIVERY`): 1 nhân sự PRIMARY nhận 3%; nếu có 2 nhân sự PRIMARY thì mỗi người nhận 2%; nhân sự SUPPORT nhận 0%.
  - **Vị trí `SEO`:** Bảng `positions` có `id = 8` (`code = 'SEO'`), nhưng trong `commission_policies` **HOÀN TOÀN KHÔNG CÓ** bản ghi nào với `position_id = 8` (`CFG-001`).
- **Bản chất kỹ thuật:** Đây là **LỖI THIẾU DỮ LIỆU CẤU HÌNH (SEED/CONFIG DEFECT)**, không phải lỗi logic mã nguồn. `CommissionEligibilityService` xử lý an toàn bằng cách trả về 0 bản ghi hoa hồng chứ không gây crash. Ràng buộc `MAX 2 PRIMARY` được thực thi nghiêm ngặt trên cả DEV và SEO.

### 2. Phân quyền và Bảo mật 9 Canonical Roles
- Phân định ranh giới rõ ràng:
  - `STRICT_BOSS`: Tuyệt đối chỉ tài khoản `BOSS` mới có quyền truy cập Sơ đồ tổ chức (`/organization-chart`) và Quản lý tài khoản nhân sự (`/employee-accounts`). Tài khoản `ADMIN` khi truy cập API nhận 403 Forbidden.
  - Kế toán (`ACCOUNTANT`): Được quyền tạo và xác nhận phiếu thu, tính bảng lương, quản lý chi phí và xem sổ cái; bị chặn 403 khi truy cập duyệt đơn hàng, sơ đồ tổ chức, quản lý nhóm hay hoa hồng.
  - Khối Kỹ thuật (`DEV`, `SEO`) và Kinh doanh (`SALE`): Hoàn toàn không xem được các số liệu tài chính công ty, công nợ, dòng tiền hay bảng lương của nhân sự khác.
  - Không có hiện tượng nhân viên tự phê duyệt đơn hàng của chính mình (Sale chỉ có nút "Gửi duyệt đơn hàng", nút "Phê duyệt" chỉ hiện diện khi `user.roles.includes('BOSS')`).

### 3. Chi phí: Trạng thái APPROVED không đồng nghĩa là Đã thực chi (Not Paid)
- Quy trình chi phí trong phân hệ Expenses phân biệt rõ ràng:
  - Khi BOSS bấm duyệt phiếu chi (`ExpensesService.approveExpense`), trạng thái chuyển sang `APPROVED` (chấp thuận chủ trương chi phí).
  - Khoản chi chỉ được ghi nhận vào dòng tiền chi thực tế (`Outflow`) trên Sổ cái dòng tiền (`CashflowPage.tsx`) khi có thông tin thanh toán thực chi kèm phương thức và chứng từ thanh toán.
  - Nghiệp vụ không đánh đồng giữa công nợ phải trả với số tiền thực tế đã xuất quỹ.

### 4. Bảng lương Snapshot và Dữ liệu lịch sử bất biến
- Kỳ lương sau khi được BOSS chuyển sang trạng thái `LOCKED` (`PayrollService.lockPeriod`):
  - Toàn bộ các dòng lương của nhân viên (`payroll_items`), các khoản thưởng/phạt thủ công (`payroll_adjustments`) và dữ liệu hoa hồng được đóng băng thành bản ghi snapshot vĩnh viễn.
  - Mọi thay đổi về sau liên quan đến mức lương cơ bản trong hồ sơ nhân viên hoặc thay đổi chính sách hoa hồng đều không làm thay đổi số liệu của các kỳ lương đã khóa.
  - Giao diện `PayrollDetailPage.tsx` ẩn toàn bộ các nút sửa, tính toán lại hoặc thêm điều chỉnh khi kỳ lương ở trạng thái `LOCKED` hoặc `PAID`.

### 5. Chỉ số Tài chính & Dòng tiền: Không tự ý nội suy khi thiếu dữ liệu
- Tại `FinancialOverviewPage.tsx` và `CashflowPage.tsx`:
  - Trong `crm_db` hiện tại **CHƯA CÓ dữ liệu kiểm kê tiền mặt ban đầu** và **CHƯA CÓ dữ liệu phiếu chi đã thực chi (paid expenses) đầy đủ**.
  - Hệ thống tuân thủ nghiêm ngặt nguyên tắc **không tự động nội suy Số dư tiền mặt đầu kỳ/cuối kỳ (Cash Balance)** hoặc Dòng tiền thuần tích lũy (Net Cash Flow) khi chưa có số liệu kiểm kê ban đầu.
  - Báo cáo tài chính **không khẳng định có "Total Outflow thực chi"** khi chưa có đầy đủ chứng từ xuất quỹ thực tế.

---

## IV. BẢNG PHÂN CÔNG CÔNG VIỆC BÀN GIAO THEO MODULE (HANDOVER & WORK BREAKDOWN)

| Issue ID | Mức ưu tiên | Phân hệ | Phân loại | Trạng thái kiểm chứng | Quyền thực hiện (Role) | File & dòng code liên quan | Nguyên nhân gốc (Root Cause) | Đề xuất sửa tối thiểu (Minimal Fix) | Regression Test bắt buộc |
|---|---|---|---|---|---|---|---|---|---|
| **GAP-001** | **P0** | Orders & Projects | **MISSING UI** (Blocker) | **VERIFIED** | `BOSS`, `DEV_LEADER`, `SEO_LEADER` | `apps/web/src/pages/orders/OrderDetailPage.tsx`:620–695<br>`apps/web/src/pages/projects/ProjectsListPage.tsx`:190–260 | Backend có sẵn `POST /api/order-items/:id/assign-project` nhưng giao diện `OrderDetailPage` thiếu nút bấm kích hoạt khi đơn `APPROVED` và `ProjectsListPage` chưa render view xử lý tab `?tab=assign`. | 1. Tại `OrderDetailPage.tsx`, thêm nút `<Button type="primary">Khởi tạo Project</Button>` mở Modal chọn nhân viên và gọi `assignProjectApi`.<br>2. Tại `ProjectsListPage.tsx`, render tab gom các order items chờ tạo project. | `pnpm --filter api test:project`<br>`pnpm --filter api test:order`<br>`pnpm --filter api test:phase-q-e2e` |
| **GAP-002** | **P1** | Orders & Finance | **MISSING UI** (Major) | **VERIFIED** | `SALE`, `ACCOUNTANT`, `BOSS` | `apps/web/src/pages/orders/OrderDetailPage.tsx`<br>`apps/api/src/modules/orders/orders.service.ts` | Bảng `payment_installments` và `order_item_payment_plans` có sẵn trong DB nhưng màn hình chi tiết đơn hàng dự án chưa có block form lập và xem các đợt thanh toán theo mốc hợp đồng. | Bổ sung Card block "Kế hoạch đợt thanh toán" tại `OrderDetailPage.tsx` cho phép nhập % đặt cọc, ngày đến hạn và số tiền dự kiến. | `pnpm --filter api test:order`<br>`pnpm --filter api test:payment` |
| **SEC-001** | **P1** | Employees & Accounts | **SECURITY** (Major) | **STATIC CONFIRMED** | `BOSS` | `apps/api/src/modules/employees/employees.service.ts`:760<br>`apps/api/src/modules/employee-accounts/employee-accounts.service.ts`:180 | `OrganizationChartService.transferEmployee:708` có gọi thu hồi session Redis, nhưng `EmployeesService.promoteEmployee` và `updateEmployeeAccount` hoàn toàn bỏ sót lệnh này sau khi commit DB. Chưa chạy kịch bản thử token cũ runtime nên ghi nhận `STATIC CONFIRMED`. | Inject `SessionService` vào `EmployeesService` và `EmployeeAccountsService`, gọi `await this.sessionService.revokeAllUserSessions(userId)` sau khi cập nhật role hoặc khóa tài khoản `isActive=false`. | `pnpm --filter api test:auth`<br>`pnpm --filter api test:account`<br>`pnpm --filter api test:boss-accounts` |
| **UI-001** | **P2** | Export (Leads, Orders, Payments, Projects, KPI, Expenses) | **MISSING UI INTEGRATION** | **VERIFIED** | Theo quyền từng trang (`LEAD_READ`, `ORDER_READ`, v.v.) | `apps/web/src/components/export/ExportButton.tsx` (`ACT-338`)<br>6 trang danh sách | Backend `ExportController` có đủ 7 endpoint streaming Excel, frontend có component `ExportButton.tsx` (`ACT-338`) hoàn chỉnh với permission check, nhưng chưa được gắn vào header của 6 trang danh sách. | Import `ExportButton` vào phần `extra` của tiêu đề tại 6 trang danh sách, truyền đúng endpoint và quyền tương ứng. | `pnpm --filter api test:export`<br>`pnpm build` |
| **CFG-001** | **P3** | Commissions & Teams | **BUSINESS POLICY / SEED DATA** | **VERIFIED** | Ban Giám Đốc (`BOD`) | Database table `commission_policies`<br>`commission-eligibility.service.ts`<br>`organization-chart.service.ts`:810 | 1. Trong bảng `commission_policies`, chỉ có cấu hình cho position 7 (DEV), hoàn toàn không có cấu hình cho position 8 (SEO). Backend xử lý an toàn trả về 0 commission.<br>2. API `changeLeader` chủ động ném lỗi `TEAM_LEADER_ROLE_POLICY_NOT_DEFINED` chờ ban hành quy định. | 1. Ban Giám Đốc phê duyệt bảng tỷ lệ hoa hồng kỹ thuật cho SEO (ví dụ 3% / 2%) và thêm seed bản ghi tương ứng vào `commission_policies`.<br>2. Ban hành quy trình bổ nhiệm Leader đi kèm quyết định nhân sự chính thức. | `pnpm --filter api test:commission`<br>`pnpm --filter api test:org-chart` |
| **UI-002** | **OPTIONAL** | System Admin & Observability | **ENHANCEMENT** (Optional) | **VERIFIED** | `ADMIN`, `BOSS` | `apps/api/src/modules/queue/queue.controller.ts`<br>`apps/web/src/pages/Dashboard.tsx` | Endpoint `/api/system/queues` cung cấp metrics BullMQ cho ADMIN/BOSS nhưng chưa có màn hình dashboard kỹ thuật hiển thị biểu đồ này. Không ảnh hưởng nghiệp vụ cốt lõi CRM. | (Tùy chọn) Xây dựng tab hoặc widget "Giám sát hàng đợi" trên Executive Dashboard hiển thị số lượng job active/completed/failed. | `pnpm --filter api test:jobs` |

---

## V. KẾT LUẬN & ĐÁNH GIÁ NGHIỆM THU

1. **Tổng số nút/action thực tế trong dự án:** **361 nút/action** được định danh độc lập từ `ACT-001` đến `ACT-361`.
2. **Số lượng đã được click/kiểm tra trực tiếp trên giao diện (UI Runtime):** **134 nút** (chiếm 37.1% tổng số nút, có screenshot và bằng chứng thao tác DOM).
3. **Số lượng đã được xác minh qua API Runtime:** **154 nút/action** (chiếm 42.7% tổng số, kiểm thử tự động với 12 tài khoản canonical tokens).
4. **Số lượng hành động thuần giao diện xác minh qua mã nguồn (Static Verified):** **72 nút/action** (chiếm 19.9% tổng số, rà soát logic đóng modal, chuyển view, reset form).
5. **Số lượng bị chặn trên giao diện:** **1 nút** (`ACT-338` `ExportButton` chưa import) và **2 khoảng trống lớn** (`GAP-001` thiếu nút tạo Project, `GAP-002` thiếu UI đợt thanh toán).
6. **Đánh giá mức độ ổn định:** Hệ thống hoạt động rất vững chắc về mặt kiến trúc, cơ sở dữ liệu và bảo mật phân quyền API, **không có lỗi crash 500 hay nút chết**. Tuy nhiên, **chưa thể tuyên bố toàn bộ dự án hoàn thiện 100% trên giao diện** do luồng khởi tạo Project từ Order Item vẫn đang bị ngắt quãng ở bước thao tác người dùng (`GAP-001`).
7. **Mức độ sẵn sàng Human UAT:** Đạt điều kiện với lưu ý rõ ràng cho tester tại kịch bản `UAT-E2E-07` theo đúng tài liệu [HUMAN_UAT_EXECUTION_PLAN.md](file:///home/vuongductien/Tài%20liệu/du-an-cuoi-khoa-f8/docs/HUMAN_UAT_EXECUTION_PLAN.md).
