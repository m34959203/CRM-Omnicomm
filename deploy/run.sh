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

# --- Выделенный именованный CF-туннель → crm-omnicomm.technokod.kz ---
# protocol http2: QUIC-датаграммы за этим провайдером отваливаются.
CF_CFG="/home/ubuntu/.cloudflared/config-crm-omnicomm.yml"
if ! pgrep -f "config-crm-omnicomm.yml" >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] (re)start cloudflared crm-omnicomm" >> "$LOGDIR/crm-omnicomm-cf.log"
  setsid /home/ubuntu/bin/cloudflared --no-autoupdate --no-prechecks --protocol http2 tunnel \
    --config "$CF_CFG" run crm-omnicomm >> "$LOGDIR/crm-omnicomm-cf.log" 2>&1 < /dev/null &
fi
echo "crm-omnicomm.technokod.kz" > "$LOGDIR/crm-omnicomm.url"
