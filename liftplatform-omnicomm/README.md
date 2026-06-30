# LiftPlatform → Omnicomm CRM — переиспользование

Адаптация существующего продукта **LiftPlatform** (Next.js 16 + TypeScript + PostgreSQL, MIT)
под ТЗ Omnicomm Alliance KZ. Вместо разработки с нуля — форк и доработка.

## Почему это работает
LiftPlatform — продакшн-платформа управления оборудованием с тем же стеком, что был
выбран для кастома, и почти идентичным доменом: реестр оборудования, обслуживание с
назначением техников и state-machine статусов, инциденты, заявки от населения с AI-триажем,
контракты+SLA, документы, аналитика, аудит, уведомления, PWA-офлайн, WhatsApp, RBAC.

## Маппинг домена (переименовать, не переписывать)
| LiftPlatform | Omnicomm CRM | Действие |
|---|---|---|
| organizations | Клиенты | reuse + переименование в UI |
| elevators | Объекты + оборудование (GPS, датчики, видео) | reuse, адаптировать поля |
| maintenance_schedules | Заявки / выезды монтажников | reuse + добавить этапы выезда |
| incidents | Неисправности / заявки | reuse |
| resident_requests | Обращения клиентов с сайта (форма+QR+AI) | reuse как есть |
| service_contracts | Договоры | reuse + слой абонплаты |
| documents | Вложения, акты, фото | reuse (валидация magic bytes уже есть) |
| notifications (SSE) | Уведомления (раздел 11) | reuse |
| audit_logs | История действий (раздел 19) | reuse |
| sla_configs / sla_breaches | Нормативы сроков + просрочки (раздел 10) | reuse |
| whatsapp_* | WhatsApp (раздел 12) | reuse |
| ai_* (Gemini) | Бонус: авто-триаж, предиктив, чат, маршруты | reuse |

## Что добавляется (этого нет в LiftPlatform) — миграции в `prisma/`
- **migration-017-visit-steps.sql** — этапы выезда с геолокацией (раздел 9.3) + флаг
  обязательного фото + статус монтажника (раздел 9.2).
- **migration-018-telephony-messages.sql** — IP-телефония (звонки) и мультиканальные
  сообщения Telegram/email/сайт/чат (раздел 12). WhatsApp уже покрыт migration-008.
- **migration-019-subscription-billing.sql** — абонентская плата: планы и счета со
  статусами (раздел 16).

## Пример API в стиле LiftPlatform — `src/app/api/`
- **telephony/route.ts** — вебхук телефонии + список звонков (Next.js App Router, pg, Zod,
  заголовочная аутентификация как у X-Cron-Secret).
- **reports/channels/route.ts** — отчёт по каналам связи (раздел 17).

## Что убрать/упростить (специфика лифтов)
- ИТС-оценка (condition_assessments) — не нужна; можно переиспользовать как «диагностика
  оборудования» либо отключить.
- normative_documents (лифтовые нормативы) — заменить на свои регламенты или убрать.

## Как применить
```bash
git clone https://github.com/m34959203/LiftTracker omnicomm-crm && cd omnicomm-crm
cp prisma/migration-017*.sql prisma/migration-018*.sql prisma/migration-019*.sql ./prisma/   # из этой папки
cp -r src/app/api/telephony src/app/api/reports/channels ./src/app/api/                       # из этой папки
cp .env.example .env   # задать DATABASE_URL, NEXTAUTH_SECRET, CRON_SECRET, TELEPHONY_SECRET
docker compose up -d
npm run migrate
```

## Оставшиеся доработки (TS, в стиле репозитория)
- Геопанель этапов выезда в кабинете техника (UI поверх visit_steps).
- Telegram-бот и email-парсер → запись в client_messages (по образцу wa-gateway).
- Биллинг абонплаты: cron-начисление + страница счетов (по образцу sla/check + analytics).
- Power BI: представление/выгрузка (рядом с /api/analytics/export?format=xlsx).

## Реализованные TS-роуты гэпов (готовы к копированию в репозиторий)
| Файл | Раздел ТЗ | Назначение |
|---|---|---|
| `src/app/api/telephony/route.ts` | 12.1 | Вебхук звонков + журнал, авто-привязка к клиенту |
| `src/app/api/messages/route.ts` | 12.2 | Приём Telegram/email/сайт/чат, опц. создание заявки |
| `src/app/api/maintenance/[id]/steps/route.ts` | 9.3 / 20 | Этапы выезда с гео, блокировка завершения без фото |
| `src/app/api/subscriptions/route.ts` | 16.1 | Планы абонплаты (список/создание) |
| `src/app/api/subscriptions/invoices/route.ts` | 16.2 | Счета абонплаты со статусами |
| `src/app/api/subscriptions/cron/route.ts` | 16.1/16.3 | Cron начисления + пометка просрочки |
| `src/app/api/reports/subscriptions/route.ts` | 16.4 | Отчёт по абонплате |
| `src/app/api/reports/channels/route.ts` | 17 | Отчёт по каналам связи |

Все роуты следуют конвенциям LiftPlatform: `pool` из `@/lib/db`, `getUserFromRequest` из
`@/lib/auth`, валидация Zod, аудит через `@/lib/audit`, аутентификация вебхуков через
секрет в заголовке (как `X-Cron-Secret`).

## Дополнительные переменные окружения
```
TELEPHONY_SECRET=...   # секрет вебхука IP-телефонии
CHANNEL_SECRET=...     # секрет вебхука Telegram/email/сайт
# CRON_SECRET уже есть в LiftPlatform — используется и для начисления абонплаты
```

## Зависимости от существующих частей LiftPlatform
- `documents` должна иметь ссылку `maintenance_id` (migration-009-document-refs) — для проверки фото.
- `incidents` дополняется столбцом `source` (канал обращения) — добавить ALTER при необходимости.
- `@/lib/audit` (`writeAudit`) — существующий помощник; при ином имени поправить импорт.

## UI-компоненты гэпов
| Файл | Раздел ТЗ | Назначение |
|---|---|---|
| `src/components/VisitStepsPanel.tsx` | 9.3 / 22 | Панель этапов выезда с геолокацией для кабинета монтажника |
| `src/app/(app)/subscriptions/page.tsx` | 16 | Страница абонплаты: сводка, счета со статусами, начисление |

Компоненты на React 19 + Tailwind + lucide-react (стек LiftPlatform). `VisitStepsPanel`
встраивается в карточку ТО/кабинет техника; страница абонплаты — в раздел навигации.

## Демо-данные
`prisma/seed-omnicomm.sql` — план абонплаты + счёт, демо-звонок, сообщение канала и этапы
выезда. Применение: `psql "$DATABASE_URL" -f prisma/seed-omnicomm.sql` (после миграций 017–019).

## Итоговый состав папки
```
prisma/   migration-017..019 + seed-omnicomm.sql
src/app/api/   telephony, messages, maintenance/[id]/steps,
               subscriptions(+invoices,cron), reports/(channels,subscriptions)
src/components/ VisitStepsPanel.tsx
src/app/(app)/subscriptions/page.tsx
```

## CRM-ядро по ТЗ — финальные миграции и роуты
| Файл | Раздел ТЗ |
|---|---|
| `prisma/migration-020-omnicomm-requests.sql` | 7, 7.2, 8, 18 — типы(16)/статусы(14)/приоритет/источник/номер заявки |
| `prisma/migration-021-roles-sla.sql` | 4, 10 — роль бухгалтерии + нормативы сроков (sla_configs) |
| `src/app/api/dashboard/route.ts` | 6 — рабочий стол с KPI |
| `docs/TZ-COVERAGE.md` | 25, 26 — чек-лист покрытия всех 27 разделов |

Итог: все функциональные разделы ТЗ закрыты кодом или существующими модулями LiftPlatform.
Остаются только внешние подключения (IP-телефония, 1С, Power BI) — это настройка, а не разработка CRM.

## Завершение разделов «в разработке» (5,13,14,15,21,23)
| Файл | Раздел ТЗ |
|---|---|
| `src/lib/nav.ts`, `src/components/Sidebar.tsx` | 5, 21 — разделы системы + фирменная навигация |
| `src/lib/omnicomm-theme.ts` | 21 — фирменные цвета и индикация статусов |
| `src/app/(app)/clients/[id]/page.tsx` | 13 — карточка клиента (реквизиты, звонки, переписка, счета) |
| `src/app/(app)/objects/[id]/page.tsx` | 14 — карточка объекта (параметры, история работ) |
| `src/app/(app)/calendar/page.tsx` | 15 — календарь выездов по датам |
| `src/app/api/integrations/powerbi/route.ts` | 23 — выгрузка для Power BI |
| `src/app/api/integrations/1c/route.ts` | 23 — обмен с 1С (счета/оплаты) |
| `integrations/telegram-bot.ts`, `integrations/email-poller.ts` | 12/23 — приём Telegram и email |

Итог: **все 27 разделов ТЗ закрыты**. См. `docs/TZ-COVERAGE.md`.

## Переменные окружения (полный список Omnicomm)
```
TELEPHONY_SECRET=...   CHANNEL_SECRET=...   BI_SECRET=...   ONEC_SECRET=...
TELEGRAM_TOKEN=...      IMAP_HOST=... IMAP_USER=... IMAP_PASS=...
CRM_URL=http://localhost:3091
# CRON_SECRET, NEXTAUTH_SECRET, DATABASE_URL — уже в LiftPlatform
```

## Адаптация Blueprint процессов 1С (продажа → биллинг)
Недостающие узлы Blueprint, реализованные в нашем стеке:
| Файл | Узел Blueprint |
|---|---|
| `prisma/migration-022-equipment-inventory.sql` | Склад+исполнитель, статусы оборудования Новое/Б/У/демо, перемещения |
| `prisma/migration-023-work-orders-acts.sql` | Заказ-наряд (бригада), Акт ТО (триггер биллинга), доработка, списание материалов |
| `prisma/migration-024-tariffs-billing-payroll.sql` | Иерархия тарифов, биллинг по активности, мотивация техников |
| `src/app/api/work-orders/route.ts` | Заказ-наряды с бригадой |
| `src/app/api/acts/route.ts` | Акт ТО → активация оборудования + старт биллинга / авто-доработка |
| `src/app/api/reports/payroll/route.ts` | Сдельная мотивация по закрытым Актам + порог |

Подробный разбор соответствия — в документе «Gap-анализ Blueprint и адаптация».
Примечание: проект не на 1С:УТ, поэтому ограничение версий УТ 11.4/11.5 для Omnicomm на нас
не распространяется; интеграция с мониторингом (Wialon/Omnicomm) и 1С:Бухгалтерией —
через собственные коннекторы (флаг `acts.monitoring_synced`, роут `/api/integrations/1c`).

## Функции из демо вендора (1С) — адаптировано
| Файл | Функция |
|---|---|
| `prisma/migration-025-sales-orders.sql` | Заказ клиента + порядок отгрузки (без/при/до установки) + реализация |
| `prisma/migration-026-sim-cards.sql` | Учёт SIM-карт (оприходование, перемещение, остатки) |
| `prisma/migration-027-equipment-ops-rma.sql` | Операции с оборуд. клиента (состояние/перевод/снятие/регистрация) + RMA |
| `prisma/migration-028-payroll-billing-detail.sql` | Категории/расценки/компенсации/удержания/оклад; скидки, аванс/кредит |
| `src/app/api/sales-orders/route.ts` | Заказы клиента |
| `src/app/api/sim-cards/route.ts` | SIM-карты + пакетный импорт |
| `src/app/api/reports/equipment/route.ts` | **Единый отчёт по оборудованию (преимущество — у вендора нет)** |
| `src/app/api/billing/auto-block/route.ts` | **Авто-блокировка по задолженности (преимущество — у вендора вручную)** |

Подробный разбор — в документе «Функции из демо вендора — адаптация в проект».
