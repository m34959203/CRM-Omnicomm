# CRM-Omnicomm — Developer Guide (для Claude Code)

> Этот файл читается Claude Code при работе в репозитории.

## Project Overview

CRM для управления клиентами, договорами и автопарком, который мониторится через телематику Omnicomm. Связывает карточку клиента с закреплёнными ТС и их телеметрией. Смежные репо: `omnicomm-holding-platform` (дашборд автопарка), `Omnicomm Fleet Report` (PPTX/HTML-отчёты).

Развёртывание: VPS / Docker (планируется).

## Tech Stack

- Next.js 16 App Router · React 19 · TypeScript · Tailwind 4
- PostgreSQL 16 (Prisma 5 / raw pg) — `?connection_limit=5&pool_timeout=10` на VPS ≤2GB
- Auth: JWT (jose HS256) в httpOnly cookie + RBAC
- Интеграция: Omnicomm HTTP API

## Architecture conventions

### Auth & RBAC
- В админ-роутах ВСЕГДА `requireRole(["admin", "editor"])` + try/catch AuthError, иначе 500.
- В payload — `user.userId`, НЕ `user.id`.

### Database
- snake_case колонки, UUID PK, TIMESTAMP **WITH TIME ZONE** всегда.

## Omnicomm API — гочи (важно)

- Отчёты запрашиваются через **POST**, не GET.
- Топливо приходит в **децилитрах** → делить на 10.
- Дерево ТС вложенное — **флэттить** перед использованием.
- Трек — GPS-точки; в units встречается баг ×10.
- Копия `projectkap@online.omnicomm.ru` хрупкая под нагрузкой: **health-проба перед забором**, не долбить параллельно.

## Conventions

- Commits: Conventional Commits на русском (`feat:`, `fix:`, `docs:`, `chore:`). См. CONTRIBUTING.md.
- Не коммитить `.env*`, секреты, бинарные архивы.
