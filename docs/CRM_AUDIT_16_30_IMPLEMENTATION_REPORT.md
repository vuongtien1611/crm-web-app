# BÁO CÁO NGHIỆM THU CUỐI CÙNG (FINAL ACCEPTANCE REPORT) — AUD-016 ĐẾN AUD-030

**Dự án:** CRM VMAX — Hệ Thống Quản Trị Khách Hàng & Vận Hành Doanh Nghiệp  
**Nhánh làm việc:** `feature/audit-16-30` *(đã dọn Git hygiene và chuẩn bị/tạo commit sạch trên `feature/audit-16-30`; chưa merge vào `main`)*  
**Ngày chốt báo cáo:** 12/11/2026  
**Phạm vi:** STT 16–30 trong `docs/CRM_AUDIT_YEU_CAU_TU_EXCEL.md` *(không triển khai STT 01–15, không thay đổi Frozen Business Rules, không thay đổi RBAC grants)*

---

## 1. XÁC MINH GIT BASELINE & TÁC ĐỘNG DATABASE STAGING

### 1.1. Chênh lệch Git Baseline (`uat-v1.0.0` / `758cced3` / `06eb712` / `698f2e2`)
- **Tag `uat-v1.0.0`** (annotated tag object `31e2afcd14ecd10de00a7daf6a348980c9e2ac1f`, ngày 15/09/2026) trỏ chính xác tới commit **`758cced3a7441bdcbb1e35f675e67aebad8fdd6e`** (`feat(uat): freeze human UAT baseline v1.0.0 with hardened checklists, guides, and reset/backup scripts`).
- **`main` (`origin/main`)** hiện ở commit **`06eb7129411d45a7dc0cff0ee07bda161fad8397`** (`feat(employees,leads): add promotion/demotion workflow, appointment history, and search-based lead assignment`, ngày 02/10/2026), đi trước `uat-v1.0.0` đúng 1 commit.
- **`feature/audit-16-30`** được tách từ `06eb712` và hiện chứa các thay đổi AUD-016..030 ở trạng thái working tree (`main` và tag `uat-v1.0.0` không bị sửa đổi).
- **Giải thích mã `698f2e2`:** Kiểm tra lịch sử Git (`git cat-file -t 698f2e2`) cho kết quả `fatal: Not a valid object name 698f2e2`. Mã `698f2e2` trong phiên bản báo cáo nháp trước đây là lỗi ghi nhầm/typo, không tồn tại trong object database của repository; baseline thực tế là tag `uat-v1.0.0` (`758cced3`) và `main` (`06eb712`).

### 1.2. Cách ly Test DB & Tác động trên DB Staging (`crm_db`)
- **Đã gỡ bỏ hardcode `TEST_DATABASE_NAME=crm_db`:** Tạo runner `apps/api/scripts/run-isolated-test.js` làm cổng kiểm soát cho toàn bộ script `test:*` trong `apps/api/package.json` và bổ sung guard trong `expense-integration.spec.ts` + `apps/api/scripts/seed-master.js`.
  - Bất kỳ lời gọi `test:*` hoặc `db:seed:master` nào truyền `crm_db`, `*prod*`, `*staging*`, hoặc trộn `DATABASE_NAME !== TEST_DATABASE_NAME` đều bị chặn ngay (`[TEST DB GUARD ABORT]` / `[SEED GUARD ABORT]`, exit code `1`) trước khi kết nối database.
  - Kiểm chứng thực tế: `TEST_DATABASE_NAME=crm_db pnpm --filter api test:payroll` bị chặn (`exit 1`); `DATABASE_NAME=crm_db pnpm --filter api db:seed:master` bị chặn (`exit 1`).
- **Hiện trạng DB Staging (`crm_db`):** Không reset, reseed hoặc chạy integration test trên `crm_db`. Đối chiếu sau mọi chỉnh sửa và kiểm thử xác nhận `crm_db` giữ nguyên baseline (`328` employees, `96` leads, `87` orders, `3` payroll periods IDs `24,25,26`, `12` tài khoản `staging_*`).
- **Chạy kiểm thử cô lập trên `crm_test_db` & Clean DB Simulation (`crm_ci_sim_test`):** Toàn bộ integration tests chạy cô lập trên `crm_test_db`. Ngoài ra đã mô phỏng luồng CI trên DB rỗng mới tạo (`crm_ci_sim_test`): `pnpm db:migrate` (base schema + 11 migrations) -> `pnpm --filter api db:seed:master` (`database/crm_seed.sql`) -> `pnpm --filter api test:payroll` (`11/11 PASS`) -> drop `crm_ci_sim_test`.

---

## 2. RÀ SOÁT DIFF PRODUCTION & FROZEN BUSINESS RULES

- **`apps/api/src/modules/rbac`:** `0` dòng thay đổi so với `main`. Không thay đổi grants/permissions nào.
- **`apps/api/src/modules/deals/deals.service.ts`:** Bổ sung import `ForbiddenException` và `CrmDynamicRow`, `assignDeal` chọn thêm `assigned_sale_id`, `markWon(id, actor?)` giữ nguyên invariant bắt buộc `if (!closingSaleId) throw new BadRequestException('closing_sale_id must be set before marking Deal as WON')`, cập nhật `closing_sale_id` khi `WON`, không thay đổi logic tính hoa hồng hay tạo đơn.
- **`apps/api/src/database/kysely.service.ts` & 8 service transaction trọng yếu (`projects`, `commission-eligibility`, `orders`, `subscriptions`, `kpi-evaluation`, `employee-accounts`, `employees`, `payments`) + `payroll.service.ts`:** Thay toàn bộ `Kysely<any>` (`2 -> 0`) và `Transaction<any>` (`11 -> 0`) bằng `Kysely<CrmDatabase>` và `CrmTransaction`, bổ sung interface `PayrollActorUser` và kiểu hóa `PaymentAllocationRecord`/`updates`/`err: unknown` trong luồng `payroll`/`payments`/`orders`/`deals`. Không thay đổi công thức hoa hồng, KPI, Payroll, Payment hay câu truy vấn SQL.
- **Sửa lỗi UAT Payroll (`/payroll/12/employees/7`):** Bổ sung `PayrollApiError` (kèm HTTP `status`) trong `apps/web/src/api/payroll.ts`, component dùng chung `apps/web/src/pages/payroll/PayrollErrorState.tsx`, và xử lý trạng thái lỗi 404/403/network trong `EmployeePayrollDetailPage.tsx` và `PayrollDetailPage.tsx` thay cho vòng `if (loading || !data) return <Spin />` vô hạn.

---

## 3. BẢNG TỔNG HỢP TRẠNG THÁI 15 HẠNG MỤC (AUD-016 ĐẾN AUD-030)

| AUD ID | Tên hạng mục | Status | Files Changed chính | Bằng chứng kiểm thử (Test Evidence) | Rủi ro còn lại |
|---|---|:---:|---|---|---|
| **AUD-016** | Giảm sử dụng `any` trong Backend | **PARTIAL** | `kysely.service.ts` (`CrmDatabase`/`CrmTransaction`), `projects`, `orders`, `payments`, `payroll`, `deals`, `employees`, `employee-accounts`, `subscriptions`, `commission-eligibility`, `kpi-evaluation`, `teams`, `daily-reports`, `weekly-reports`, `organization-chart`, `notifications` | `pnpm --filter shared build && pnpm --filter api build` exit 0; kiểm đếm tự động `apps/api/src` (non-spec, 189 files): `Transaction<any>` **`11 -> 0`**, `Kysely<any>` **`2 -> 0`**, `as any` **`871 -> 856`**, `: any` **`289 -> 272`**, `any[]` **`18 -> 16`** | **Còn PARTIAL:** `CrmDynamicRow = Record<string, any>` là type bridge tạm thời thay cho `kysely-codegen`; còn `856 as any`, `272 : any`, `16 any[]` tập trung tại `daily-reports.service.ts`, `teams.service.ts`, `employees.service.ts`, `subscriptions.service.ts`, `projects.service.ts`, `leads.service.ts` |
| **AUD-017** | Chuẩn hóa API Command/Action | **VERIFIED** | `docs/API_WORKFLOW_COMMAND_GUIDE.md`, `leads/deals/orders/daily-reports/teams/org-chart` controllers | `order-integration.spec.ts` (`29/29 PASS`), `lead-integration.spec.ts` (`11/11`), `deal-integration.spec.ts` (`12/12`), `phase-i-daily-reports.spec.ts` (`54/54`), giữ nguyên 100% đường dẫn API | Cần cập nhật guide khi thêm state-machine endpoint mới |
| **AUD-018** | Chuẩn hóa API Response/Error | **VERIFIED** | `apps/api/src/common/filters/all-exceptions.filter.ts`, `apps/api/src/main.ts`, `apps/web/src/api/auth.ts` *(sửa `logoutApi` bỏ `Content-Type: application/json` khi body rỗng)* | `verify-audit-16-30-quality.ts` (`27/27 PASS` cho 400/401/403/404/409/500 & anti-leak); Browser UAT final run `0` HTTP >= 400 errors | Một số FastifyError ngoại lệ non-`HttpException` vẫn rơi vào fallback 500 nếu client gửi malformed JSON headers |
| **AUD-019** | Mở rộng CI Automated Testing | **PARTIAL / NOT VERIFIED (Remote Runner Pending)** | `.github/workflows/ci.yml`, `apps/api/package.json`, `apps/api/scripts/run-isolated-test.js`, `apps/api/scripts/seed-master.js`, `expense-integration.spec.ts` | Gỡ toàn bộ hardcode `crm_db`; CI dùng `crm_test_db` + trigger `feature/**` + `pnpm --filter shared build` + `pnpm db:migrate` + `pnpm --filter api db:seed:master`; guard chặn `crm_db` PASS (`exit 1`); giả lập local trên DB sạch `crm_ci_sim_test` (`migrate -> seed -> test:payroll 11/11`) PASS | Chưa xác nhận kết quả thực tế từ remote GitHub Actions runner sau khi push nhánh (cập nhật ngay ở mục 4.4) |
| **AUD-020** | Cập nhật README | **VERIFIED** | `README.md` | Đối chiếu trực tiếp kiến trúc Monorepo, 9 canonical roles, Docker/migrations/seed và test commands với `package.json`; không lộ secret | Cần cập nhật định kỳ khi thêm env/scripts mới |
| **AUD-021** | Đồng bộ Node.js / pnpm | **VERIFIED** | `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `Dockerfile`, `.github/workflows/cd.yml` | `node v20.20.2`, `pnpm 9.15.4`; `pnpm install --frozen-lockfile` exit 0 tại workspace (`545ms`) và trên thư mục sạch `/tmp/clean-pnpm-test` không có `node_modules` (`50.6s`, exit 0, áp dụng `rc-util@5.44.4.patch` thành công) | Yêu cầu môi trường build có `pnpm@9.15.4` và Node `>=20` |
| **AUD-022** | Database Connection Pool | **VERIFIED** | `apps/api/src/config/env.config.ts`, `apps/api/src/config/env.config.spec.ts`, `apps/api/src/database/kysely.service.ts` | `env.config.spec.ts` (`7/7 PASS`), kiểm tra ràng buộc `DB_POOL_MAX`/`MIN` và timeouts | Cần tinh chỉnh `DB_POOL_MAX` theo số replica khi deploy đa instance |
| **AUD-023** | Cursor Pagination | **DEFERRED** | *(Không sửa code phân trang theo chủ trương tránh refactor lớn trong UAT)* | Đã kiểm tra index kép `(created_at, id)` và độ trễ < 5ms; giữ tương thích phân trang số của Ant Design Table | Cần đánh giá lại keyset pagination khi bảng dữ liệu vượt > 500k dòng |
| **AUD-024** | JWT Role/Permission Revocation | **VERIFIED *(ALREADY_FIXED)*** | `apps/api/src/modules/auth/guards/jwt-auth.guard.ts`, `organization-chart.service.ts` | `auth-integration.spec.ts` (`13/13 PASS`), `organization-chart.spec.ts` (`43/43 PASS`), `verify-account-switch-runtime.ts` (xác nhận Redis `session:${sub}:${sessionId}` fail-closed và thu hồi toàn bộ token khi chuyển phòng ban/logout) | Phụ thuộc tính sẵn sàng của Redis (fail-closed đúng thiết kế) |
| **AUD-025** | Giảm trùng lặp Role Logic | **VERIFIED** | `apps/web/src/config/navigation.config.tsx`, `apps/web/src/layout/MainLayout.tsx`, `apps/web/src/components/RoleRoute.tsx`, `apps/web/src/App.tsx` | Browser UAT kiểm thử thực tế **9 canonical roles**: `135/135` role/sidebar/route/RBAC checks **PASSED**, `phase-s-uat.spec.ts` 100% PASS | Bảo trì tập trung tại `navigation.config.tsx` khi thêm route mới |
| **AUD-026** | Permission-Based UI | **VERIFIED** | `apps/web/src/components/PermissionGate.tsx`, `OrderDetailPage.tsx`, `PaymentsListPage.tsx`, `PayrollDetailPage.tsx` | Browser UAT xác nhận: `SALE` ẩn `Phê duyệt`/`Từ chối` ở OrderDetail; `ACCOUNTANT` thấy `Ghi nhận thanh toán mới`, ẩn `Xác nhận`/`Từ chối` Payment và ẩn `Duyệt`/`Khóa chốt` Payroll; `BOSS` thấy đầy đủ; backend vẫn chặn API độc lập | Các trang CRUD phụ khác nếu thêm action nhạy cảm cần bọc `<PermissionGate>` tương ứng |
| **AUD-027** | Responsive UI toàn dự án | **VERIFIED** | `apps/web/src/styles/vmax-design-system.css` *(thêm ràng buộc `min-width: 0; max-width: 100%` cho `.ant-layout`, `.ant-tabs`, `.ant-card`)*, `apps/web/src/pages/expenses/ExpensesListPage.tsx` *(sửa breakpoint filter 768px & `Space wrap`)*, `constants/labels.ts` | Browser UAT ma trận **4 viewports (`390×844`, `768×1024`, `1366×768`, `1920×1080`) × 12 trang = `48/48 PASSED`**; Mobile 390px Drawer & Modal **`2/2 PASSED`**; VND (`15.000.000 ₫`) + ngày VN (`dd/MM/yyyy`) + họ tên nhân viên hiển thị đúng; `34` ảnh chụp lưu chứng cứ | Bảng nhiều cột trên mobile vẫn dùng cuộn ngang trong `.ant-table-container` |
| **AUD-028** | API Client/Config dùng chung | **VERIFIED** | `apps/web/src/api/config.ts`, `auth.ts`, `NotificationBell.tsx`, `health.ts` + 13 API client modules (`dashboard`, `organizationChart`, `export`, `payments`, `storage`, `expenses`, `subscriptions`, `notifications`, `employees`, `employeeAccounts`, `teams`, `dailyReports`, `weeklyReports`) | `verify-api-config.ts` (`12/12 PASS`); `grep` xác nhận `0` chỗ dùng `${API_BASE_URL}`/`${API_URL}` thô ngoài `config.ts`; Browser UAT cross-port (`http://localhost:5200` -> `http://localhost:3200`) ghi nhận **`0` URL `/api/api`, `0` HTTP >= 400, `0` lỗi console** | Cần cấu hình `CORS_ORIGIN` cho domain frontend thật khi lên staging/prod |
| **AUD-029** | Chuẩn hóa Data Mapping | **VERIFIED** | `apps/api/src/common/mappers/data-mapping.util.ts`, `daily-reports.service.ts`, DTOs | `phase-i-daily-reports.spec.ts` (`54/54 PASS`); `verify-audit-16-30-quality.ts` (`PASS` camelCase ưu tiên trước snake_case); không đổi tên cột DB | Áp dụng chính cho Daily Reports; các module khác tiếp tục giữ convention hiện hành |
| **AUD-030** | Structured Logging | **VERIFIED** | `apps/api/src/common/middleware/correlation-id.middleware.ts`, `apps/api/src/app.module.ts`, `main.ts`, `worker.main.ts` | `verify-audit-16-30-quality.ts` xác nhận `x-correlation-id` propagation và không log `Authorization`/credentials; log Fastify JSON + NestJS Logger hoạt động ổn định khi chạy API `3200` | Cần cấu hình log retention/rotation trên hạ tầng deploy |

---

## 4. KẾT QUẢ KIỂM THỬ HỒI QUY CHI TIẾT (CHẠY TRÊN `crm_test_db` CÔ LẬP)

### 4.1. Backend Integration & Verification Suites
*Toàn bộ chạy bằng `NODE_ENV=test ALLOW_PRIVILEGED_TEST_TEARDOWN=true DATABASE_NAME=crm_test_db TEST_DATABASE_NAME=crm_test_db pnpm --filter api exec ts-node <spec>`:*

| STT | File kiểm thử | Số PASS / FAIL quan sát | Ghi chú thực tế |
|:---:|---|:---:|---|
| 1 | `src/modules/e2e/phase-q-e2e.spec.ts` | **108 / 0** (5 stages) | `crm_db` xác nhận không bị chạm sau khi chạy |
| 2 | `src/config/env.config.spec.ts` | **7 / 0** | Pool min/max/timeout validation |
| 3 | `src/modules/auth/auth-integration.spec.ts` | **13 / 0** | Login, refresh, Redis session revocation |
| 4 | `src/modules/leads/lead-integration.spec.ts` | **11 / 0** | |
| 5 | `src/modules/deals/deal-integration.spec.ts` | **12 / 0** | Bao gồm rule bắt buộc `closing_sale_id` |
| 6 | `src/modules/orders/order-integration.spec.ts` | **29 / 0** | |
| 7 | `src/modules/projects/project-integration.spec.ts` | **39 / 0** | |
| 8 | `src/modules/payments/payment-integration.spec.ts` | **29 / 0** | |
| 9 | `src/modules/commissions/commission-integration.spec.ts` | **21 / 0** | Frozen rule SALE 6% |
| 10 | `src/modules/kpi/kpi-integration.spec.ts` | **6 / 0** | |
| 11 | `src/modules/payroll/payroll-integration.spec.ts` | **11 / 0** | |
| 12 | `src/modules/expenses/expense-integration.spec.ts` | **8 / 0** | |
| 13 | `src/modules/subscriptions/recurring-integration.spec.ts` | **18 / 0** | |
| 14 | `src/modules/organization-chart/organization-chart.spec.ts` | **43 / 0** | Luân chuyển 6 chiều & thu hồi token |
| 15 | `src/modules/dashboard/phase-h-executive-dashboard.spec.ts` | **10 / 0** | |
| 16 | `src/modules/employees/account-integration.spec.ts` | **17 / 0** | *Đã sửa test fixture thiếu actor trên DB sạch* |
| 17 | `src/modules/employees/employee-accounts-boss.spec.ts` | **24 / 0** | *Đã sửa fixture gán `BOSS` role trong `user_roles`* |
| 18 | `src/modules/teams/team-integration.spec.ts` | **20 / 0** | *Đã sửa test fixture thiếu actor trên DB sạch* |
| 19 | `src/modules/teams/team-code-autogen.spec.ts` | **11 / 0** | *Đã sửa test fixture thiếu actor trên DB sạch* |
| 20 | `src/modules/teams/phase-e-sales-leader.spec.ts` | **10 / 0** | *Đã sửa test fixture thiếu actor trên DB sạch* |
| 21 | `src/modules/teams/phase-f-dev-leader.spec.ts` | **10 / 0** | *Đã sửa test fixture thiếu actor trên DB sạch* |
| 22 | `src/modules/teams/phase-g-seo-leader.spec.ts` | **10 / 0** | *Đã sửa test fixture thiếu actor trên DB sạch* |
| 23 | `src/modules/daily-reports/phase-i-daily-reports.spec.ts` | **54 / 0** | *Đã sửa timing `10ms` sau `tstzrange(NOW(), ...)`* |
| 24 | `src/modules/subscriptions/phase-j-subscription-frontend.spec.ts` | **40 / 0** | |
| 25 | `src/modules/acquisition/phase-k-acquisition-assignment.spec.ts` | **40 / 0** | |
| 26 | `src/modules/notifications/phase-l-notifications.spec.ts` | **28 / 0** | |
| 27 | `src/modules/storage/phase-m-storage.spec.ts` | **24 / 0** | |
| 28 | `src/modules/export/phase-o-export.spec.ts` | **38 / 0** | |
| 29 | `src/modules/dynamic-options/dynamic-options.spec.ts` | **23 / 0** | |
| 30 | `src/modules/queue/phase-n-jobs.spec.ts` | **Exit 0 (`BQ-01..BQ-14` PASS)** | Chạy khi đã tắt worker daemon để không cạnh tranh BullMQ queue |
| 31 | `src/modules/e2e/phase-s-uat.spec.ts` | **Exit 0 (100% PASS)** | Chạy sau khi `seed-staging.ts` vào `crm_test_db` |
| 32 | `src/scripts/verify-api-config.ts` | **12 / 0** | AUD-028 URL normalizer |
| 33 | `src/scripts/verify-audit-16-30-quality.ts` | **27 / 0** | AUD-018, 029, 030 |

**Tổng cộng:** **`753` assertions PASS / `0` FAIL** trên 31 suite đếm dòng `✅ PASS:` + **2 suite exit 0 100% PASS** (`phase-n-jobs.spec.ts` `BQ-01..BQ-14` và `phase-s-uat.spec.ts`) = **33/33 suites & scripts PASS**.

### 4.2. Monorepo Build & Clean Install (`AUD-021`)
- `pnpm install --frozen-lockfile` trên workspace: **exit 0** (`545ms`).
- `pnpm install --frozen-lockfile` trên bản copy sạch `/tmp/clean-pnpm-test` (không `node_modules`): **exit 0** (`50.6s`, apply `rc-util@5.44.4.patch` thành công).
- `pnpm --filter shared build && pnpm --filter api build` (sau chỉnh sửa AUD-016 cuối cùng): **exit 0**.
- `pnpm --filter web build` (`tsc && vite build`, sau chỉnh sửa Payroll Error UI): **exit 0** (`3364 modules transformed`, built in `5.42s`).
- **Targeted Re-run sau chỉnh sửa cuối (`run-isolated-test.js` -> `crm_test_db`):** `test:env` (`6/6`), `test:payroll` (`11/11`), `test:payment` (`29/29`), `test:deal` (`12/12`), `test:order` (`29/29`), `test:expense` (`8/8`), `test:recurring` (`18/18`), `test:commission` (`21/21`), `test:kpi` (`6/6`), `test:project` (`39/39`), `test:phase-q-e2e` (5 stages, exit 0), `verify-api-config.ts` (`12/12`), `verify-audit-16-30-quality.ts` (`27/27`).

### 4.3. Browser UAT Thực Tế trên Headless Chrome CDP & Kiểm chứng Payroll Bug
- **Môi trường kiểm thử:** Web `http://localhost:5200` (`VITE_API_URL=http://localhost:3200`) -> API `http://localhost:3200` trên `crm_db`; Chrome Headless cô lập profile `/tmp/...`.
- **Kết quả Browser UAT 9 Roles & Responsive (`run-browser-uat.mjs`):**
  - **9 Canonical Roles RBAC (Sidebar, Allowed Routes, Forbidden Route Redirects, UI Action Buttons):** **`135 / 135 PASSED`** (`BOSS`, `ADMIN`, `ACCOUNTANT`, `SALES_TEAM_LEADER`, `SALE`, `DEV_TEAM_LEADER`, `DEV`, `SEO_TEAM_LEADER`, `SEO`).
  - **UI Workflows & Mobile Components:** **`5 / 5 PASSED`** (`SALE Open Create Lead Modal`, `SALE Create Lead via UI Modal`, `ACCOUNTANT Open Create Payment Modal`, `Mobile 390px Drawer Navigation`, `Mobile 390px Modal Responsiveness`).
  - **Responsive Matrix (4 viewports `390×844`, `768×1024`, `1366×768`, `1920×1080` × 12 trang trọng yếu):** **`48 / 48 PASSED`** (`scrollWidth <= clientWidth + 2`, không cắt nút ngoài bảng, không có `Invalid Date` / `NaN ₫`).
  - **Lỗi Runtime & Network:** Console errors = **`0`**, Uncaught JS errors = **`0`**, URL chứa `/api/api` = **`0`**, HTTP >= 400 errors = **`0`**.
  - **Bằng chứng ảnh chụp (`34` screenshots ban đầu + `3` ảnh Payroll retest):** Lưu tại `/home/vuongductien/.gemini/antigravity/brain/86cbe47c-e88b-44b2-aa91-85622f87a895/uat-screenshots/`.
- **Kết quả Retest Lỗi BOSS mở `/payroll/12/employees/7` (`PASS`):**
  - **Nguyên nhân gốc (Root Cause):** URL (`fetchEmployeePayrollDetail` -> `/api/payroll/periods/:id/employees/:employeeId`), endpoint controller và quyền `BOSS` đều đúng; trên `crm_db` kỳ lương hiện có là IDs `24, 25, 26` (không có period `#12` / employee `#7`), nên API trả về HTTP `404`. Trước khi sửa, `EmployeePayrollDetailPage.tsx` kiểm tra `if (loading || !data) return <Spin />` nên khi `data` giữ `null` sau lỗi 404 giao diện quay loading vô tận (lỗi tương tự ở `PayrollDetailPage.tsx`).
  - **Kiểm chứng sau khi sửa (Headless Chrome CDP, `staging_boss` trên `http://localhost:5200` -> `http://localhost:3200` `crm_db`):**
    1. Mở `/payroll/12/employees/7`: API trả `404`; `spinners = 0`; hiển thị `Không tìm thấy phiếu lương nhân viên #7` (`Payroll statement not found for employee #7`) + nút `Quay lại kỳ lương`, `Thử lại` (`payroll_bug_12_7_404.png`).
    2. Bấm `Quay lại kỳ lương` -> `/payroll/12`: API trả `404`; `spinners = 0`; hiển thị `Không tìm thấy kỳ lương #12` + nút `Quay lại danh sách kỳ lương`, `Thử lại` (`payroll_bug_12_period_404.png`).
    3. Bấm `Quay lại danh sách kỳ lương` -> `/payroll`: render bảng `3` kỳ lương hiện có.
    4. Mở `/payroll/26/employees/447` (dữ liệu hợp lệ trên `crm_db`): API trả `200`; `spinners = 0`; hiển thị đầy đủ phiếu lương `EMP-S1-EX-386084` / `Sale One 386084` (`payroll_26_447_200.png`).

### 4.4. Trạng thái GitHub Actions Remote CI
- *(Chờ cập nhật sau khi commit & push `feature/audit-16-30` lên `origin`)*

---

## 5. CÁC VẤN ĐỀ CÒN PARTIAL / NOT VERIFIED / DEFERRED & VIỆC CÒN THIẾU

1. **AUD-016 (`PARTIAL`):** Đã loại bỏ `11/11 Transaction<any>` và `2/2 Kysely<any>` qua `CrmDatabase`/`CrmTransaction` cùng một số type actor/payload trọng yếu, nhưng `CrmDynamicRow = Record<string, any>` vẫn là type bridge động và còn `856 as any`, `272 : any`, `16 any[]` trong `apps/api/src` (non-spec).
2. **AUD-019 (Remote CI Runner):** Workflow `.github/workflows/ci.yml` và test DB guard đã sẵn sàng và kiểm chứng clean-DB local thành công; kết quả chạy remote GitHub Actions phụ thuộc quyền push nhánh và trạng thái runner trên `origin`.
3. **AUD-023 (`DEFERRED`):** Hoãn chuyển đổi sang Cursor Pagination theo phạm vi UAT.
4. **Phạm vi ngoài đợt này:** Các mục **AUD-001 đến AUD-015** chưa triển khai trong đợt này.

---

## 6. KẾT LUẬN NGHIỆM THU RIÊNG (GO / NO-GO)

| Mục tiêu đánh giá | Quyết định | Lý do cụ thể |
|---|---|---|
| **Human UAT trên nhánh `feature/audit-16-30`** | **READY** | 188/188 Browser UAT checks + retest 4 case Payroll UAT Bug (`/payroll/12/employees/7` 404, `/payroll/12` 404, `/payroll`, `/payroll/26/employees/447` 200) PASS; toàn bộ targeted integration suites & builds PASS trên `crm_test_db` cô lập; DB staging `crm_db` nguyên vẹn |
| **Merge vào `main`** | **NOT READY (Đang chờ Human UAT & CI/PR Review)** | Giữ quy tắc không tự ý merge `main` trong giai đoạn Human UAT; chờ hoàn tất xác nhận remote CI và Human UAT sign-off |
| **Triển khai Production** | **NOT READY** | Chưa hoàn tất Human UAT sign-off; `AUD-016` còn `PARTIAL` (`kysely-codegen`); đợt cải thiện STT 01–15 chưa triển khai |
