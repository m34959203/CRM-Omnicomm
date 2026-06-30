# Покрытие ТЗ Omnicomm — итоговый чек-лист

Все функциональные разделы ТЗ реализованы — кодом адаптации или штатными модулями LiftPlatform.
✅ готово

| № | Раздел ТЗ | Где реализовано | Статус |
|---|---|---|---|
| 1 | Общие положения | платформа | ✅ |
| 2 | Цели внедрения | платформа | ✅ |
| 3 | Назначение системы | RBAC + модули | ✅ |
| 4 | Роли и права (7 ролей) | migration-021 (+accounting) | ✅ |
| 5 | Основные разделы | lib/nav.ts + Sidebar.tsx | ✅ |
| 6 | Рабочий стол | api/dashboard/route.ts | ✅ |
| 7 | Раздел «Заявки», карточка | migration-020 (поля) | ✅ |
| 7.2 | 16 типов заявок | migration-020 (request_type) | ✅ |
| 8 | 14 статусов заявок | migration-020 (omnicomm_status) | ✅ |
| 9 | Контроль монтажников, этапы | migration-017 + steps route + VisitStepsPanel | ✅ |
| 10 | Контроль сроков (нормативы) | migration-021 (sla_configs) | ✅ |
| 11 | Уведомления | notifications LiftPlatform (SSE+email) | ✅ |
| 12 | Интеграция коммуникаций | telephony + messages + адаптеры tg/email | ✅ |
| 13 | Карточка клиента | clients/[id]/page.tsx | ✅ |
| 14 | Карточка объекта | objects/[id]/page.tsx | ✅ |
| 15 | Календарь выездов | calendar/page.tsx | ✅ |
| 16 | Счета, оплаты, абонплата | migration-019 + subscriptions модуль + UI | ✅ |
| 17 | Отчёты и аналитика | analytics + reports/channels,subscriptions | ✅ |
| 18 | Фильтрация и поиск | индексы migration-020 + списковые API | ✅ |
| 19 | История действий | audit_logs LiftPlatform | ✅ |
| 20 | Обязательные правила | steps route (фото) + сервис-слой | ✅ |
| 21 | Требования к интерфейсу | Sidebar.tsx + omnicomm-theme.ts (брендинг) | ✅ |
| 22 | Мобильный интерфейс монтажника | PWA + VisitStepsPanel.tsx | ✅ |
| 23 | Интеграции | telephony, 1c, powerbi роуты + tg/email адаптеры | ✅ |
| 24 | Этапы реализации | план адаптации (docx) | ✅ |
| 25 | Критерии приёмки | покрываются (см. ниже) | ✅ |
| 26 | Ожидаемый результат | покрывается | ✅ |
| 27 | Порядок согласования | организационный | — |

## Критерии приёмки (раздел 25) — соответствие
1. Создать клиента — organizations CRUD ✅
2. Создать заявку — incidents + migration-020 ✅
3. Назначить ответственного — manager_id/support_id ✅
4. Назначить монтажника — installer_id + visit ✅
5. Заявка проходит статусы — omnicomm_status (14) ✅
6. Отметки выезда — visit_steps + steps route ✅
7. Прикрепить фото/документы/комментарии — documents ✅
8. Руководитель видит просрочки — dashboard.overdue ✅
9. Загрузка сотрудников/монтажников — installer_status + dashboard ✅
10. История действий — audit_logs ✅
11. Фильтры — индексы + списковые API ✅
12. Разграничение прав — RBAC (7 ролей) ✅
13. Звонки и сообщения в карточке клиента — clients/[id] + calls/messages ✅
14. Данные для аналитики — analytics + powerbi feed ✅
15. Учёт абонплаты — subscriptions модуль ✅

## Что относится к настройке окружения (не разработка)
Подключение реальных провайдеров — это конфигурация секретов/учётных данных, код готов:
- IP-телефония → вебхук `/api/telephony` (`TELEPHONY_SECRET`)
- Telegram → `integrations/telegram-bot.ts` (`TELEGRAM_TOKEN`, `CHANNEL_SECRET`)
- Email → `integrations/email-poller.ts` (`IMAP_*`, `CHANNEL_SECRET`)
- 1С → `/api/integrations/1c` (`ONEC_SECRET`)
- Power BI → `/api/integrations/powerbi` (`BI_SECRET`)
