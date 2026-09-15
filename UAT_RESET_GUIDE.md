# HƯỚNG DẪN SAO LƯU VÀ KHÔI PHỤC MÔI TRƯỜNG STAGING CHO UAT (UAT RESET GUIDE)

> **Mục đích:** Cung cấp quy trình tiêu chuẩn cho DevOps, QA Lead và nhân viên kiểm thử để chủ động sao lưu (snapshot) và khôi phục (clean reset) môi trường Staging về trạng thái ban đầu sạch sẽ giữa các đợt kiểm thử Human UAT.  
> **Phiên bản Baseline:** `uat-v1.0.0` (FROZEN BASELINE FOR HUMAN UAT)  

---

## 1. NGUYÊN TẮC BẢO VỆ AN TOÀN TUYỆT ĐỐI (SAFETY INVARIANTS)

1. **Cô lập môi trường:** Toàn bộ scripts sao lưu và reset được cấu hình cơ chế tự động chặn (**Hard Safety Block**). Nếu phát hiện biến môi trường `NODE_ENV=production` hoặc tên cơ sở dữ liệu chứa `prod`/`production`, scripts sẽ ngay lập tức hủy bỏ và báo lỗi.
2. **Không ảnh hưởng dữ liệu thật:** Mọi thao tác chỉ tác động lên container Docker `crm_postgres` nội bộ và database `crm_db` trên Staging.
3. **Sao lưu trước khi xóa (Safety Snapshot):** Bất kỳ lệnh reset nào cũng tự động tạo một snapshot sao lưu trước khi thực hiện xóa DB.
4. **Cam kết Zero Orphan:** Sau khi reset, hệ thống tự động kiểm tra xác nhận số lượng orphan users = 0.

---

## 2. QUY TRÌNH SAO LƯU SNAPSHOT (PRE-UAT BACKUP)

Trước khi bắt đầu một ca kiểm thử UAT mới (để có thể quay lại đối soát nếu cần), thực hiện tạo bản snapshot:

### Cách 1: Chạy script tự động (Khuyến nghị)
```bash
./scripts/uat-backup.sh
```

### Cách 2: Lệnh trực tiếp qua Docker
```bash
mkdir -p database/backups
docker exec -i crm_postgres pg_dump -U postgres -Fc crm_db > database/backups/staging_uat_snapshot_$(date +%Y%m%d_%H%M%S).dump
```

* **Vị trí lưu trữ:** `database/backups/staging_uat_snapshot_YYYYMMDD_HHMMSS.dump`
* **Định dạng file:** PostgreSQL Custom Binary (`-Fc`) nén dung lượng cao (~1.1 MB), hỗ trợ phục hồi từng bảng hoặc toàn bộ DB.

---

## 3. QUY TRÌNH KHÔI PHỤC SẠCH (CLEAN STAGING RESET)

Khi kết thúc một đợt kiểm thử hoặc khi dữ liệu bị xáo trộn do test nhiều kịch bản, thực hiện khôi phục môi trường Staging về trạng thái chuẩn ban đầu.

### Cách 1: Chạy script tự động 1-Click (Khuyến nghị)
```bash
# Có xác nhận an toàn:
./scripts/uat-reset.sh

# Chạy tự động có cờ xác nhận (dành cho CI/CD / Automated UAT runner):
export UAT_ALLOW_DESTRUCTIVE_RESET=YES
./scripts/uat-reset.sh --force
```

### Các bước script tự động thực hiện:
1. **Kiểm tra an toàn (Positive Safety Check):** Xác thực tên DB nằm trong allowlist (`crm_db`, `crm_db_staging`, `crm_db_staging_fresh`), `NODE_ENV != production`, yêu cầu xác nhận `UAT_ALLOW_DESTRUCTIVE_RESET=YES`.
2. **Tạo snapshot an toàn:** Tự động gọi `uat-backup.sh` để lưu vết dữ liệu trước khi xóa. Nếu backup thất bại => Hủy bỏ ngay lập tức.
3. **Ngắt kết nối & Tạo mới DB:** Ngắt các connection đang mở từ Web/API và chạy `DROP DATABASE IF EXISTS crm_db; CREATE DATABASE crm_db;`.
4. **Chạy Migration Runner:** Áp dụng base schema (`crm_order_schema.sql`) và toàn bộ 10 incremental migrations.
5. **Nạp dữ liệu nghiệp vụ chuẩn:** Áp dụng `database/crm_seed.sql` (nạp 9 roles, 75 permissions, danh mục dịch vụ, quy trình mẫu).
6. **Khởi tạo 12 tài khoản Staging:** Chạy script `seed:staging` (tạo 12 tài khoản cho 9 vai trò, thiết lập chức vụ, gán team, cấu hình lương cơ bản).
7. **Làm sạch cache Redis an toàn:** Xóa cache theo đúng namespace CRM (`bull:crm-*`, `session:*`, `user_sessions:*`, `boss_pin_session:*`). Không chạy `FLUSHDB` trừ khi instance Redis được kiểm chứng là dedicated cho UAT.
8. **Kiểm tra tính toàn vẹn:** Truy vấn SQL kiểm tra xác nhận `Orphan users = 0`. Nếu phát hiện orphan > 0 => exit 1 ngay lập tức.

---

## 4. QUY TRÌNH KHÔI PHỤC TỪ MỘT BẢN SNAPSHOT CỤ THỂ (RESTORE SPECIFIC SNAPSHOT)

Nếu muốn đưa hệ thống về đúng thời điểm của một bản snapshot đã lưu trước đó:

### Cách 1: Sử dụng script uat-restore.sh (Khuyến nghị)
```bash
./scripts/uat-restore.sh database/backups/<TÊN_FILE_SNAPSHOT>.dump
```

### Cách 2: Lệnh trực tiếp qua Docker (Stream an toàn qua Stdin)
> **Lưu ý quan trọng:** Snapshot nằm trên máy Host (`database/backups/*.dump`), không giả định file tồn tại cùng đường dẫn bên trong container. Do đó, sử dụng pipe stdin non-TTY hoặc `docker cp`:

```bash
# 1. Ngắt kết nối và tạo database sạch
docker exec -i crm_postgres psql -U postgres -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'crm_db' AND pid <> pg_backend_pid();
  DROP DATABASE IF EXISTS crm_db;
  CREATE DATABASE crm_db;
"

# 2. Phục hồi dữ liệu an toàn bằng cách truyền luồng stdin từ Host vào container
docker exec -i crm_postgres pg_restore -U postgres -d crm_db --clean --if-exists < database/backups/<TÊN_FILE_SNAPSHOT>.dump

# 3. Làm sạch session/cache namespace CRM
docker exec -i crm_redis redis-cli --scan --pattern "bull:crm-*" | xargs -r docker exec -i crm_redis redis-cli del
docker exec -i crm_redis redis-cli --scan --pattern "session:*" | xargs -r docker exec -i crm_redis redis-cli del
docker exec -i crm_redis redis-cli --scan --pattern "user_sessions:*" | xargs -r docker exec -i crm_redis redis-cli del
docker exec -i crm_redis redis-cli --scan --pattern "boss_pin_session:*" | xargs -r docker exec -i crm_redis redis-cli del
```

---

## 5. THÔNG TIN MÔI TRƯỜNG SAU KHI RESET THÀNH CÔNG

Sau khi hoàn tất reset, hệ thống sẵn sàng ngay lập tức với các thông số:

* **URL Web:** `http://localhost:5173`
* **URL Backend API:** `http://localhost:3000`
* **Mật khẩu mặc định cho toàn bộ 12 tài khoản:** `${UAT_DEFAULT_PASSWORD}` *(Được cấp riêng ngoài tài liệu version control)*
* **Mã PIN quản lý bảo mật của BOSS:** `${UAT_BOSS_PIN}` *(Được cấp riêng ngoài tài liệu version control)*

### Danh sách 12 tài khoản theo 9 vai trò:
1. `staging_boss` (BOSS - Ban Giám Đốc)
2. `staging_admin` (ADMIN - Vận Hành Hệ Thống)
3. `staging_accountant` (ACCOUNTANT - Phòng Kế Toán)
4. `staging_sales_leader` (SALES_TEAM_LEADER - Trưởng Nhóm Alpha)
5. `staging_sale` (SALE - Chuyên Viên Sales Team Alpha)
6. `staging_sale_t2` (SALE - Chuyên Viên Sales Team Beta)
7. `staging_dev_leader` (DEV_TEAM_LEADER - Trưởng Nhóm Lập Trình Web)
8. `staging_dev` (DEV - Lập Trình Viên Team Web)
9. `staging_dev_t2` (DEV - Lập Trình Viên Team Mobile)
10. `staging_seo_leader` (SEO_TEAM_LEADER - Trưởng Nhóm Nội Dung & SEO 1)
11. `staging_seo` (SEO - Chuyên Viên Team SEO 1)
12. `staging_seo_t2` (SEO - Chuyên Viên Team SEO 2)

---

## 6. KIỂM TRA NHANH SAU RESET (SMOKE VERIFICATION COMMANDS)

Để kiểm tra nhanh trạng thái sau khi reset:

```bash
# 1. Kiểm tra không còn orphan users
docker exec -i crm_postgres psql -U postgres -d crm_db -c "
  SELECT count(*) as orphan_users_count FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE e.id IS NULL;
"
# Kết quả mong đợi: 0

# 2. Chạy smoke E2E kiểm tra 10 luồng nghiệp vụ
pnpm --filter api test:phase-s-uat
# Kết quả mong đợi: PASS 100%
```
