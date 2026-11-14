# CRM VMAX — Hệ Thống Quản Trị Khách Hàng & Vận Hành Doanh Nghiệp

Hệ thống Quản trị Doanh nghiệp CRM VMAX toàn diện (Enterprise Customer Relationship Management & Operations Platform), thiết kế chuyên biệt theo mô hình vận hành của doanh nghiệp Việt Nam: quản lý vòng đời khách hàng, pipeline bán hàng, dự án phần mềm/SEO, hợp đồng định kỳ, tài chính kế toán, hoa hồng, KPI và nhân sự.

---

## 1. Tổng Quan Kiến Trúc

CRM VMAX được xây dựng theo mô hình Monorepo (pnpm workspaces) tách biệt rõ ràng giữa Backend API service, Background Queue Worker, Shared Type Library và Frontend Single Page Application.

```text
du-an-cuoi-khoa-f8/
├── apps/
│   ├── api/                    # NestJS (Fastify engine) REST API + BullMQ Worker
│   │   ├── src/
│   │   │   ├── common/         # Filters (AllExceptionsFilter), Interceptors, Middleware
│   │   │   ├── config/         # Environment validation (env.config.ts) & Pool sizing
│   │   │   ├── database/       # Kysely connection pool & query builder
│   │   │   ├── modules/        # Domain modules (auth, leads, deals, orders, finance, etc.)
│   │   │   └── scripts/        # Database migrations & verification scripts
│   └── web/                    # React 18 + Vite + Ant Design 5 Frontend SPA
│       ├── src/
│       │   ├── api/            # API client layer (config.ts, auth.ts, domain clients)
│       │   ├── components/     # Reusable components & PermissionGate
│       │   ├── config/         # Navigation & canonical RBAC definitions
│       │   ├── layout/         # MainLayout, mobile drawer, responsive wrappers
│       │   ├── pages/          # 9 Canonical workspaces and domain pages
│       │   └── store/          # Zustand authentication store
├── packages/
│   └── shared/                 # DTOs, interfaces, common types (@crm/shared)
├── docker-compose.yml          # PostgreSQL 16 & Redis 7 infrastructure
├── pnpm-workspace.yaml         # Monorepo workspace configuration
└── README.md
```

---

## 2. Công Nghệ Sử Dụng

### Backend (`apps/api`)
- **Runtime:** Node.js `>= 20.0.0`
- **Framework:** NestJS 10.x với Fastify adapter (`@nestjs/platform-fastify`) tối ưu thông lượng I/O
- **Database Query Builder:** Kysely (Type-safe SQL query builder) kết nối PostgreSQL driver `pg`
- **Queue & Background Jobs:** BullMQ + Redis 7
- **Bảo mật:** JWT (Access + Refresh tokens) kèm Redis session state validation trên từng request, bcrypt password hashing
- **Testing:** Jest, Supertest, E2E Matrix

### Frontend (`apps/web`)
- **Framework & Bundler:** React 18, Vite 5, TypeScript
- **UI Component System:** Ant Design 5 (Antd) với hệ thống Design Token VMAX tùy biến
- **Data Fetching & State:** `@tanstack/react-query` (TanStack Query v5) & Zustand
- **Routing:** React Router v6 với `RoleRoute` và `PermissionGate`
- **Charts & Graphs:** React Flow, Ant Design Charts

### Dữ Liệu & Hạ Tầng
- **Cơ sở dữ liệu:** PostgreSQL 16 (Hỗ trợ JSONB, UUID, Full-Text Search, ACID transactions)
- **Cache & Session Store:** Redis 7 Alpine
- **Package Manager:** `pnpm` (Pinned version `9.15.4`)

---

## 3. 9 Role Chuẩn Trong Hệ Thống (Canonical Roles)

CRM VMAX phân quyền RBAC đa cấp với 9 vai trò nghiệp vụ:
1. **BOSS (Ban Giám Đốc):** Toàn quyền kiểm soát tài chính, nhân sự, sơ đồ tổ chức, tài khoản và phê duyệt cấp cao.
2. **ADMIN (Quản trị hệ thống):** Cấu hình kỹ thuật, giám sát dữ liệu và quản trị chung.
3. **SALES_TEAM_LEADER (Trưởng nhóm Kinh doanh):** Phân bổ lead/deal, giám sát pipeline, KPI và hiệu suất team sale.
4. **SALE (Nhân viên Kinh doanh):** Quản lý khách hàng tiềm năng, cơ hội bán hàng, đơn hàng cá nhân.
5. **DEV_TEAM_LEADER (Trưởng nhóm Lập trình):** Quản lý backlog dự án phần mềm, phân công task, duyệt tiến độ.
6. **DEV (Kỹ sư Phần mềm):** Thực thi dự án, cập nhật task, báo cáo tiến độ kỹ thuật.
7. **SEO_TEAM_LEADER (Trưởng nhóm SEO):** Quản lý chiến dịch SEO, phân công từ khóa và dự án SEO.
8. **SEO (Nhân viên SEO):** Triển khai dự án SEO, báo cáo chỉ số và tiến độ.
9. **ACCOUNTANT (Kế toán):** Quản lý phiếu thu, công nợ phải thu, chi phí, dòng tiền, bảng lương và duyệt thanh toán.

---

## 4. Yêu Cầu Môi Trường & Cài Đặt

### Yêu cầu
- **Node.js:** `>= 20.0.0` (Khuyến nghị Node.js LTS v20.x hoặc v22.x)
- **pnpm:** `>= 9.0.0` (Khuyến nghị cài qua Corepack: `corepack enable && corepack prepare pnpm@9.15.4 --activate`)
- **Docker & Docker Compose:** Dùng để chạy PostgreSQL và Redis nội bộ

### Cài đặt Dependencies
```bash
# Kích hoạt pnpm phiên bản chuẩn
corepack enable
corepack prepare pnpm@9.15.4 --activate

# Cài đặt toàn bộ dependencies trong workspace
pnpm install --frozen-lockfile
```

---

## 5. Khởi Động PostgreSQL & Redis (Docker)

Hệ thống cung cấp sẵn file `docker-compose.yml` cấu hình sẵn PostgreSQL 16 và Redis 7:

```bash
# Khởi động PostgreSQL (port 5432) và Redis (port 6379)
docker compose up -d

# Kiểm tra trạng thái containers
docker compose ps
```

---

## 6. Cấu Hình Biến Môi Trường (Environment Variables)

Tạo file `.env` tại thư mục gốc hoặc trong `apps/api/.env` từ file mẫu:

```ini
# Server
PORT=3000
NODE_ENV=development

# Database Connection Pool (AUD-022)
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=crm_dev
DB_POOL_MAX=20
DB_POOL_MIN=2
DB_IDLE_TIMEOUT_MS=30000
DB_CONN_TIMEOUT_MS=5000

# Redis Connection
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT Secrets
JWT_SECRET=your_jwt_secret_key_minimum_32_characters
JWT_REFRESH_SECRET=your_jwt_refresh_secret_key_minimum_32_characters
JWT_EXPIRES_IN=1h
JWT_REFRESH_EXPIRES_IN=7d
```

Frontend (`apps/web/.env`):
```ini
# URL trỏ tới Backend API (AUD-028)
VITE_API_URL=/api
```

---

## 7. Migration & Seed Dữ Liệu

```bash
# Build package shared trước
pnpm build:shared

# Chạy migration cấu trúc database
pnpm --filter api db:migrate

# Seed dữ liệu mẫu (môi trường Staging/Dev)
pnpm --filter api seed:staging
```

---

## 8. Chạy Ứng Dụng Localhost

### Chạy đồng thời cả Backend và Frontend:
```bash
# Chạy song song dev servers
pnpm dev
```

### Hoặc chạy riêng biệt từng ứng dụng:
```bash
# Terminal 1: Backend API (Fastify trên cổng http://localhost:3000)
pnpm --filter api start:dev

# Terminal 2: Frontend SPA (Vite trên cổng http://localhost:5173)
pnpm --filter web dev
```

Truy cập hệ thống tại: `http://localhost:5173`

---

## 9. Build Dự Án

```bash
# Build toàn bộ monorepo (shared, api, web)
pnpm build

# Hoặc build từng phần:
pnpm build:shared
pnpm --filter api build
pnpm --filter web build
```

---

## 10. Kiểm Thử Tự Động (Testing)

CRM VMAX tích hợp bộ test tự động toàn diện theo module:

```bash
# Chạy toàn bộ test suites
pnpm test

# Test xác thực & RBAC
pnpm --filter api test:auth

# Test cấu hình môi trường & Pool (AUD-022)
pnpm --filter api test:env

# Test nghiệp vụ báo cáo hàng ngày (AUD-016, AUD-029)
pnpm --filter api test:daily-report

# Test tính toán KPI & Commission
pnpm --filter api test:kpi
pnpm --filter api test:commission

# Test tích hợp luồng nghiệp vụ E2E
pnpm --filter api test:e2e
```

---

## 11. Chuẩn Hóa API & Giao Thức

- **Error Response Standard (AUD-018):** Mọi lỗi HTTP đều trả về định dạng thống nhất:
  ```json
  {
    "statusCode": 400,
    "error": "Bad Request",
    "message": "Thông điệp mô tả lỗi chi tiết bằng tiếng Việt",
    "details": null,
    "timestamp": "2026-11-10T22:00:00.000Z",
    "path": "/api/orders/123/approve",
    "correlationId": "req-uuid-12345",
    "success": false
  }
  ```
- **Correlation ID (AUD-030):** Header `x-correlation-id` được đính kèm vào mỗi request và ghi nhận trong structured logs của server.
- **Workflow State Machine Guide (AUD-017):** Chi tiết các endpoint chuyển đổi trạng thái (Approve, Reject, Cancel, Complete) được ghi nhận đầy đủ tại `docs/API_WORKFLOW_COMMAND_GUIDE.md`.

---

## 12. Troubleshooting Thường Gặp

| Vấn đề | Nguyên nhân | Cách khắc phục |
|---|---|---|
| Lỗi kết nối PostgreSQL | Container PostgreSQL chưa chạy hoặc sai port | Kiểm tra `docker compose ps`. Đảm bảo cổng `5432` không bị chiếm dụng bởi service khác. |
| Lỗi Redis 6379 ECONNREFUSED | Redis chưa chạy | Chạy `docker compose up -d redis`. |
| 401 Unauthorized sau khi đổi quyền | Phiên làm việc (Session) đã bị revoke theo cơ chế bảo mật AUD-024 | Đăng nhập lại để nhận JWT và phiên làm việc mới với role cập nhật. |
| Lockfile config mismatch | Thay đổi phiên bản dependency không đồng bộ | Dùng `pnpm install --prefer-frozen-lockfile`. Không sửa trực tiếp checksum trong lockfile. |
| Frontend báo Network Error | Backend chưa chạy hoặc cấu hình `VITE_API_URL` sai | Kiểm tra backend port 3000 đang phản hồi và file proxy/vite `VITE_API_URL=/api`. |

---

## 13. Giấy Phép & Bảo Mật

- Nghiêm cấm commit thông tin nhạy cảm (Private Keys, Production Secrets, Database Passwords) lên hệ thống quản lý phiên bản.
- Tất cả API quan trọng đều yêu cầu xác thực JWT và kiểm tra quyền RBAC tại tầng Guard backend.
