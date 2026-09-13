# CRM PRODUCTION RUNBOOK: CI/CD, BACKUP, MONITORING & DISASTER RECOVERY (DR)

---

## 1. PRODUCTION ARCHITECTURE OVERVIEW

```
                      +-----------------------------+
                      |       CLOUDFLARE CDN        |
                      |   (DNS, SSL/TLS, WAF, CDN)   |
                      +--------------+--------------+
                                     |
               +---------------------+---------------------+
               |                                           |
               v                                           v
    +-----------------------+                   +-----------------------+
    |   CLOUDFLARE PAGES    |                   |   GOOGLE CLOUD RUN    |
    |     Frontend SPA      |                   |    Backend API (Fastify)   |
    | (Vite / React / AntD) |                   |  Port 8080 / Non-Root |
    +-----------------------+                   +-----------+-----------+
                                                            |
                     +--------------------------------------+--------------------------------------+
                     |                                      |                                      |
                     v                                      v                                      v
          +----------------------+              +----------------------+              +----------------------+
          |   GOOGLE CLOUD SQL   |              |  GOOGLE MEMORYSTORE  |              |    CLOUDFLARE R2     |
          |    PostgreSQL 16     |              |     Redis 7 (VPC)    |              | Private S3 Storage   |
          | Automated Backup/PITR|              |  BullMQ & Caching    |              | Presigned Signed URLs|
          +----------------------+              +-----------+----------+              +----------------------+
                                                            |
                                                +-----------+-----------+
                                                |   GOOGLE CLOUD RUN    |
                                                | Background Worker     |
                                                | (CPU Always Allocated)|
                                                |  --no-cpu-throttling  |
                                                +-----------------------+
```

---

## 2. CLOUD RUN BACKGROUND WORKER DEPLOYMENT MODEL (CRITICAL)

### 2.1 Bản Chất Nghiệp Vụ & Yêu Cầu Hạ Tầng
- Phase N BullMQ Worker (`NotificationWorker`, `ReminderWorker`, `MaintenanceWorker`) là tác vụ **pull-based liên tục** (continuous worker), chủ động kéo jobs từ Redis Memorystore.
- **Rủi ro trên Google Cloud Run Service mặc định**: Chế độ mặc định của Cloud Run chỉ cấp CPU khi có request HTTP đến (request-based billing / CPU throttling outside requests). Nếu không có request HTTP, container sẽ bị đóng băng CPU, dẫn đến việc BullMQ worker **không thể xử lý background jobs kịp thời**!

### 2.2 Mô Hình Triển Khai Chuẩn
1. **Lựa chọn 1 (Khuyến nghị cho Cloud Run Service)**:
   - Cấu hình bắt buộc:
     - **`--no-cpu-throttling`** (hoặc `--cpu-allocation=always`): Đảm bảo CPU luôn được cấp 100% liên tục cho container bất kể có request HTTP hay không (Instance-based billing).
     - **`--min-instances=1`**: Đảm bảo luôn có ít nhất 1 container worker thường trực kết nối tới Redis để tiêu thụ queue.
     - `concurrency: 10`, `timeout: 900s`.
2. **Lựa chọn 2 (Cloud Run Worker Pool / Cloud Run Jobs)**:
   - Cloud Run Worker Pool cho phép chạy continuous background workers không mở port công khai, kết nối trực tiếp vào Serverless VPC.

> [!IMPORTANT]
> Pipeline CD trong `.github/workflows/cd.yml` đã được định cấu hình chính xác cờ `--no-cpu-throttling` và `--min-instances=1` để triệt tiêu hoàn toàn sự phụ thuộc vào request HTTP.

---

## 3. PRODUCTION ENVIRONMENT & SECRETS HARDENING

### 3.1 Fail-Fast Rules
Khi `NODE_ENV=production`, backend CRM API và Background Worker thực thi quy tắc kiểm tra nghiêm ngặt ngay khi khởi động:
- **Cấm hoàn toàn fallback mật khẩu dev**: `AdminPass123!@#`, `postgres_secret_dev`, `default_access_secret_for_dev_only`, `default_refresh_secret_for_dev_only`.
- **Thiếu secret bắt buộc**: Quá trình khởi động lập tức ném ngoại lệ và thoát với mã lỗi `process.exit(1)` (Fail-Fast).
- **Tuyệt đối không log credentials**: Password, JWT payload, Refresh Token, R2 Access/Secret keys, và nội dung file thanh toán không bao giờ xuất hiện trong console logs.

### 3.2 Production Environment Variables Matrix

| Biến Môi Trường | Mục Đích | Yêu Cầu Production | Nguồn Quản Lý Khuyến Nghị |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Môi trường thực thi | Bắt buộc `production` | Cloud Run Env |
| `PORT` | Cổng HTTP lắng nghe | `8080` (mặc định Cloud Run) | Cloud Run Env |
| `DATABASE_URL` | Kết nối PostgreSQL Cloud SQL | `postgresql://...` hoặc Unix Socket | Google Secret Manager |
| `REDIS_HOST` / `REDIS_URL` | Địa chỉ Memorystore Redis | Private IP qua Serverless VPC | Google Secret Manager |
| `JWT_ACCESS_SECRET` | Khóa ký Access Token | Chuỗi ngẫu nhiên $\ge$ 32 ký tự | Google Secret Manager |
| `JWT_REFRESH_SECRET` | Khóa ký Refresh Token | Chuỗi ngẫu nhiên $\ge$ 32 ký tự | Google Secret Manager |
| `BOOTSTRAP_ADMIN_PASSWORD` | Mật khẩu tài khoản quản trị | Mật khẩu mạnh $\ge$ 12 ký tự | Google Secret Manager |
| `CLOUDFLARE_R2_ACCOUNT_ID` | Cloudflare Account ID | Account ID thực | Cloud Run Env |
| `CLOUDFLARE_R2_ACCESS_KEY_ID` | R2 Access Key | Access Key ID | Google Secret Manager |
| `CLOUDFLARE_R2_SECRET_ACCESS_KEY`| R2 Secret Access Key | Secret Key | Google Secret Manager |
| `CLOUDFLARE_R2_BUCKET` | Tên Private Bucket | Tên Bucket riêng tư | Cloud Run Env |
| `FRONTEND_URL` / `CORS_ORIGIN` | Nguồn CORS cho phép | Tên miền chính thức (không localhost)| Cloud Run Env |

---

## 4. DATABASE MIGRATION STRATEGY

### 4.1 Quy Trình Safe Deployment
$$\text{Build Image} \longrightarrow \text{Run Pre-Deploy Migration} \longrightarrow \text{Deploy Cloud Run API} \longrightarrow \text{Deploy Cloud Run Worker}$$

### 4.2 Đặc Tính An Toàn Của Runner (`apps/api/src/scripts/migrate.ts`)
1. **Bảng kiểm soát**: Sử dụng bảng `schema_migrations (version, applied_at)` để theo dõi lịch sử áp dụng.
2. **Idempotency**: Kiểm tra file trước khi thực thi. Nếu đã áp dụng sẽ log `[SKIP]` và bỏ qua an toàn.
3. **Transaction Isolated**: Từng file migration chạy trong một khối giao dịch riêng (`BEGIN ... COMMIT`). Nếu phát sinh lỗi, toàn bộ file đó tự động rollback (`ROLLBACK`) mà không làm hỏng trạng thái cơ sở dữ liệu.
4. **Không chạy seed test**: Runner chỉ áp dụng cấu trúc schema và migration, tuyệt đối không chạy dữ liệu mẫu `crm_seed.sql` trên production.
5. **Zero Destructive Drops**: Tuyệt đối không chứa câu lệnh drop table/drop database tự động.

---

## 5. BACKUP POLICY & SPECIFICATION

### 5.1 Cloud SQL PostgreSQL
- **Automated Daily Backups**: Cloud SQL tự động tạo bản sao lưu toàn bộ (snapshot) mỗi ngày vào khung giờ thấp điểm (02:00 - 04:00 AM UTC+7).
- **Point-In-Time Recovery (PITR)**: Kích hoạt ghi log WAL (Write-Ahead Logging) với thời gian lưu trữ tối thiểu 7 ngày. Cho phép khôi phục cơ sở dữ liệu về bất kỳ giây cụ thể nào trong vòng 7 ngày gần nhất.
- **Location**: Dual-region hoặc Multi-region để bảo vệ dữ liệu chống sự cố thảm họa cấp vùng.

### 5.2 Cloudflare R2 Object Storage
- **Object Versioning**: Bật tính năng Versioning trên bucket `crm-uploads` để ngăn chặn việc xóa nhầm hoặc ghi đè tập tin bằng chứng.
- **Không tự động xóa tập tin**: Mọi tập tin chứng từ tài chính (Payment Proof, Contract) được lưu trữ vĩnh viễn, không áp dụng lifecycle tự động purge.

### 5.3 Backup Status
- `BACKUP POLICY = AUTOMATED DAILY SNAPSHOT + 7-DAY PITR WAL`
- `RPO (Recovery Point Objective) = OPEN` *(Chờ SLA nghiệp vụ chính thức từ User)*.
- `RTO (Recovery Time Objective) = OPEN` *(Chờ SLA nghiệp vụ chính thức từ User)*.
- `BACKUP STATUS = CONFIGURATION/POLICY READY, NOT VERIFIED` *(Chưa thực hiện backup drill trên cloud thật)*.

---

## 6. MONITORING & OBSERVABILITY

### 6.1 Health Check Endpoints
- **Liveness Probe**: `GET /api/healthz` $\longrightarrow$ Trả về HTTP 200 `{ status: "alive" }` kiểm tra container process đang hoạt động.
- **Readiness Probe**: `GET /api/ready` & `GET /api/health` $\longrightarrow$ Kiểm tra kết nối thực tế tới PostgreSQL (`SELECT 1`) và Redis (`PING`).
  - Trạng thái bình thường: Trả về **HTTP 200 OK** `{ status: "ok", database: "connected", redis: "connected", memory, uptime }`.
  - Trạng thái suy giảm: Trả về **HTTP 503 SERVICE UNAVAILABLE** `{ status: "degraded", ... }` để Cloud Run tự động dừng phân phối traffic vào container lỗi.

### 6.2 Giám Sát Hàng Đợi (Queue Observability)
- Quản trị viên (ADMIN / BOSS) có thể truy cập `GET /api/system/queues` để theo dõi realtime số lượng job của từng hàng đợi BullMQ (`waiting`, `active`, `completed`, `failed`, `delayed`).

### 6.3 Monitoring Status
- `MONITORING STATUS = CODE/CONFIG READY, NOT CLOUD VERIFIED` *(Endpoint và code đã sẵn sàng và test cục bộ, chưa kết nối Cloud Monitoring thực tế)*.

---

## 7. ALERTING THRESHOLDS (OPEN CONFIGURATION)

> [!NOTE]
> `ALERT THRESHOLDS = OPEN`
> Các chỉ số bên dưới là **SUGGESTED INITIAL CONFIG**, không phải canonical SLA. Ngưỡng chính thức sẽ được tinh chỉnh theo lưu lượng vận hành thực tế.

### Suggested Initial Configuration (Khuyến nghị khởi điểm):
1. **API Error Spike (Suggested)**: Tỷ lệ HTTP 5xx vượt quá **2%** trong 5 phút liên tiếp.
2. **Database Health Failure (Suggested)**: Endpoint `/api/health` trả về `database: disconnected` hoặc Cloud SQL CPU vượt quá **85%** trong 5 phút.
3. **Redis Memory / Connection Alert (Suggested)**: Memorystore Redis memory usage vượt quá **80%** hoặc mất kết nối trong 1 phút.
4. **BullMQ Failed Jobs Alert (Suggested)**: Số lượng job thất bại tích lũy vượt quá **10 jobs** trong 1 giờ.
5. **High Latency Alert (Suggested)**: Thời gian phản hồi p95 vượt quá **2,000ms** trong 10 phút.

---

## 8. DISASTER RECOVERY (DR) RUNBOOK

> [!CAUTION]
> `DR STATUS = RUNBOOK READY, NOT RESTORE VERIFIED`  
> Không claim "DR Verified" trên môi trường production khi chưa thực hiện diễn tập khôi phục (Restore Drill) thực tế trên hạ tầng cloud.

### 8.1 Kịch Bản 1: Cloud Run API / Worker Gặp Lỗi Cần Rollback Tức Thì
1. Kiểm tra danh sách revision hiện tại:
   ```bash
   gcloud run revisions list --service=crm-api --region=asia-southeast1
   ```
2. Điều hướng 100% lưu lượng về revision ổn định trước đó:
   ```bash
   gcloud run services update-traffic crm-api \
     --region=asia-southeast1 \
     --to-revisions=crm-api-PREVIOUS_REVISION=100
   ```
3. Rollback Worker service tương tự:
   ```bash
   gcloud run services update-traffic crm-worker \
     --region=asia-southeast1 \
     --to-revisions=crm-worker-PREVIOUS_REVISION=100
   ```

### 8.2 Kịch Bản 2: Cơ Sở Dữ Liệu Gặp Sự Cố Cần Khôi Phục (Cloud SQL PITR Restore)
1. Xác định thời điểm chính xác cần khôi phục (trước thời điểm dữ liệu bị lỗi).
2. Tạo instance mới từ bản sao lưu PITR:
   ```bash
   gcloud sql instances clone crm-db-instance crm-db-restored \
     --point-in-time="2026-09-09T14:30:00.000Z"
   ```
3. Sau khi instance mới sẵn sàng, cập nhật secret `DATABASE_URL` trong Secret Manager trỏ tới `crm-db-restored`.
4. Deploy hoặc khởi động lại Cloud Run để nhận kết nối mới.

### 8.3 Kịch Bản 3: Redis Memorystore Gặp Sự Cố
1. Nếu Redis Memorystore gặp sự cố hoặc bảo trì hạ tầng:
   - Các API không phụ thuộc cache tiếp tục hoạt động.
   - Các tác vụ xếp hàng qua BullMQ (`NotificationWorker`, `ReminderWorker`, `MaintenanceWorker`) sẽ tự động retry khi kết nối Redis được tái lập nhờ cấu hình `maxRetriesPerRequest: null`.
   - Endpoint `/api/health` trả về `degraded` cảnh báo đội vận hành.
2. Nếu cần thay thế instance Redis mới: cập nhật `REDIS_HOST` và khởi động lại dịch vụ.

### 8.4 Kịch Bản 4: Xoay Vòng Bí Mật (Secret Rotation Runbook)
1. **JWT Secret Rotation**:
   - Cập nhật `JWT_ACCESS_SECRET` trong Secret Manager.
   - Triển khai bản cập nhật. Người dùng có access token cũ sẽ tự động refresh qua `/api/auth/refresh` bằng refresh token hợp lệ.
2. **R2 Credential Rotation**:
   - Tạo Access Key mới trên Cloudflare R2 dashboard.
   - Cập nhật Secret Manager và khởi động lại Cloud Run.
   - Xóa bỏ Access Key cũ trên Cloudflare sau khi kiểm tra upload/download hoạt động bình thường.

### 8.5 Kịch Bản 5: Frontend Rollback Trên Cloudflare Pages
1. Mở trang quản trị Cloudflare Dashboard $\longrightarrow$ Pages $\longrightarrow$ `crm-web-app`.
2. Mở tab **Deployments**, tìm bản deployment thành công gần nhất.
3. Nhấp vào menu 3 chấm $\longrightarrow$ chọn **Rollback to this deployment**. Quá trình hoàn tất trong vòng 1-2 giây trên mạng lưới toàn cầu của Cloudflare.

---

## 9. PRODUCTION PREREQUISITES & BLOCKERS (PENDING PHYSICAL CLOUD DEPLOYMENT)

Trước khi hệ thống có thể chuyển từ **DEPLOYMENT PLAN READY** sang **DEPLOYMENT VERIFIED**, các điều kiện tiên quyết ngoại vi sau bắt buộc phải được thiết lập trên tài khoản Cloud thực tế:
1. **GCP Project & Infrastructure Resources**:
   - Google Cloud Project (`GCP_PROJECT_ID`).
   - Cloud SQL PostgreSQL 16 instance (`crm-postgres-prod`).
   - Memorystore Redis 7 instance (`crm-redis-prod`).
   - Serverless VPC Access Connector (`crm-vpc-connector`).
   - Artifact Registry Docker repository (`asia-southeast1-docker.pkg.dev/...`).
2. **Cloudflare Infrastructure Resources**:
   - Cloudflare Pages project (`crm-web-app`).
   - Cloudflare R2 private bucket (`crm-uploads`).
   - Cloudflare API Token với quyền Pages & R2.
3. **Authentication & Secret Management**:
   - Thiết lập GCP Workload Identity Federation (`GCP_WIF_PROVIDER`, `GCP_WIF_SERVICE_ACCOUNT`).
   - Cấu hình secrets trong Google Secret Manager: `crm_database_url`, `crm_jwt_access_secret`, `crm_jwt_refresh_secret`, `crm_r2_access_key`, `crm_r2_secret_key`, `crm_redis_host`.
4. **Actual Staging/Production Deployment**:
   - Chạy pipeline CD trên môi trường thật và kiểm chứng kết nối end-to-end.
