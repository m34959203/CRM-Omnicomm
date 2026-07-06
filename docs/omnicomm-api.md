# Omnicomm Online REST API — референс для этапа 1

Полная спека: https://developers.omnicomm.ru (OpenAPI: `/api.yaml`, 76 операций).
Проверенные гочи из соседних проектов — в CLAUDE.md (POST-отчёты, децилитры, флэттен, health-проба).
Демо-контур для дев-тестов: `https://online.omnicomm.ru`, `rudemoru`/`rudemo123456` (см. omnicomm-fleet-report/docs/platform.md) — на нём НЕ выполнять мутации (create/delete/blocking), только чтение.

## Auth
- `POST /auth/login?jwt=1` тело `{login, password}` → `{jwt|access, refresh}`; заголовок далее строго `Authorization: JWT <token>` (с пробелом).
- `POST /auth/refresh` с `Authorization: JWT <refresh>`; протух → полный login. Лимит логинов ~10/мин.

## Объекты (ТС)
- Дерево: `GET /ls/api/v2/tree/vehicle` — ТС вложены в `children[].objects[]`, флэттить рекурсивно.
- Создание: `POST /ls/api/v1/profile/vehicle/create` тело `{vehicleName (≤64), terminalType, manufactureId (заводской №, [A-Za-z0-9], ≤50), groupId: int[], socketAddress? (только LINEGUARD), password?}`.
  Альтернатива с привязкой к аккаунту: `POST /ls/api/v1/vehicles?login=<uчётка>&vehiclegroup_id=<uuid>` (oneOf ТС/КО).
- Профиль (резерв настроек перед удалением): `GET /ls/api/v1/profile/vehicle/{id}` → jsonb в `telematics_object_links.profile_backup`; восстановление — `PUT /ls/api/v1/profile/vehicle/{id}/update`.
- Удаление: `DELETE /ls/api/v1/vehicles?vehicles=<id,id>&reason=<1..6>` (двухэтапно на нашей стороне: pending_delete → delete отдельным правом).
- **Консервация**: `POST /ls/api/v1/vehicles/dataCapture/change` тело `{vehicleId: string, state: "true"|"false"}` («приём данных выключен» = state:"false"). NB: state — строка, не boolean.
- Состояние ТС: `GET /ls/api/v1/vehicles/{id}/state`.
- Типы терминалов: `GET /ls/api/v1/profile/terminals/list`.

## Пользователи / блокировка (автоблокировка должников)
- `GET /ls/api/v1/users`, `POST /ls/api/v1/users`, `DELETE /ls/api/v1/users/{uuid}`.
- **Блокировка**: `POST /ls/api/v1/users/blocking` тело `{login, blocked: bool, reports_blocked: bool, blocking_comment, blocking_intervals: []}`; чтение — `GET /ls/api/v1/users/blocking?login=`.
  Сценарий Аскан: предупреждение → полная блокировка учётки клиента; у нас — из blocking_rules по ведомости расчётов.

## Телеметрия (для кэш-снапшота и посуточной активности)
- `POST /ls/api/v1/reports/consolidatedReport` `{vehicleIds:[int], timeBegin, timeEnd}` — лимиты ≤50 ТС / ≤31 день, батчить; строка = ТС×сутки; топливо в децилитрах ÷10.
- `GET /ls/api/v1/activity/vehicles` (+v2) — активность ТС.
- `GET /ls/api/v1/reports/track/{terminal_id}?timeBegin&timeEnd` — GPS-точки.

## Коды ошибок
0–15 (см. config.py fleet-report). 5/7/9/10/11 = «нет данных» — не прерывать операцию; 1 на login = неверные креды (не ретраить).
