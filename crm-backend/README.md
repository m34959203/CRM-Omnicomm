# Omnicomm CRM — Backend (рабочая версия)

Каркас серверной части кастомной CRM по ТЗ Omnicomm Alliance KZ. Полностью на свободном ПО.

## Стек
- **Node.js + Express** — REST API
- **SQLite** (better-sqlite3) для разработки → **PostgreSQL** в проде
- **JWT + bcrypt** — аутентификация и роли
- **multer** — загрузка фото (локально → MinIO/S3 в проде)

## Реализовано
**Этап 1 — базовая CRM**
- Аутентификация JWT, 7 ролей из ТЗ
- Клиенты, объекты, заявки (14 статусов, 16 типов)
- Неизменяемая история действий, фотоотчёты, дашборд
- Бизнес-правила (раздел 20 ТЗ): нет результата → нельзя закрыть; монтажная заявка без фото → нельзя «Выполнена»

**Этап 2 — контроль монтажников**
- Выезды и этапы (`accept/depart/arrive/start/finish`) с **геолокацией**
- Авто-смена статуса заявки и статуса монтажника по этапу
- Загрузка фото выезда; завершение без фото блокируется
- Календарь выездов с фильтрами
- Отчёт по монтажникам: назначено/выполнено/просрочено, среднее время прибытия и работ, повторные выезды, без фото

## Запуск
```bash
npm install
npm run seed     # демо-данные (вкл. демо-выезд)
npm start        # API на http://localhost:3000
```

## Тесты
```bash
npm run seed && npm run smoke   # 28 проверок (все модули)
```

## Демо-доступы (пароль `demo1234`)
`admin@` · `manager@` · `support@` · `installer@` · `boss@omnicomm.kz`

## Эндпоинты
| Метод | Путь | Назначение |
|---|---|---|
| POST | `/api/auth/login` | Вход, выдача токена |
| GET | `/api/dashboard` | Показатели рабочего стола |
| GET/POST | `/api/requests` | Список / создание заявок |
| GET | `/api/requests/:id` | Карточка + история + вложения |
| PATCH | `/api/requests/:id/status` | Смена статуса (правила) |
| POST | `/api/requests/:id/assign` | Назначить ответственных |
| POST | `/api/requests/:id/photos` | Фотоотчёт |
| POST | `/api/requests/:id/visit` | **Создать/запланировать выезд** |
| POST | `/api/visits/:id/step` | **Этап выезда + геолокация** |
| POST | `/api/visits/:id/photo` | **Фото выезда (multipart)** |
| GET | `/api/visits` | **Календарь выездов** (`?date= &installer= &status=`) |
| GET | `/api/reports/installers` | **Отчёт по монтажникам** |
| GET/POST | `/api/clients` | Клиенты |
| GET | `/api/meta` | Справочники |

## Структура
```
src/
  db.js       — схема БД и справочники
  auth.js     — JWT, роли
  server.js   — API этапа 1
  visits.js   — API выездов (этап 2)
  seed.js     — демо-данные
  smoke.js    — тесты (18 проверок)
```

## Переход на PostgreSQL (прод)
SQLite — только для разработки. Для прода: поднять PostgreSQL (Docker), заменить `better-sqlite3` на `pg`, перенести схему из `src/db.js`, фото — в MinIO/S3, секреты — в `.env`.

## Следующие этапы
Этап 3 — интеграции (телефония, WhatsApp/Telegram/email, 1С) · Этап 4 — аналитика/Power BI · Этап 5 — мобильный кабинет (Flutter).

## Доменные модули (разработка)
Реализованы и покрыты сквозным тестом (продажа → наряд → Акт ТО → активация → биллинг):
| Метод | Путь | Назначение |
|---|---|---|
| GET/POST | `/api/equipment` | Оборудование (склад) |
| GET | `/api/reports/equipment` | **Единый отчёт по оборудованию** (по статусам/местам) |
| GET/POST | `/api/sales-orders` | Заказ клиента + порядок отгрузки (без/при/до установки) |
| GET/POST | `/api/work-orders` | Заказ-наряды |
| POST | `/api/acts` | **Акт ТО → активация оборуд. + старт абонплаты + счёт** / доработка |
| GET | `/api/subscriptions/invoices` | Счета абонплаты |
| POST | `/api/subscriptions/cron` | Начисление абонплаты за период (идемпотентно) |
| GET/POST | `/api/sim-cards` | SIM-карты (пакетный ввод, остатки) |
| POST | `/api/billing/auto-block` | **Авто-блокировка оборуд. по задолженности** |

Файлы: `src/modules2.js` (логика), таблицы в `src/db.js` (equipment, warehouses, sales_orders,
work_orders, maintenance_acts, subscription_plans/invoices, sim_cards).
