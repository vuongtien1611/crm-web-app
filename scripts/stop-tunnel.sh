#!/usr/bin/env bash

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PID_FILE="$PROJECT_ROOT/.logs/tunnel_pids.env"

echo "🛑 Đang dừng các tiến trình CRM và Cloudflare Tunnel..."

if [ -f "$PID_FILE" ]; then
  source "$PID_FILE"
  [ -n "$TUNNEL_PID" ] && kill -9 $TUNNEL_PID 2>/dev/null && echo "  - Đã dừng Cloudflare Tunnel (PID: $TUNNEL_PID)"
  [ -n "$WEB_PID" ] && kill -9 $WEB_PID 2>/dev/null && echo "  - Đã dừng Vite Web (PID: $WEB_PID)"
  [ -n "$API_PID" ] && kill -9 $API_PID 2>/dev/null && echo "  - Đã dừng Fastify API (PID: $API_PID)"
  rm -f "$PID_FILE"
fi

# Dọn dẹp bổ sung theo cổng và tên tiến trình
pkill -f "cloudflared tunnel --url" 2>/dev/null || true
lsof -ti :3000 | xargs -r kill -9 2>/dev/null || true
lsof -ti :5173 | xargs -r kill -9 2>/dev/null || true

echo "✅ Đã dừng toàn bộ dịch vụ CRM và đóng Cloudflare Tunnel thành công."
