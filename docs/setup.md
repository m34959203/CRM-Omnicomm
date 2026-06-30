# Setup

## Требования

- Node.js 20+
- PostgreSQL 16
- Доступ к Omnicomm API (логин/пароль)

## Локальный запуск

```bash
cp .env.example .env
# заполни DATABASE_URL, JWT_SECRET, OMNICOMM_*
npm install
npm run dev
```

Приложение: http://localhost:3000.

## Переменные окружения

| Переменная | Назначение |
|---|---|
| `DATABASE_URL` | строка подключения Postgres (на VPS ≤2GB добавь `?connection_limit=5&pool_timeout=10`) |
| `JWT_SECRET` | секрет для подписи сессионных JWT (≥32 байт) |
| `OMNICOMM_API_URL` | базовый URL Omnicomm API |
| `OMNICOMM_LOGIN` / `OMNICOMM_PASSWORD` | креды для синка |
| `OMNICOMM_SYNC_INTERVAL_HOURS` | период инкрементального синка (по умолчанию 3) |

## Troubleshooting

- **Топливо завышено ×10** — Omnicomm отдаёт децилитры, делить на 10.
- **Дерево ТС пустое/странное** — оно вложенное, нужно флэттить.
- **Omnicomm отдаёт 5xx под нагрузкой** — копия деградирует; добавь health-пробу и не долби параллельно.
