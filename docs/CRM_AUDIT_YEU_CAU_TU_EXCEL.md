# DỮ LIỆU ĐÁNH GIÁ CRM — TRÍCH XUẤT TỪ EXCEL

> Nguồn: file người dùng tải lên `Bảng tính không có tiêu đề.xlsx` (2 sheet).
> Trạng thái: **Dữ liệu tham chiếu để giao việc Anti — CHƯA xác minh trực tiếp trên source code hiện tại**.
> Không tự coi các nhận định trong Excel là lỗi đã tái hiện. Không tự sửa mã nguồn.

## Tóm tắt

- Sheet 1: 30 vấn đề; Critical: 3, High: 12, Medium: 13, Low/Cleanup: 2.
- Sheet 2: Các ưu điểm hiện có và 5 đề xuất ưu tiên khi cần scale.
- Cần đối chiếu từng mục với repo, CI, Docker và môi trường deploy hiện tại trước khi phân công sửa.

## Sheet 1 — Bản ghi đầy đủ 30 vấn đề

| ID | Severity | Nhóm | Module/File | Vấn đề | Bằng chứng / Ví dụ | Ảnh hưởng | Đề xuất sửa (nguyên ý từ file) |
|---|---|---|---|---|---|---|---|
| 1 | Critical | Deploy | apps/web/src/api/* / cd.yml | Frontend production không sử dụng API URL được truyền từ CI/CD | CD build với VITE_API_URL, nhưng hầu hết API file đều hardcode const API_BASE_URL = '/api' | Deploy frontend lên Cloudflare Pages và backend Cloud Run riêng thì request /api/... có thể chạy vào domain frontend thay vì API | Tạo một apiConfig.ts: `import.meta.env.VITE_API_URL |
| 2 | Critical | Deploy | Dockerfile | Đường dẫn start backend có dấu hiệu sai | package.json: start = node dist/main, nhưng Docker CMD lại node apps/api/dist/src/main.js | Production container có khả năng không tìm thấy file và crash ngay khi start | Chuẩn hóa output build và CMD. Nếu Nest output là dist/main.js, Docker phải gọi apps/api/dist/main.js |
| 3 | Critical | Database/Deploy | src/scripts/migrate.ts | Migration runner tính sai đường dẫn database khi chạy từ file compiled | path.resolve(__dirname, '../../../../database') đúng khi chạy source src/scripts, nhưng khi compiled nằm trong dist/src/scripts thì thêm một tầng dist | Production migration có thể tìm /app/apps/database thay vì /app/database và fail | Không tính path tương đối từ __dirname; dùng project root/env như DATABASE_MIGRATIONS_DIR, hoặc package resource rõ ràng |
| 4 | High | Build | pnpm-lock.yaml / CI / Docker | Version pnpm không thống nhất | lockfile là lockfileVersion: '9.0'; CI pin pnpm 8.15.1; Docker dùng pnpm@latest; root không có packageManager | Build local, CI và Docker có thể hành xử khác nhau hoặc frozen lockfile lỗi | Thêm "packageManager": "pnpm@9.x.x" và dùng đúng một version ở CI/Docker/local |
| 5 | High | Code Quality | KyselyService | Dùng Kysely nhưng mất gần hết type safety | public db!: Kysely<any> | Sai tên table/column/type không được TypeScript bắt khi compile | Generate Database interface từ PostgreSQL hoặc định nghĩa schema types rồi dùng Kysely<Database> |
| 6 | High | Code Quality | tsconfig.json | TypeScript strictness đang bị tắt khá nhiều | strictNullChecks:false, noImplicitAny:false, forceConsistentCasingInFileNames:false | Nhiều bug chỉ xuất hiện runtime; refactor lớn nguy hiểm | Bật dần strict, ít nhất strictNullChecks, noImplicitAny, forceConsistentCasingInFileNames |
| 7 | High | Database | crm_order_schema.sql | Số index thấp so với số bảng và quan hệ | Khoảng 76 bảng nhưng chỉ thấy số lượng index explicit tương đối ít; nhiều FK như employee_id, project_id, order_id, team_id không có index tương ứng | Join, dashboard, report, payroll sẽ chậm khi data tăng | Index các FK/query hot path; dùng EXPLAIN ANALYZE để xác nhận thay vì index mọi cột |
| 8 | High | Security | AuthService.login | Chưa thấy login rate limiting / lockout | Forgot password có Redis rate-limit, nhưng login chỉ tìm user → verify password | Dễ bị brute-force password | Redis rate-limit theo IP + identifier, exponential backoff hoặc temporary lockout |
| 9 | High | Security | main.ts | CORS production đang rộng hơn cần thiết | Cho phép origin.endsWith('.trycloudflare.com'), origin.includes('localhost'), origin.includes('127.0.0.1') ngay trong callback | Một số origin ngoài danh sách chính thức vẫn được chấp nhận | Production chỉ whitelist exact trusted origins; logic dev localhost chỉ chạy khi NODE_ENV !== production |
| 10 | High | Storage/Security | LocalStorageProvider.getBuffer() | Có nguy cơ path traversal ở local storage | path.join(this.baseDir, key) với key đến từ route storage/raw/*, không thấy kiểm tra resolved path còn nằm trong baseDir | Authenticated user có thể thử đọc file ngoài upload directory nếu routing/encoding cho phép | path.resolve(baseDir,key) rồi verify resolved.startsWith(baseDir + path.sep) |
| 11 | High | Storage | LocalStorageProvider.getSignedUrl() | “Signed URL” local thực tế không có signature và expiry không được kiểm tra | URL chỉ thêm ?expires=...; serveRawFile() không validate expires hoặc signature | URL không thực sự signed; security semantics sai | Dùng HMAC signature + expiry validation hoặc không gọi đây là signed URL |
| 12 | High | Authorization | Controllers/Services | Authorization chưa thống nhất một cơ chế | Một số module dùng @RequirePermissions, số khác kiểm tra roles/employeeId thủ công trong controller/service | Dễ bỏ sót quyền khi thêm endpoint; audit security khó | Chuẩn hóa policy guard/decorator; scope dữ liệu nên thành reusable authorization service |
| 13 | High | Maintainability | teams.service.ts, subscriptions.service.ts, daily-reports.service.ts... | Service quá lớn | teams.service.ts ~1667 dòng, subscriptions.service.ts ~1581, daily-reports.service.ts ~1445 | Khó review, test, merge conflict và scale team | Chia domain service: query/read service, command service, policy service, reporting service |
| 14 | High | UI/Maintainability | DailyReportsPage.tsx | Component frontend cực lớn | DailyReportsPage.tsx khoảng 2538 dòng | State và business logic bị dồn vào một page; sửa UI dễ regression | Tách table/filter/form/modal/hooks/query logic thành component/hooks riêng |
| 15 | High | UI/Maintainability | OrganizationChartPage.tsx | Page quá lớn | Khoảng 2141 dòng | Khó hiểu flow, test và tối ưu render | Tách graph renderer, member panel, toolbar, modals và hooks |
| 16 | Medium | Code Quality | Toàn backend | any xuất hiện nhiều trong production code | Nhiều as any, trx:any, query result any[] | Kysely + TypeScript không còn bảo vệ schema contract tốt | Sau khi tạo Database typing, loại dần as any ở service/query |
| 17 | Medium | REST API | Controllers | API mang tính command/action nhiều | Ví dụ POST /projects/:id/start, /block, /review, /approve, /cancel | Không sai với workflow API, nhưng không phải REST thuần | Có thể giữ command endpoint nếu nghiệp vụ state machine; document rõ và thống nhất convention |
| 18 | Medium | REST API | API response | Có ApiResponse<T> shared nhưng không thực sự enforce | packages/shared định nghĩa {success,data,error,timestamp}, nhưng backend không có global interceptor/filter dùng contract này | Frontend phải xử lý nhiều response/error shape khác nhau | Hoặc bỏ ApiResponse, hoặc implement global response interceptor + exception filter |
| 19 | Medium | Testing | .github/workflows/ci.yml | Có nhiều test nhưng CI chỉ chạy một phần | Project có rất nhiều test:*, CI chính chạy auth, KPI và phase-Q E2E | Module-specific regression có thể lọt nếu E2E không cover hết | Tạo test matrix hoặc ít nhất chạy các domain quan trọng song song |
| 20 | Medium | Documentation | README.md | README đã lỗi thời so với code hiện tại | README vẫn ghi “Backend sẽ phát triển ở giai đoạn tiếp theo”, trong khi backend hiện rất lớn | Developer mới setup sai hoặc đánh giá sai kiến trúc | Viết lại README: architecture, setup, env, migrate, test, deploy |
| 21 | Medium | Dev Experience | Root package.json | Không khai báo package manager version | Không có "packageManager": "pnpm@..." | Developer có thể dùng pnpm version khác | Pin pnpm version và Node version (engines) |
| 22 | Medium | Scalability | KyselyService | Connection pool hardcode max:20 | Mỗi Cloud Run instance có pool tối đa 20; Cloud Run có thể scale nhiều instance | Tổng connection có thể vượt Cloud SQL limit khi autoscale | Pool size qua env và tính theo DB max connections / max instances |
| 23 | Medium | Scalability | List pagination | Offset pagination được dùng rộng rãi | .limit().offset() cho leads, deals, orders, projects... | Offset lớn sẽ chậm khi data tăng mạnh | Với các bảng lớn chuyển dần sang cursor/keyset pagination |
| 24 | Medium | Security | JWT | Role/permission được nhúng trực tiếp vào access token 15 phút | Guard đọc permission từ token, không query lại | Khi revoke role, token hiện tại có thể giữ quyền tối đa 15 phút | Chấp nhận nếu policy cho phép; nếu cần revoke ngay, dùng token version/session permission check |
| 25 | Medium | UI/UX | Routing/Menu | Role logic bị duplicate giữa MainLayout và RoleRoute | MainLayout có nhiều isBoss/isAdmin/isSale/...; App lại khai role lần nữa | Thêm role mới phải sửa nhiều nơi, dễ lệch menu và routing | Tạo route/menu configuration dựa trên permission thay vì hardcode role ở nhiều file |
| 26 | Medium | UI/UX | Frontend | Dùng role để ẩn menu thay vì permission là chính | Menu chủ yếu phân nhánh theo role | User có custom permission có thể thấy UI không phù hợp backend permission | UI cũng nên dùng permission capability map |
| 27 | Medium | UI/UX | Responsive | Responsive foundation khá tốt nhưng page lớn có thể khó duy trì | CSS có media queries 576/768/992/1200 và mobile drawer, đây là điểm tốt; nhưng nhiều page có table/form logic riêng | Các màn mới dễ có responsive behavior không đồng nhất | Chuẩn hóa PageLayout, ResponsiveTable, filter toolbar và modal form patterns |
| 28 | Medium | Architecture | Frontend API layer | API_BASE_URL được duplicate ở nhiều file | auth.ts, subscriptions.ts, teams.ts, employees.ts... đều khai riêng | Khó đổi deployment topology và dễ cấu hình lệch | Tạo một API client/config dùng chung |
| 29 | Low/Cleanup | Naming | Schema/API | Naming nhìn chung tốt nhưng có một số domain naming chưa chuẩn hóa tuyệt đối | team_id, employeeId, employee_id, DTO camelCase và DB snake_case là hợp lý nhưng mapping nhiều chỗ manual | Boilerplate và dễ nhầm khi object truyền xuyên layer | Centralize mapper/domain model thay vì cast/manual mapping rải rác |
| 30 | Low/Cleanup | Logging | Backend | Logging framework chưa đồng nhất ở mọi nơi | Nest/Fastify logger có sử dụng, nhưng vẫn có console.log/error ở bootstrap/scripts | Log production khó chuẩn hóa hoàn toàn | Dùng Nest Logger/Pino structured logging và request correlation ID |

## Sheet 2 — Các điểm tích cực được ghi nhận

- Database integrity tốt hơn hẳn: FK, CHECK constraint, UNIQUE constraint và NUMERIC(15,2) được dùng khá nghiêm túc.
- Có transaction cho các flow quan trọng như lead conversion, deal/order, employee, daily report.
- Có refresh-token rotation và chỉ lưu hash refresh token trong Redis, đây là cách làm tốt.
- Có ValidationPipe với:
- whitelist: true
forbidNonWhitelisted: true
transform: true
- Có production env validation và fail-fast khi secret/default password không đạt yêu cầu.
- Có RBAC permission model, không chỉ đơn giản check login.
- Upload file có kiểm tra extension + MIME + magic bytes.
- Pagination phần lớn đã có default và cap khoảng 100.
- Có Redis/BullMQ cho background jobs thay vì làm toàn bộ synchronous.
- Có integration/E2E/UAT test tương đối nhiều.
- Có CI/CD, Docker multi-stage, non-root container, healthcheck.

## Sheet 2 — 5 đề xuất nếu muốn scale

- Kiến trúc có thể scale, nhưng mình sẽ chưa tăng traffic lớn trước khi sửa 5 việc:
- Fix đường dẫn frontend → production API.
- Fix Docker/migration production paths.
- Type hóa Kysely<Database>.
- Thêm index cho các FK/query hot path.
- Refactor các service/page 1.000–2.500 dòng.

## Nguyên tắc triển khai cho Anti

- **P0 — xác minh trước deploy:** AUD-01 đến AUD-03 (deploy config, Docker startup, migration path).
- **P1 — xác minh bảo mật và vận hành:** các vấn đề High, nhất là AUD-08 đến AUD-12. Không sửa dựa trên suy đoán.
- **P2 — cải thiện chất lượng và hiệu năng:** typing, index, CI regression, cấu hình, UI/UX.
- **P3 — bảo trì/refactor:** chia service/page quá lớn và cleanup; không thực hiện đồng loạt trong Human UAT nếu chưa có bằng chứng lỗi.
- Giữ nguyên frozen business rules; mỗi mục ghi `CONFIRMED / NOT_REPRODUCED / NEEDS_EVIDENCE / FIXED`, test trước/sau, tác động và rollback.
