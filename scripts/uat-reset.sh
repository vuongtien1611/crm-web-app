#!/usr/bin/env bash
# ==============================================================================
# UAT DATABASE CLEAN RESET PROCEDURE SCRIPT (HARDENED)
# Khôi phục cơ sở dữ liệu Staging về trạng thái chuẩn sạch cho đợt UAT mới
# ==============================================================================

set -euo pipefail

CONTAINER_PG="crm_postgres"
CONTAINER_REDIS="crm_redis"
DB_NAME="${DATABASE_NAME:-crm_db}"
FORCE="${1:-}"

echo "=================================================================="
echo "🔄 CRM STAGING UAT DATABASE CLEAN RESET (HARDENED)"
echo "=================================================================="

# 1. ALLOWLIST CƠ SỞ DỮ LIỆU ĐƯỢC PHÉP RESET (POSITIVE SAFETY CHECK)
ALLOWED_DBS=("crm_db" "crm_db_staging" "crm_db_staging_fresh")
is_allowed=0
for allowed in "${ALLOWED_DBS[@]}"; do
  if [[ "${DB_NAME}" == "${allowed}" ]]; then
    is_allowed=1
    break
  fi
done

if [[ ${is_allowed} -eq 0 ]]; then
  echo "❌ LỖI BẢO MẬT: DB_NAME '${DB_NAME}' không nằm trong allowlist an toàn: [${ALLOWED_DBS[*]}]"
  exit 1
fi

# 2. BẢO VỆ PRODUCTION TUYỆT ĐỐI
if [[ "${NODE_ENV:-development}" == "production" ]] || [[ "${DB_NAME}" =~ (prod|production) ]]; then
  echo "❌ LỖI BẢO MẬT: Phát hiện cấu hình Production. CẤM reset cơ sở dữ liệu Production!"
  exit 1
fi

# 3. YÊU CẦU XÁC NHẬN RÕ RÀNG (POSITIVE SAFETY CHECK)
if [[ "${UAT_ALLOW_DESTRUCTIVE_RESET:-}" != "YES" ]]; then
  echo "❌ LỖI BẢO MẬT: Thao tác destructive reset yêu cầu cờ an toàn UAT_ALLOW_DESTRUCTIVE_RESET=YES."
  echo "   Vui lòng thực hiện:"
  echo "     export UAT_ALLOW_DESTRUCTIVE_RESET=YES"
  echo "     ./scripts/uat-reset.sh"
  exit 1
fi

# 4. BẮT BUỘC SAO LƯU SNAPSHOT THÀNH CÔNG TRƯỚC KHI XÓA
echo ">> 1. Chạy sao lưu snapshot an toàn trước khi xóa..."
if [[ ! -f "./scripts/uat-backup.sh" ]]; then
  echo "❌ LỖI NGHIÊM TRỌNG: Không tìm thấy script ./scripts/uat-backup.sh. HỦY BỎ RESET ĐỂ BẢO VỆ DỮ LIỆU!"
  exit 1
fi

DATABASE_NAME="${DB_NAME}" bash ./scripts/uat-backup.sh || {
  echo "❌ LỖI NGHIÊM TRỌNG: Sao lưu snapshot thất bại. HỦY BỎ RESET ĐỂ TRÁNH MẤT DỮ LIỆU!"
  exit 1
}

# 5. NGẮT KẾT NỐI VÀ TÁI TẠO CƠ SỞ DỮ LIỆU
echo ">> 2. Ngắt các kết nối active và Re-create Database [${DB_NAME}]..."
docker exec -i "${CONTAINER_PG}" psql -U postgres -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" > /dev/null 2>&1 || true

docker exec -i "${CONTAINER_PG}" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};" || {
  echo "❌ LỖI: Không thể drop database [${DB_NAME}]."
  exit 1
}

docker exec -i "${CONTAINER_PG}" psql -U postgres -d postgres -c "CREATE DATABASE ${DB_NAME};" || {
  echo "❌ LỖI: Không thể create database [${DB_NAME}]."
  exit 1
}

# 6. CHẠY MIGRATIONS
echo ">> 3. Chạy Migration Runner từ Base Schema + 10 Incremental Migrations..."
DATABASE_NAME="${DB_NAME}" pnpm --filter api db:migrate || {
  echo "❌ LỖI NGHIÊM TRỌNG: Migration thất bại!"
  exit 1
}

# 7. NẠP DỮ LIỆU NỀN TẢNG NGHIỆP VỤ
echo ">> 4. Nạp dữ liệu nền tảng nghiệp vụ (crm_seed.sql)..."
docker exec -i "${CONTAINER_PG}" psql -U postgres -d "${DB_NAME}" -f /database/crm_seed.sql > /dev/null || {
  echo "❌ LỖI NGHIÊM TRỌNG: Nạp crm_seed.sql thất bại!"
  exit 1
}

# 8. KHỞI TẠO 12 TÀI KHOẢN STAGING
echo ">> 5. Khởi tạo 12 tài khoản Staging chuẩn cho 9 vai trò (seed:staging)..."
DATABASE_NAME="${DB_NAME}" pnpm --filter api seed:staging || {
  echo "❌ LỖI NGHIÊM TRỌNG: Khởi tạo tài khoản staging thất bại!"
  exit 1
}

# 9. DỌN DẸP CACHE REDIS AN TOÀN
echo ">> 6. Dọn dẹp cache Redis..."
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_REDIS}$"; then
  if [[ "${REDIS_DEDICATED_FOR_UAT:-}" == "true" ]]; then
    echo "   - Redis instance được chứng thực dedicated: chạy FLUSHDB..."
    docker exec -i "${CONTAINER_REDIS}" redis-cli FLUSHDB > /dev/null 2>&1 || true
  else
    echo "   - Redis chế độ an toàn: làm sạch theo scoped namespace CRM (bull:crm-*, session:*, user_sessions:*, boss_pin_session:*)..."
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "bull:crm-*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "session:*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "user_sessions:*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "boss_pin_session:*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
  fi
  echo "   - Đã làm sạch cache Redis an toàn."
fi

# 10. KIỂM TRA TÍNH TOÀN VẸN (ZERO ORPHANS VERIFICATION)
echo ">> 7. Kiểm tra tính toàn vẹn (Zero Orphan Users Verification)..."
ORPHAN_COUNT=$(docker exec -i "${CONTAINER_PG}" psql -U postgres -d "${DB_NAME}" -t -A -c "
  SELECT count(*) FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE e.id IS NULL;
")

if [[ "${ORPHAN_COUNT}" -ne 0 ]]; then
  echo "❌ LỖI NGHIÊM TRỌNG: Phát hiện ${ORPHAN_COUNT} orphan user(s) trong database! Dừng khẩn cấp."
  exit 1
fi
echo "   - Xác nhận: Orphan users = 0 ✅ (Không có tài khoản rác)."

# 11. KIỂM TRA HEALTH VERIFICATION
echo ">> 8. Kiểm tra Health (Database & API)..."
docker exec -i "${CONTAINER_PG}" psql -U postgres -d "${DB_NAME}" -c "SELECT 1;" > /dev/null || {
  echo "❌ LỖI NGHIÊM TRỌNG: Truy vấn kiểm tra DB health thất bại!"
  exit 1
}

if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  API_HEALTH_STATUS=$(curl -s http://localhost:3000/api/health | grep -o '"status":"[^"]*"' || echo "")
  if [[ "${API_HEALTH_STATUS}" =~ "status\":\"ok" ]]; then
    echo "   - API Health: OK ✅ (Database & Redis connected)"
  else
    echo "❌ LỖI NGHIÊM TRỌNG: API Health báo lỗi: ${API_HEALTH_STATUS}"
    exit 1
  fi
else
  echo "   - DB Health: OK ✅"
fi

echo ""
echo "=================================================================="
echo "🎉 MÔI TRƯỜNG STAGING ĐÃ ĐƯỢC RESET VỀ TRẠNG THÁI CHUẨN SẠCH!"
echo "   - Database: ${DB_NAME}"
echo "   - Số tài khoản sẵn sàng: 12 tài khoản cho 9 vai trò"
echo "   - Mật khẩu đăng nhập mặc định: \${UAT_DEFAULT_PASSWORD}"
echo "   - Mã PIN quản lý BOSS: \${UAT_BOSS_PIN}"
echo "   - Sẵn sàng bàn giao cho đợt kiểm thử Human UAT tiếp theo."
echo "=================================================================="
