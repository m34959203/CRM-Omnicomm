# CRM-Omnicomm — Developer Guide (для Claude Code)

> Этот файл читается Claude Code при работе в репозитории.

## Project Overview

CRM дилера мониторинга транспорта (Omnicomm Alliance KZ) — полноценный аналог 1С-решения
«Аскан: Мониторинг транспорта»: клиенты/договоры → оборудование и SIM → сервисный контур
(заявка → заказ-наряд → акт ТО) → абонентский биллинг → интеграция с Omnicomm Online
(объекты, телеметрия, автоблокировка должников). РК-локализация: НДС 16%, АВР Р-1,
двуязычие RU/KK. Смежные репо: `omnicomm-holding-platform` (дашборд автопарка),
`Omnicomm Fleet Report` (PPTX/HTML-отчёты).

**Главные доки:** `docs/ASCAN-PARITY-PLAN.md` (план и этапы), `docs/DATA-MODEL.md` (схема БД),
`docs/architecture.md`, `docs/roadmap.md` (текущий этап). Разбор конкурента — `docs/ascan/`.

## Структура

- `app/` — **основная разработка** (Next.js 16 + PG). Вся новая работа — здесь.
- `crm-backend/` — легаси-MVP (Express+SQLite), прод на :3026 до cutover. Не развивать, только фиксы.
- `liftplatform-omnicomm/` — архив проектных решений, не запускается. Только как референс.
- `deploy/run.sh` — cron+flock раннер прод-инстанса + CF-туннель.

## Tech Stack (app/)

- Next.js 16 App Router · React 19 · TypeScript · Tailwind 4
- PostgreSQL 16, dev-контейнер `crm-omnicomm-postgres` на **:5445** (чужие PG-контейнеры на
  5432/5433/5441/5450 — другие проекты, НЕ трогать)
- raw `pg` + SQL-миграции в `app/db/migrations/` — `?connection_limit=5&pool_timeout=10` на VPS ≤2GB
- Auth: JWT (jose HS256) в httpOnly cookie + RBAC (7 ролей)
- dev-порт **:3027** (прод crm-backend занимает :3026)
- i18n RU/KK — все пользовательские строки через словарь, не хардкодить

## Architecture conventions

### Auth & RBAC
- В админ-роутах ВСЕГДА `requireRole([...])` + try/catch AuthError, иначе 500.
- В payload — `user.userId`, НЕ `user.id`.
- Роли: admin, manager, support, installer, head, accounting, boss.

### Database
- snake_case колонки, UUID PK, TIMESTAMP **WITH TIME ZONE** всегда.
- Статусы/enum — `text` + CHECK-констрейнт (не native enum).
- Деньги — `numeric(14,2)`, тенге; НДС — параметр с датой действия, не константа.
- История состояний оборудования — источник правды посуточного биллинга; не перезаписывать, только добавлять.

### Бизнес-правила (из ТЗ, зашиты в легаси — сохранять при переносе)
- Нельзя «Закрыта/Выполнена» без `result_comment`.
- Нельзя «Выполнена» без фотоотчёта для типов из PHOTO_REQUIRED_TYPES.
- Акт ТО с «Активен» = старт абонплаты + создание объекта в Omnicomm.

## Omnicomm API — гочи (важно)

- Отчёты запрашиваются через **POST**, не GET.
- Топливо приходит в **децилитрах** → делить на 10.
- Дерево ТС вложенное — **флэттить** перед использованием.
- Трек — GPS-точки; в units встречается баг ×10.
- Копия `projectkap@online.omnicomm.ru` хрупкая под нагрузкой: **health-проба перед забором**,
  не долбить параллельно. У заказчика будет своя учётка.

## Conventions

- Commits: Conventional Commits на русском (`feat:`, `fix:`, `docs:`, `chore:`). См. CONTRIBUTING.md.
- Не коммитить `.env*`, секреты, бинарные архивы.
- Печатные формы РК (счёт, АВР Р-1, накладная З-2) — двуязычные, суммы прописью KK/RU.
