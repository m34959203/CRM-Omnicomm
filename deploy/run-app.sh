#!/usr/bin/env bash
# Durable-раннер НОВОГО приложения (app/, Next.js 16 + PG) на :3027.
# Работает ПАРАЛЛЕЛЬНО легаси (:3026). Cutover домена — отдельное решение:
# после него в config-crm-omnicomm.yml сервис меняется на localhost:3027,
# легаси-раннер убирается из cron. До cutover приложение доступно только локально.
# Cron (пример): */2 * * * * flock -n /tmp/crm-omnicomm-app.lock /home/ubuntu/CRM-Omnicomm/deploy/run-app.sh
set -euo pipefail

ROOT="/home/ubuntu/CRM-Omnicomm"
APP="$ROOT/app"
LOGDIR="/home/ubuntu/logs"
PORT="${APP_PORT:-3027}"
mkdir -p "$LOGDIR"

# --- PostgreSQL (выделенный контейнер) ---
if ! docker exec crm-omnicomm-postgres pg_isready -U crm >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] (re)start postgres container" >> "$LOGDIR/crm-omnicomm-app.log"
  docker start crm-omnicomm-postgres >/dev/null 2>&1 || true
  sleep 3
fi

# --- Next.js standalone ---
if ! curl -sf "http://localhost:$PORT/login" >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] (re)start next on :$PORT" >> "$LOGDIR/crm-omnicomm-app.log"
  pkill -f "next start -p $PORT" 2>/dev/null || true
  pkill -f "next-server.*$PORT" 2>/dev/null || true
  cd "$APP"
  # Собранный build обязателен: деплой = git pull && npm ci && npm run build && этот скрипт.
  if [ ! -d .next ]; then
    echo "[$(date '+%F %T')] НЕТ .next — сначала npm run build" >> "$LOGDIR/crm-omnicomm-app.log"
    exit 1
  fi
  nohup npm run start >> "$LOGDIR/crm-omnicomm-app.log" 2>&1 &
  echo "$PORT" > "$LOGDIR/crm-omnicomm-app.port"
fi

# --- Выделенный именованный CF-туннель → crm-app.technokod.kz ---
# protocol http2 + no-prechecks: см. гочи в deploy/DEPLOY.md.
CF_CFG="/home/ubuntu/.cloudflared/config-crm-omnicomm-app.yml"
if ! pgrep -f "config-crm-omnicomm-app.yml" >/dev/null 2>&1; then
  echo "[$(date '+%F %T')] (re)start cloudflared crm-omnicomm-app" >> "$LOGDIR/crm-omnicomm-app-cf.log"
  setsid /home/ubuntu/bin/cloudflared --no-autoupdate --no-prechecks --protocol http2 tunnel \
    --config "$CF_CFG" run crm-omnicomm-app >> "$LOGDIR/crm-omnicomm-app-cf.log" 2>&1 < /dev/null &
fi
echo "crm-app.technokod.kz" > "$LOGDIR/crm-omnicomm-app.url"

# --- Cron-джобы приложения (биллинг/автоблокировка/уведомления) ---
# Дёргаются отдельными cron-строками, ключ в app/.env (CRON_KEY):
#   0 6 1 * *  curl -s -X POST -H "X-Cron-Key: $KEY" localhost:3027/api/jobs/billing -d '{"kind":"advance_invoice"}'
#   0 6 28-31 * * ... {"kind":"act"} (в последний день месяца — проверка в самом джобе)
#   */30 * * * * curl -s -X POST -H "X-Cron-Key: $KEY" localhost:3027/api/jobs/auto-block
#   */5 * * * *  curl -s -X POST -H "X-Cron-Key: $KEY" localhost:3027/api/jobs/notify
