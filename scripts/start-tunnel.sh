#!/usr/bin/env bash
set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

LOG_DIR="$PROJECT_ROOT/.logs"
mkdir -p "$LOG_DIR"

API_LOG="$LOG_DIR/api.log"
WEB_LOG="$LOG_DIR/web.log"
TUNNEL_LOG="$LOG_DIR/tunnel.log"
PID_FILE="$LOG_DIR/tunnel_pids.env"

IS_DAEMON=0
if [ "$1" == "--daemon" ] || [ "$1" == "-d" ]; then
  IS_DAEMON=1
fi

echo "=========================================================="
echo "🚀 KHỞI ĐỘNG HỆ THỐNG CRM & CLOUDFLARE TUNNEL"
echo "=========================================================="

# 1. Kiểm tra Docker containers cho PostgreSQL & Redis
echo "📦 [1/4] Kiểm tra PostgreSQL và Redis containers..."
docker compose up -d postgres redis > /dev/null 2>&1

# Chờ postgres sẵn sàng
echo "⏳ Đang kiểm tra kết nối Database..."
RETRIES=10
until docker compose exec -T postgres pg_isready -U postgres -d crm_db > /dev/null 2>&1 || [ $RETRIES -eq 0 ]; do
  sleep 1
  RETRIES=$((RETRIES - 1))
done

if [ $RETRIES -eq 0 ]; then
  echo "❌ Lỗi: PostgreSQL container không sẵn sàng!"
  exit 1
fi
echo "✅ Database & Redis đã sẵn sàng."

# 2. Dọn dẹp tiến trình cũ nếu còn đang chiếm port 3000 hoặc 5173
cleanup_port() {
  local port=$1
  local pids=$(lsof -ti :$port 2>/dev/null || true)
  if [ -n "$pids" ]; then
    echo "⚠️  Phát hiện tiến trình đang chiếm port :$port (PID: $pids), đang giải phóng..."
    kill -9 $pids 2>/dev/null || true
    sleep 1
  fi
}

# Dọn dẹp cloudflared cũ nếu có
pkill -f "cloudflared tunnel --url" 2>/dev/null || true

cleanup_port 3000
cleanup_port 5173

# Hàm dừng dịch vụ khi chạy ở chế độ foreground
cleanup_foreground() {
  echo ""
  echo "🛑 Đang dừng toàn bộ dịch vụ..."
  [ -n "$TUNNEL_PID" ] && kill $TUNNEL_PID 2>/dev/null || true
  [ -n "$WEB_PID" ] && kill $WEB_PID 2>/dev/null || true
  [ -n "$API_PID" ] && kill $API_PID 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "✅ Đã giải phóng toàn bộ tiến trình."
  exit 0
}

if [ $IS_DAEMON -eq 0 ]; then
  trap cleanup_foreground SIGINT SIGTERM
fi

# 3. Khởi động Backend Fastify API (port 3000)
echo "⚡ [2/4] Đang khởi động Fastify API trên port 3000..."
pnpm --filter api dev > "$API_LOG" 2>&1 &
API_PID=$!

# Chờ API sẵn sàng
echo "⏳ Đang chờ API khởi động..."
API_READY=0
for i in {1..30}; do
  if curl -s http://127.0.0.1:3000/api/health > /dev/null 2>&1; then
    API_READY=1
    break
  fi
  sleep 1
done

if [ $API_READY -eq 0 ]; then
  echo "❌ API không khởi động kịp sau 30s. Xem log tại: $API_LOG"
  tail -n 20 "$API_LOG"
  exit 1
fi
echo "✅ API đã chạy thành công tại http://127.0.0.1:3000"

# 4. Khởi động Frontend Vite Web (port 5173)
echo "🌐 [3/4] Đang khởi động Vite Web trên port 5173..."
pnpm --filter web dev > "$WEB_LOG" 2>&1 &
WEB_PID=$!

WEB_READY=0
for i in {1..20}; do
  if curl -s http://127.0.0.1:5173 > /dev/null 2>&1; then
    WEB_READY=1
    break
  fi
  sleep 1
done

if [ $WEB_READY -eq 0 ]; then
  echo "❌ Web không khởi động kịp sau 20s. Xem log tại: $WEB_LOG"
  tail -n 20 "$WEB_LOG"
  exit 1
fi
echo "✅ Frontend Web đã chạy thành công tại http://127.0.0.1:5173"

# 5. Khởi động Cloudflare Tunnel
echo "🚇 [4/4] Đang thiết lập Cloudflare Tunnel..."
rm -f "$TUNNEL_LOG"
cloudflared tunnel --url http://localhost:5173 > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Lưu PID lại để quản lý
cat <<EOF > "$PID_FILE"
API_PID=$API_PID
WEB_PID=$WEB_PID
TUNNEL_PID=$TUNNEL_PID
EOF

echo "⏳ Đang kết nối tới mạng Cloudflare và tạo URL public..."
TUNNEL_URL=""
for i in {1..30}; do
  if [ -f "$TUNNEL_LOG" ]; then
    TUNNEL_URL=$(grep -oE 'https://[a-zA-Z0-9-]+\.trycloudflare\.com' "$TUNNEL_LOG" | head -n 1 || true)
    if [ -n "$TUNNEL_URL" ]; then
      break
    fi
  fi
  sleep 1
done

if [ -z "$TUNNEL_URL" ]; then
  echo "⚠️  Chưa trích xuất được URL tự động sau 30s. Xem log cloudflared:"
  cat "$TUNNEL_LOG"
else
  echo ""
  echo "🎉 =========================================================="
  echo "🌐 DỰ ÁN ĐÃ ĐƯỢC PUBLIC THÀNH CÔNG LÊN CLOUDFLARE TUNNEL!"
  echo "🔗 PUBLIC URL: $TUNNEL_URL"
  echo "=========================================================="
  echo ""
  echo "📋 Tài khoản kiểm thử Staging:"
  echo "  - Mật khẩu chung:       Staging@2026Pass!"
  echo "  - Boss:                 staging_boss"
  echo "  - Admin:                staging_admin"
  echo "  - Kế toán:              staging_accountant"
  echo "  - Trưởng nhóm Sale:     staging_sales_leader"
  echo "  - Nhân viên Sale:       staging_sale"
  echo "  - Trưởng nhóm Dev:      staging_dev_leader"
  echo "  - Dev:                  staging_dev"
  echo ""
  echo "📁 Log chi tiết:"
  echo "  - API:    $API_LOG"
  echo "  - Web:    $WEB_LOG"
  echo "  - Tunnel: $TUNNEL_LOG"
  echo "=========================================================="
fi

if [ $IS_DAEMON -eq 1 ]; then
  echo "🚀 Hệ thống đang chạy nền (Daemon mode)."
  echo "👉 Để dừng toàn bộ hệ thống, chạy: bash scripts/stop-tunnel.sh"
  exit 0
else
  echo "Nhấn Ctrl+C để dừng hệ thống và đóng tunnel."
  wait $TUNNEL_PID
fi
