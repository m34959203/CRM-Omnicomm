# Деплой CRM-Omnicomm

## Что уже работает на сервере

- **API + UI:** `node crm-backend/src/server.js`, порт **3026** (`/home/ubuntu/logs/crm-omnicomm.port`).
- **Durable:** `deploy/run.sh` под `cron + flock` (каждые 3 мин + `@reboot`) — поднимает упавший процесс и туннель.
- **Публичный URL (квази-эфемерный):** `cloudflared tunnel --url http://localhost:3026`, ссылка пишется в `/home/ubuntu/logs/crm-omnicomm.url`.
- **Логи:** `/home/ubuntu/logs/crm-omnicomm.log` (app), `crm-omnicomm-cf.log` (туннель).

Перезапуск вручную:
```bash
flock -n /tmp/crm_omnicomm.lock /home/ubuntu/CRM-Omnicomm/deploy/run.sh
```

## Постоянный поддомен `crm-omnicomm.technokod.kz` — ПОДНЯТ ✅

Выделенный именованный host-run туннель (изоляция проекта), `cloudflared` бинарём на хосте.

- **Tunnel:** `crm-omnicomm`, id `28e49d19-a828-498e-92e0-7b6fea4aad08`
- **Origin-cert:** `~/.cloudflared/cert.pem` (выдан `cloudflared tunnel login` для зоны technokod.kz)
- **Креды туннеля:** `~/.cloudflared/28e49d19-….json`
- **Конфиг:** `~/.cloudflared/config-crm-omnicomm.yml` (ingress `crm-omnicomm.technokod.kz` → `http://localhost:3026`)
- **DNS:** CNAME `crm-omnicomm.technokod.kz` → `28e49d19-….cfargotunnel.com` (создан `cloudflared tunnel route dns`)
- **Durable:** держится `deploy/run.sh` под cron (поднимет, если упадёт).

Запуск/перезапуск вручную:
```bash
flock -n /tmp/crm_omnicomm.lock /home/ubuntu/CRM-Omnicomm/deploy/run.sh
```

### Гочи (важно)
- **`--protocol http2` обязателен:** дефолтный QUIC за этим провайдером отваливает датаграммы
  («accept stream listener failure» → туннель выходит).
- **`--no-prechecks` обязателен:** стартовый precheck хардфейлит из-за недоступного region2
  (region1 fra/ala подключается нормально) и роняет процесс в фоне.
- **pkill self-kill:** НЕ делать `pkill -f "config-crm-omnicomm.yml"` в inline-команде —
  паттерн совпадает с argv самого шелла (bash -c …) и убивает его (exit 144), cloudflared не стартует.
  В `run.sh` (файл-скрипт) `pgrep -f` безопасен: в argv только путь скрипта.

### Воссоздать с нуля (если нужно)
```bash
cloudflared tunnel login                       # браузер-авторизация зоны technokod.kz → cert.pem
cloudflared tunnel create crm-omnicomm
cloudflared tunnel route dns crm-omnicomm crm-omnicomm.technokod.kz
# config-crm-omnicomm.yml с ingress → localhost:3026, затем run.sh
```
