#!/usr/bin/env bash
# Durable-раннер CRM-Omnicomm: API+UI на $PORT + публичный трудно-эфемерный CF-туннель.
# Запускается из cron под flock, чтобы держать ровно один экземпляр.
set -euo pipefail

ROOT="/home/ubuntu/CRM-Omnicomm"
BACKEND="$ROOT/crm-backend"
LOGDIR="/home/ubuntu/logs"
PORT="${PORT:-3026}"
mkdir -p "$LOGDIR"

# --- API + UI ---
if ! curl -sf "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] (re)start node on :$PORT" >> "$LOGDIR/crm-omnicomm.log"
  pkill -f "node .*crm-backend/src/server.js" 2>/dev/null || true
  cd "$BACKEND"
  PORT="$PORT" nohup node src/server.js >> "$LOGDIR/crm-omnicomm.log" 2>&1 &
  echo "$PORT" > "$LOGDIR/crm-omnicomm.port"
fi

# --- Публичный CF quick-туннель (ссылка квази-эфемерна, хранится в .url) ---
if ! pgrep -f "cloudflared tunnel --url http://localhost:$PORT" >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] (re)start cloudflared for :$PORT" >> "$LOGDIR/crm-omnicomm-cf.log"
  nohup /home/ubuntu/bin/cloudflared tunnel --url "http://localhost:$PORT" \
    >> "$LOGDIR/crm-omnicomm-cf.log" 2>&1 &
  sleep 8
  grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOGDIR/crm-omnicomm-cf.log" \
    | tail -1 > "$LOGDIR/crm-omnicomm.url" || true
fi
