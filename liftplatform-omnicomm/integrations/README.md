# Адаптеры каналов Omnicomm (раздел 12 / 23 ТЗ)

Самостоятельные сервисы по образцу `wa-gateway` LiftPlatform. Каждый принимает сообщения
из своего канала и пересылает их в CRM через `POST /api/messages` (заголовок `x-channel-secret`).

| Адаптер | Канал | Переменные окружения |
|---|---|---|
| `telegram-bot.ts` | Telegram | `TELEGRAM_TOKEN`, `CRM_URL`, `CHANNEL_SECRET` |
| `email-poller.ts` | Email (IMAP) | `IMAP_HOST/PORT/USER/PASS`, `CRM_URL`, `CHANNEL_SECRET` |

WhatsApp уже реализован в `wa-gateway` базового LiftPlatform.
IP-телефония шлёт вебхуки в `POST /api/telephony` (`x-telephony-secret`).
Power BI читает `GET /api/integrations/powerbi` (`x-bi-secret`).
1С обменивается через `GET/POST /api/integrations/1c` (`x-1c-secret`).

Зависимости: `email-poller` использует `imapflow` (`npm i imapflow`).
