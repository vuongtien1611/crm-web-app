#!/usr/bin/env bash
# ==============================================================================
# UAT DATABASE BACKUP SNAPSHOT SCRIPT (HARDENED)
# Tự động sao lưu snapshot cơ sở dữ liệu môi trường Staging trước đợt UAT
# ==============================================================================

set -euo pipefail

BACKUP_DIR="$(pwd)/database/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
CONTAINER_NAME="crm_postgres"
DB_NAME="${DATABASE_NAME:-crm_db}"
BACKUP_FILE="${BACKUP_DIR}/staging_uat_snapshot_${TIMESTAMP}.dump"

# 1. ALLOWLIST CƠ SỞ DỮ LIỆU ĐƯỢC PHÉP SAO LƯU (POSITIVE SAFETY CHECK)
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

# 2. KIỂM TRA MÔI TRƯỜNG: Tuyệt đối không chạy trên Production
if [[ "${NODE_ENV:-development}" == "production" ]] || [[ "${DB_NAME}" =~ (prod|production) ]]; then
  echo "❌ LỖI BẢO MẬT: Phát hiện cấu hình Production. CẤM sao lưu qua script này!"
  exit 1
fi

echo "=================================================================="
echo "📦 CRM UAT DATABASE SNAPSHOT BACKUP"
echo "=================================================================="
echo ">> Kiểm tra container [${CONTAINER_NAME}]..."

if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "❌ LỖI: Container [${CONTAINER_NAME}] không hoạt động."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo ">> Xuất snapshot nhị phân an toàn (non-TTY, không dùng -t) cho [${DB_NAME}]..."
# QUAN TRỌNG: Dùng docker exec -i (KHÔNG DÙNG -t để tránh hỏng nhị phân do CRLF)
docker exec -i "${CONTAINER_NAME}" pg_dump -U postgres -Fc "${DB_NAME}" > "${BACKUP_FILE}"

# 3. KIỂM TRA TÍNH TOÀN VẸN CỦA FILE DUMP BẰNG PG_RESTORE
if [[ ! -s "${BACKUP_FILE}" ]]; then
  echo "❌ LỖI: Tệp tin snapshot rỗng hoặc không tạo được."
  rm -f "${BACKUP_FILE}"
  exit 1
fi

echo ">> Kiểm tra cấu trúc snapshot (pg_restore --list)..."
if ! docker exec -i "${CONTAINER_NAME}" pg_restore --list < "${BACKUP_FILE}" > /dev/null 2>&1; then
  echo "❌ LỖI: Snapshot bị lỗi hoặc không thể đọc được bởi pg_restore!"
  rm -f "${BACKUP_FILE}"
  exit 1
fi

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "✅ SNAPSHOT SAO LƯU THÀNH CÔNG VÀ ĐÃ XÁC THỰC CẤU TRÚC!"
echo "   - Đường dẫn: ${BACKUP_FILE}"
echo "   - Dung lượng: ${FILE_SIZE}"
echo "   - Database: ${DB_NAME}"
echo "   - Thời gian: $(date '+%d/%m/%Y %H:%M:%S')"
echo "=================================================================="
