# Setup

## Требования

- Node.js 20+ (на сервере — 24)
- Docker (PostgreSQL 16 в выделенном контейнере)
- Доступ к Omnicomm Online API (логин/пароль) — для этапа 1+

## Локальный запуск (app/ — основная разработка)

```bash
# 1. БД (отдельный контейнер проекта, порт 5445 — не трогаем контейнеры других проектов)
docker start crm-omnicomm-postgres 2>/dev/null || docker run -d --name crm-omnicomm-postgres \
  -e POSTGRES_USER=crm -e POSTGRES_PASSWORD=crm -e POSTGRES_DB=crm_omnicomm \
  -p 5445:5432 --restart unless-stopped postgres:16-alpine

# 2. Приложение
cd app
cp .env.example .env    # заполни JWT_SECRET (≥32 байт)
npm install
npm run db:migrate      # миграции из app/db/migrations/
npm run db:seed         # роли, демо-пользователи, справочники (операторы SIM РК, НДС)
npm run dev             # http://localhost:3027
```

## Переменные окружения (app/.env)

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | `postgres://crm:crm@localhost:5445/crm_omnicomm` (на VPS ≤2GB — `?connection_limit=5&pool_timeout=10`) |
| `JWT_SECRET` | секрет подписи сессионных JWT (≥32 байт) |
| `APP_URL` | базовый URL (вшивается в sitemap/ссылки при build — смена домена требует ребилда) |
| `OMNICOMM_API_URL` | базовый URL Omnicomm Online API (этап 1) |
| `OMNICOMM_LOGIN` / `OMNICOMM_PASSWORD` | креды для синка (этап 1) |
| `SMTP_*` | рассылка расчётных документов (этап 2) |

## Легаси (crm-backend — текущий прод :3026)

```bash
cd crm-backend && npm install && npm run seed && npm start   # SQLite, локально :3000
npm run smoke   # 28 сквозных проверок
```

Живёт до cutover на app/; данные переносятся скриптом `app/scripts/migrate-from-sqlite.ts`.

## Troubleshooting

- **Топливо завышено ×10** — Omnicomm отдаёт децилитры, делить на 10.
- **Дерево ТС пустое/странное** — оно вложенное, нужно флэттить.
- **Omnicomm отдаёт 5xx под нагрузкой** — копия деградирует; health-проба, не долбить параллельно.
- **Порт 5432 занят** — это PG других проектов; наш контейнер на 5445, не трогать чужие.
