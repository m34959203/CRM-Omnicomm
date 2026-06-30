# CRM-Omnicomm

[![Build](https://img.shields.io/github/actions/workflow/status/m34959203/CRM-Omnicomm/ci.yml?branch=main)](https://github.com/m34959203/CRM-Omnicomm/actions)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Stack](https://img.shields.io/badge/stack-Next.js%2016%20·%20Postgres-black)]()

> CRM для управления клиентами, договорами и автопарком на телематике Omnicomm.

## Проблема

Данные по клиентам автопарка живут в таблицах и переписке, а телеметрия ТС — отдельно в Omnicomm. Менеджер не видит в одном окне, какие машины закреплены за клиентом, что с договором и оплатой, и как ведёт себя парк по факту. Сверка ручная и медленная.

## Решение

Единое окно: клиенты → договоры → закреплённые ТС, синхронизированные из Omnicomm. CRM подтягивает дерево ТС и агрегаты телеметрии, связывает их с карточкой клиента и контролирует жизненный цикл сделки от лида до продления.

## Архитектура

Три коробки + стрелки:

- **Web (Next.js)** — карточки клиентов, договоров, ТС; дашборд менеджера.
- **API (REST)** — бизнес-логика CRM + синк-воркер к Omnicomm API.
- **Postgres** — клиенты, договоры, привязки ТС, кэш-снапшоты телеметрии.

Интеграция с Omnicomm — через её HTTP API (отчёты `POST`, топливо в децилитрах ÷10, дерево ТС флэттится). Подробнее: [docs/architecture.md](docs/architecture.md).

## Quick Start

```bash
git clone https://github.com/m34959203/CRM-Omnicomm.git
cd CRM-Omnicomm
cp .env.example .env
# заполни ключи в .env
npm install
npm run dev
```

Открой http://localhost:3000. Подробная инструкция и troubleshooting: [docs/setup.md](docs/setup.md).

## Стек

- **Frontend:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4
- **Backend:** Postgres 16 · Prisma / raw pg · REST
- **Интеграция:** Omnicomm HTTP API (синк дерева ТС + агрегаты телеметрии)
- **Хостинг:** VPS / Docker

## Roadmap

- [ ] Скелет CRM — клиенты, договоры, аутентификация (RBAC)
- [ ] Синк дерева ТС из Omnicomm + привязка к клиенту
- [ ] Кэш-снапшот агрегатов телеметрии в карточке клиента
- [ ] Воронка сделок: лид → договор → продление
- [ ] Уведомления об истечении договоров

Подробно: [docs/roadmap.md](docs/roadmap.md).

## Лицензия

[MIT](LICENSE)
