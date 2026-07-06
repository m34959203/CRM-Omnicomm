# CRM-Omnicomm

[![Build](https://img.shields.io/github/actions/workflow/status/m34959203/CRM-Omnicomm/ci.yml?branch=main)](https://github.com/m34959203/CRM-Omnicomm/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-Next.js%2016%20·%20PostgreSQL%2016-black)]()

> CRM дилера мониторинга транспорта (Omnicomm Alliance KZ): клиенты → оборудование → сервис →
> абонентский биллинг. Аналог «Аскан: МТ» без 1С, с Omnicomm-нативной интеграцией и РК-локализацией.

## Контекст

Заказчику предложили 1С-решение «Аскан: Мониторинг транспорта». Мы строим полноценный аналог
с козырями, которых у Аскан нет: интеграция с Omnicomm Online (объекты, телеметрия,
**автоблокировка должников**), казахстанская первичка (НДС 16%, АВР Р-1, ЭСФ-цепочка), RU/KK UI,
PWA техника с подписью клиента. Обоснование и этапы: [docs/ASCAN-PARITY-PLAN.md](docs/ASCAN-PARITY-PLAN.md).

## Состояние

Этапы 0–7 роадмапа **реализованы** в `app/` (Next.js 16 + PostgreSQL 16): справочники и CRUD,
интеграция Omnicomm Online (импорт абонбазы, консервация, автоблокировка должников), биллинг v2
(посуточно/подписки/разовые, двуязычные PDF, 1С-выгрузка), сервисный контур (заявки → наряды →
акты ТО), PWA техника, сдельная ЗП, техподдержка, отчёты (`/reports/*`), дашборд руководителя,
карточка клиента с операциями над парком, i18n RU/KK с переключателем. Тестовые прогоны:
`npm run test:billing` (22), `test:act-close` (19), `test:auto-block` (19), `test:payroll` (14),
`test:notify` (8). В бэклоге: e-mail-рассылка расчётных документов, прямой API ИС ЭСФ (ЭЦП НУЦ РК),
Kaspi Business, Wialon, Power BI-фид. Детали: [docs/roadmap.md](docs/roadmap.md).

## Демо (легаси-MVP)

- **Live:** https://crm-omnicomm.technokod.kz (crm-backend, выделенный CF-туннель)
- Демо-доступ (пароль `demo1234`): `admin@` / `manager@` / `support@` / `installer@` / `boss@omnicomm.kz`

## Состав

```
app/                    ОСНОВНАЯ РАЗРАБОТКА: Next.js 16 + PostgreSQL 16 (этапы 0–7 роадмапа)
crm-backend/            Легаси-MVP (Express + SQLite), прод :3026 — живёт до cutover
liftplatform-omnicomm/  Архив проектных решений (SQL-миграции, роуты) — не запускается
ui/                     HTML-прототипы (лендинг, макеты)
docs/                   ASCAN-PARITY-PLAN, DATA-MODEL, architecture, roadmap, setup, аудиты (ascan/)
deploy/                 run.sh (cron+flock) + DEPLOY.md
download/ascan_audit/   Аудит демо-базы Аскан со скринами (PDF)
```

## Документация

| Документ | Что там |
|---|---|
| [docs/ASCAN-PARITY-PLAN.md](docs/ASCAN-PARITY-PLAN.md) | план разработки: gap-анализ, этапы, РК-адаптация, риски |
| [docs/DATA-MODEL.md](docs/DATA-MODEL.md) | целевая схема PostgreSQL (DDL по доменам) |
| [docs/architecture.md](docs/architecture.md) | целевая архитектура, принципы, гочи Omnicomm |
| [docs/roadmap.md](docs/roadmap.md) | этапы 0–7 с чек-листами |
| [docs/setup.md](docs/setup.md) | локальный запуск app/ и легаси |
| [docs/ascan/](docs/ascan/) | разбор конкурента: выжимка встречи, карта функционала, транскрипт |

## Quick Start

```bash
# основная разработка (app/) — см. docs/setup.md
cd app && npm install && npm run db:migrate && npm run db:seed && npm run dev   # :3027

# легаси-MVP
cd crm-backend && npm install && npm run seed && npm start   # :3000, smoke: npm run smoke
```

## Лицензия

[MIT](LICENSE)
