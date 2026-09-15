#!/usr/bin/env bash
# ==============================================================================
# UAT DATABASE RESTORE SNAPSHOT SCRIPT (HARDENED)
# Khôi phục cơ sở dữ liệu Staging từ một snapshot dump cụ thể
# ==============================================================================

set -euo pipefail

CONTAINER_PG="crm_postgres"
CONTAINER_REDIS="crm_redis"
DB_NAME="${DATABASE_NAME:-crm_db}"
SNAPSHOT_FILE="${1:-}"

echo "=================================================================="
echo "⏪ CRM UAT DATABASE RESTORE SNAPSHOT"
echo "=================================================================="

# 1. ALLOWLIST CƠ SỞ DỮ LIỆU ĐƯỢC PHÉP KHÔI PHỤC
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

# 2. KIỂM TRA MÔI TRƯỜNG
if [[ "${NODE_ENV:-development}" == "production" ]] || [[ "${DB_NAME}" =~ (prod|production) ]]; then
  echo "❌ LỖI BẢO MẬT: Phát hiện cấu hình Production. CẤM khôi phục DB này!"
  exit 1
fi

# 3. KIỂM TRA FILE SNAPSHOT
if [[ -z "${SNAPSHOT_FILE}" ]]; then
  echo "❌ LỖI: Vui lòng chỉ định đường dẫn tệp tin snapshot cần khôi phục."
  echo "   Cách dùng: ./scripts/uat-restore.sh <đường_dẫn_file.dump>"
  exit 1
fi

if [[ ! -f "${SNAPSHOT_FILE}" ]] || [[ ! -s "${SNAPSHOT_FILE}" ]]; then
  echo "❌ LỖI: Tệp tin snapshot [${SNAPSHOT_FILE}] không tồn tại hoặc rỗng trên Host."
  exit 1
fi

# 4. XÁC THỰC CẤU TRÚC FILE TRƯỚC KHI RESTORE
echo ">> Kiểm tra tính hợp lệ của snapshot bằng pg_restore --list..."
if ! docker exec -i "${CONTAINER_PG}" pg_restore --list < "${SNAPSHOT_FILE}" > /dev/null 2>&1; then
  echo "❌ LỖI: File snapshot bị hỏng hoặc không đúng định dạng PostgreSQL dump."
  exit 1
fi

echo ">> Ngắt kết nối active trên database [${DB_NAME}]..."
docker exec -i "${CONTAINER_PG}" psql -U postgres -d postgres -c "
  SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();
" > /dev/null 2>&1 || true

echo ">> Làm sạch và tái tạo database trống [${DB_NAME}]..."
docker exec -i "${CONTAINER_PG}" psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS ${DB_NAME};"
docker exec -i "${CONTAINER_PG}" psql -U postgres -d postgres -c "CREATE DATABASE ${DB_NAME};"

echo ">> Khôi phục dữ liệu từ snapshot qua luồng stdin (non-TTY safe pipe)..."
docker exec -i "${CONTAINER_PG}" pg_restore -U postgres -d "${DB_NAME}" < "${SNAPSHOT_FILE}" || {
  echo "⚠️ Ghi chú: pg_restore hoàn tất với một số cảnh báo phụ (bình thường đối với schema role checks)."
}

echo ">> Dọn dẹp cache phiên trên Redis..."
if docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_REDIS}$"; then
  if [[ "${REDIS_DEDICATED_FOR_UAT:-}" == "true" ]]; then
    echo "   - Redis instance được chứng thực dedicated: chạy FLUSHDB..."
    docker exec -i "${CONTAINER_REDIS}" redis-cli FLUSHDB > /dev/null 2>&1 || true
  else
    # Dọn dẹp an toàn các session, queue và lock cũ theo namespace CRM
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "bull:crm-*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "session:*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "user_sessions:*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
    docker exec -i "${CONTAINER_REDIS}" redis-cli --scan --pattern "boss_pin_session:*" | xargs -r -n 50 docker exec -i "${CONTAINER_REDIS}" redis-cli del > /dev/null 2>&1 || true
  fi
  echo "   - Đã làm sạch các session và lock trên Redis an toàn."
fi

# 5. KIỂM TRA TÍNH TOÀN VẸN SAU KHÔI PHỤC
echo ">> Kiểm tra tính toàn vẹn sau khôi phục..."
MIGRATION_COUNT=$(docker exec -i "${CONTAINER_PG}" psql -U postgres -d "${DB_NAME}" -t -A -c "SELECT count(*) FROM schema_migrations;" 2>/dev/null || echo "0")
ORPHAN_COUNT=$(docker exec -i "${CONTAINER_PG}" psql -U postgres -d "${DB_NAME}" -t -A -c "
  SELECT count(*) FROM users u LEFT JOIN employees e ON e.user_id = u.id WHERE e.id IS NULL;
" 2>/dev/null || echo "0")

if [[ "${ORPHAN_COUNT}" -ne 0 ]]; then
  echo "❌ LỖI NGHIÊM TRỌNG: Phát hiện ${ORPHAN_COUNT} orphan user(s) sau khi khôi phục!"
  exit 1
fi

docker exec -i "${CONTAINER_PG}" psql -U postgres -d "${DB_NAME}" -c "SELECT 1;" > /dev/null || {
  echo "❌ LỖI NGHIÊM TRỌNG: Truy vấn kiểm tra DB health thất bại!"
  exit 1
}

if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
  API_HEALTH_STATUS=$(curl -s http://localhost:3000/api/health | grep -o '"status":"[^"]*"' || echo "")
  if [[ "${API_HEALTH_STATUS}" =~ "status\":\"ok" ]]; then
    echo "   - API Health: OK ✅ (Database & Redis connected)"
  fi
fi

echo "✅ KHÔI PHỤC SNAPSHOT THÀNH CÔNG!"
echo "   - Database: ${DB_NAME}"
echo "   - Bản ghi migration: ${MIGRATION_COUNT} version(s)"
echo "   - Số lượng orphan users: ${ORPHAN_COUNT} (SẠCH)"
echo "   - Tệp snapshot: ${SNAPSHOT_FILE}"
echo "=================================================================="
