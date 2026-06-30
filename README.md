# CRM-Omnicomm

[![Build](https://img.shields.io/github/actions/workflow/status/m34959203/CRM-Omnicomm/ci.yml?branch=main)](https://github.com/m34959203/CRM-Omnicomm/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-Node%20·%20Express%20·%20SQLite%20→%20PostgreSQL-black)]()

> CRM мониторинга транспорта Omnicomm Alliance KZ: клиенты, объекты, заявки, контроль монтажников, биллинг.

## Демо

- **Live (квази-эфемерный URL):** см. `/home/ubuntu/logs/crm-omnicomm.url` на сервере
- **Постоянный домен:** `crm-omnicomm.technokod.kz` — после добавления Public Hostname в Cloudflare (см. [deploy/DEPLOY.md](deploy/DEPLOY.md))
- Демо-доступ (пароль `demo1234`): `admin@` / `manager@` / `support@` / `installer@` / `boss@omnicomm.kz`

## Состав

```
crm-backend/            Рабочий backend (Node.js + Express + SQLite), 30 эндпоинтов, 28 smoke-тестов
liftplatform-omnicomm/  Пакет адаптации на базе LiftPlatform (Next.js + PostgreSQL): 13 миграций, 18 API-роутов, UI, интеграции
ui/                     HTML-прототипы: index (лендинг), dashboard (макет заказчика), prototype (кликабельный), roadmap
docs/                   Анализ потребности, техпроект, gap-анализы, рабочий документ разработки, TZ-COVERAGE
deploy/                 run.sh (cron+flock-раннер) + DEPLOY.md (поддомен technokod.kz)
```

## Решение

Единое окно для сервисной компании Omnicomm: клиенты → объекты с оборудованием (GPS/датчики) → заявки и выезды монтажников с геолокацией и фотоотчётами → сквозной поток **продажа → заказ-наряд → Акт ТО → запуск биллинга → счета абонплаты**. Бизнес-правила из ТЗ зашиты (нет результата → нельзя закрыть; монтаж без фото → нельзя «Выполнена»).

Два пути реализации:
- **crm-backend** — самодостаточный рабочий MVP на свободном ПО (запускается сразу, SQLite→PostgreSQL).
- **liftplatform-omnicomm** — продакшн-путь: форк LiftPlatform (тот же стек, почти идентичный домен) + миграции/роуты, которых в нём нет (этапы выезда, телефония, абонплата). См. [docs/TZ-COVERAGE.md](liftplatform-omnicomm/docs/TZ-COVERAGE.md).

## Quick Start (рабочий backend)

```bash
cd crm-backend
npm install
npm run seed     # демо-данные
npm start        # API + UI на http://localhost:3000  (на сервере PORT=3026)
npm run smoke    # 28 проверок: продажа → наряд → Акт ТО → биллинг
```

UI: открой корень `/` (лендинг) → дашборд / кликабельный прототип / роадмап.

## Стек

- **Backend:** Node.js + Express, SQLite (better-sqlite3) → PostgreSQL в проде
- **Auth:** JWT + bcrypt, 7 ролей из ТЗ
- **Загрузка фото:** multer (локально → MinIO/S3 в проде)
- **Прод-путь:** Next.js 16 + PostgreSQL (liftplatform-omnicomm)
- **Хостинг:** VPS + Cloudflare Tunnel (поддомен technokod.kz)

## Деплой

Раннер `deploy/run.sh` под `cron + flock` держит API+UI на `:3026` и публичный CF-туннель.
Поддомен `crm-omnicomm.technokod.kz` — один шаг в дашборде Cloudflare: [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Лицензия

[MIT](LICENSE)
