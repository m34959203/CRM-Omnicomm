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

## Постоянный поддомен `crm-omnicomm.technokod.kz`

Туннели technokod — токен-управляемые (ingress настраивается в дашборде Cloudflare),
CF API-токена в окружении нет, поэтому DNS+маршрут добавляется один раз вручную.

**Важно:** docker-туннель `technokod-server` НЕ достаёт до host-`localhost`
(docker-bridge режет), поэтому поддомен вешать на **host-run** туннель — тот, что
запущен бинарём на хосте и уже роутит в `localhost` (как `lift-solana.technokod.kz` → `:3090`).

Шаг (один раз):
1. Cloudflare → **Zero Trust → Networks → Tunnels**.
2. Открыть host-run туннель (Omnicomm-fleet или `lift-solana`) → вкладка **Public Hostname** → **Add**.
3. Subdomain `crm-omnicomm`, Domain `technokod.kz`, Service **HTTP** `localhost:3026`.
4. Save — DNS CNAME создаётся автоматически (proxied). Через ~1 мин:
   `https://crm-omnicomm.technokod.kz` отдаёт лендинг.

Альтернатива (свой выделенный туннель, изоляция проекта):
Create tunnel → name `crm-omnicomm` → скопировать токен → на хосте
`cloudflared tunnel --no-autoupdate run --token <TOKEN>` под flock; затем тот же Public Hostname.
