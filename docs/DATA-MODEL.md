# DATA-MODEL — целевая схема PostgreSQL 16 (CRM-Omnicomm)

Дата: 05.07.2026. Основа: `ASCAN-PARITY-PLAN.md` (этапы 0–7), рабочая SQLite-схема
`crm-backend/src/db.js` (20 таблиц, данные мигрируются), PG-миграции
`liftplatform-omnicomm/prisma/migration-017…028.sql` (отвязаны от сущностей LiftPlatform),
карта функционала Аскан `docs/ascan/ascan-functional-map.md`, требования РК из раздела 3.1 плана.

## Принципы

- `snake_case`, PK — `UUID DEFAULT gen_random_uuid()`, время — только `TIMESTAMPTZ`,
  `created_at`/`updated_at` (у append-only журналов — только `created_at`).
- Статусы/enum — `text` + `CHECK` (не native enum): англоязычные машинные коды,
  подписи RU/KK — в i18n приложения. Русские значения из SQLite перекодируются при миграции.
- Деньги — `NUMERIC(14,2)`, количество — `NUMERIC(12,3)`, валюта по умолчанию KZT.
- Посуточные расчёты — по календарю **Asia/Almaty** (интервалы храним в TIMESTAMPTZ,
  границы суток вычисляет приложение).
- Двуязычие: поля `*_kk` только там, где значение попадает в печатные формы
  (контрагенты, номенклатура, виды работ, шаблоны уведомлений, собственные организации).
- НДС — не константа: справочник `vat_rates` с датой действия; в документе фиксируется
  снэпшот ставки на дату оборота.
- Иерархия тарифов и матрица оснований акта ТО — данные + `CHECK`; разрешение приоритетов
  (объект > клиент > категория > умолчание; план приоритетнее тарифов) — в приложении.
- Нумерация документов — PG-`SEQUENCE` на тип документа, форматирование номера в приложении.

## ER-обзор по доменам

### 1. Система и справочники (13)
| Сущность | Назначение |
|---|---|
| `roles` | 7 ролей RBAC (admin, manager, support, installer, head, accounting, boss — по CLAUDE.md) |
| `users` | сотрудники; статус монтажника, telegram для push-дубля |
| `app_settings` | key/value настройки (jsonb) |
| `audit_log` | сквозной аудит действий по сущностям |
| `vat_rates` | ставки НДС с датой действия (12% → 16% с 01.01.2026) |
| `own_organizations` | организации-продавцы: реквизиты РК (БИН, ИИК, БИК, Кбе), признак плательщика НДС, двуязычные поля для печатных форм |
| `service_categories` | категории сервисного обслуживания (уровень тарифов и правил блокировки) |
| `suppliers` | поставщики оборудования (ремонт/RMA) |
| `sim_operators` | операторы РК: Beeline KZ, Kcell, Tele2/Altel, izi |
| `sim_operator_plans` | M2M-тарифы операторов |
| `nomenclature` | номенклатура: оборудование / материалы / услуги; параметры телематики (тип устройства, max SIM), серийный учёт |
| `work_types` | виды работ: действие, обязательность и места фотофиксации, базовая сдельная расценка |
| `material_norms` | нормы расхода материалов по виду работ (авто-списание в акте) |

### 2. Клиенты и договоры (5)
| Сущность | Назначение |
|---|---|
| `clients` | партнёр (бизнес-единица): менеджер, категория, схема расчётов аванс/кредит, тарифный план |
| `counterparties` | контрагенты (юрлица; холдинги = несколько на клиента): БИН/ИИН, юр. форма, Кбе, плательщик НДС, резидентство, признак госучреждения |
| `counterparty_bank_accounts` | ИИК (IBAN KZ…) + БИК + банк |
| `client_contacts` | контактные лица |
| `contracts` | договоры (продажа/абонплата/ремонт); договор госзакупа с номером на goszakup.gov.kz |

### 3. Объекты мониторинга (1)
| Сущность | Назначение |
|---|---|
| `monitoring_objects` | ТС (марка, госномер, VIN) или произвольный объект; привязка к клиенту/договору, тарифному плану |

### 4. Оборудование и SIM (10)
| Сущность | Назначение |
|---|---|
| `warehouses` | склады: физические, техников, подрядчиков, виртуальные (тестирование, поставщик) |
| `equipment_items` | единицы оборудования: серия/IMEI, состояние Новое/БУ, размещение, биллинговое состояние Активен/Консервация/Отключен |
| `equipment_state_history` | регистр истории биллинговых состояний — фундамент посуточного биллинга |
| `equipment_movements` | все перемещения склад↔техник↔клиент↔поставщик↔тестирование с причиной и документом-источником |
| `equipment_repair_docs` | ремонт: приём от клиента (долг перед клиентом, приход БУ), передача поставщику, получение, выдача/подмена |
| `equipment_repair_doc_items` | позиции ремонтных документов, признак подменного фонда |
| `testing_orders` | заказ на тестирование → виртуальный склад → продажа или отказ (демонтаж) |
| `testing_order_items` | оборудование на тестировании |
| `sim_cards` | SIM во всех размещениях: склад / сотрудник / подрядчик / в оборудовании |
| `sim_movements` | перемещения и установка/снятие SIM |

### 5. Сервисный контур (14)
| Сущность | Назначение |
|---|---|
| `tickets` | тикеты техподдержки: решено удалённо / авто-заявки ТО по одной на объект / отклонено; авто-закрытие |
| `requests` | заявки (16 типов, 14 статусов), связь с тикетом |
| `request_history` | история действий по заявке |
| `attachments` | универсальные вложения (фото/документ/подпись) к заявке, наряду, акту, тикету, документу |
| `work_orders` | заказ-наряды: многодневный период (график drag-and-drop), логист |
| `work_order_performers` | несколько исполнителей на наряд |
| `work_order_trips` | командировки в наряде: период, транспорт, расходы → себестоимость |
| `maintenance_acts` | акт ТО — центральный документ; из PWA приходит «в подготовке», подпись клиента |
| `maintenance_act_lines` | действия по оборудованию: установка/замена/демонтаж/диагностика/услуга × основание → движения (установленное И снятое) |
| `act_materials` | списание материалов (по нормам расхода) |
| `act_sim_ops` | установка/снятие SIM через акт (контроль max SIM) |
| `act_works` | сдельные работы с зафиксированной расценкой → источник ЗП |
| `visits` | выезды монтажников (унаследовано из прода) |
| `visit_steps` | гео-этапы выезда: принял/выехал/прибыл/начал/завершил |

### 6. Биллинг и продажи (11)
| Сущность | Назначение |
|---|---|
| `tariff_plans` | именованные тарифные планы (приоритетнее произвольных тарифов) |
| `tariff_plan_items` | ставки плана по типам начислений |
| `tariffs` | произвольные тарифы: умолчание / категория / клиент / объект; «Не начислять»; цена с/без НДС; период действия |
| `billing_documents` | расчётные документы: авансовый счёт / акт (АВР) / разовый счёт; формула аванса; массовое формирование |
| `discounts` | скидки суммой, списываются помесячно до исчерпания |
| `discount_applications` | применение скидки к документу (аудит остатка) |
| `accruals` | начисления-строки: посуточно по объекту/оборудованию — «расшифровка абонплаты» |
| `payments` | оплаты клиентов → ведомость расчётов (долги/авансы) → автоблокировка |
| `sales_orders` | заказы клиента: порядок отгрузки без/при/до установки (бюджетники) |
| `sales_order_items` | позиции заказа (товар/услуга, распределение по объектам) |
| `sales_invoices` | счёт / реализация (АВР) / накладная З-2 по заказу |

### 7. Сдельная ЗП (7)
| Сущность | Назначение |
|---|---|
| `performer_categories` | категории исполнителей |
| `performer_category_assignments` | присвоение категории с датой |
| `work_rates` | расценки: исполнитель > категория > умолчание, по видам работ |
| `payroll_rules` | схема «оклад за норму N монтажей + сделка сверх порога» |
| `payroll_sheets` | расчёт за месяц/полмесяца, ведомость |
| `payroll_sheet_lines` | итоги по исполнителю (план/факт, порог) |
| `payroll_entries` | единый регистр начислений: работа (из акта) / компенсация / удержание |

### 8. Интеграция с телематикой (6)
| Сущность | Назначение |
|---|---|
| `telematics_servers` | серверы мониторинга (Omnicomm/Wialon): URL, учётка, health-проба |
| `telematics_accounts` | учётные записи СМ per-клиент; флаг автоблокировки |
| `telematics_object_links` | связь объект/оборудование ↔ объект в СМ; консервация («приём выключен»), двухэтапное удаление, резерв настроек |
| `sync_log` | журнал операций и ошибок синхронизации |
| `blocking_rules` | правила блокировки должников: дни отсрочки для аванса/кредита, допустимый долг |
| `blocking_events` | журнал: предупреждение → блокировка → разблокировка (в т.ч. ручная «до даты») |

### 9. Коммуникации и уведомления (5)
| Сущность | Назначение |
|---|---|
| `calls` | журнал звонков (вебхук телефонии) |
| `messages` | сообщения каналов (WhatsApp/Telegram/email/сайт) с привязкой к клиенту/заявке/тикету |
| `notification_templates` | двуязычные шаблоны (RU/KK) писем и сообщений |
| `notification_queue` | очередь рассылки партиями (расчётные документы, предупреждения о блокировке) |
| `push_subscriptions` | web-push подписки PWA техника |

**Итого: 72 таблицы.**

---

## DDL

### Домен 1. Система и справочники

```sql
-- gen_random_uuid() встроен в PG13+; расширение не требуется.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Нумераторы документов (формат номера собирает приложение, напр. 'ЗН-000123')
CREATE SEQUENCE IF NOT EXISTS seq_request_number;
CREATE SEQUENCE IF NOT EXISTS seq_ticket_number;
CREATE SEQUENCE IF NOT EXISTS seq_work_order_number;
CREATE SEQUENCE IF NOT EXISTS seq_act_number;
CREATE SEQUENCE IF NOT EXISTS seq_sales_order_number;
CREATE SEQUENCE IF NOT EXISTS seq_billing_doc_number;
CREATE SEQUENCE IF NOT EXISTS seq_repair_doc_number;
CREATE SEQUENCE IF NOT EXISTS seq_testing_order_number;

CREATE TABLE roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    name_kk     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name        text NOT NULL,
    email            text NOT NULL UNIQUE,
    phone            text,
    role_id          uuid NOT NULL REFERENCES roles(id),
    password_hash    text NOT NULL,
    is_active        boolean NOT NULL DEFAULT true,
    region           text,
    installer_status text NOT NULL DEFAULT 'free'
                     CHECK (installer_status IN ('free','assigned','en_route','on_site','working',
                            'wait_client','wait_parts','done','unavailable','day_off')),
    telegram_chat_id text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role_id);

CREATE TABLE app_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid REFERENCES users(id),
    action      text NOT NULL,
    entity_type text NOT NULL,
    entity_id   uuid,
    detail      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE vat_rates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rate        numeric(5,2) NOT NULL,
    valid_from  date NOT NULL UNIQUE,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE vat_rates IS
  'НДС как параметр с датой действия (12% до 31.12.2025, 16% с 01.01.2026). Ставка выбирается по ДАТЕ ОБОРОТА, не по дате договора/оплаты.';

CREATE TABLE own_organizations (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    name_kk           text,
    legal_form        text CHECK (legal_form IN ('TOO','IP','AO','GU','KGP','NAO','other')),
    bin               text,
    iik               text,
    bik               text,
    bank_name         text,
    kbe               text,
    is_vat_payer      boolean NOT NULL DEFAULT true,
    vat_certificate   text,
    legal_address     text,
    legal_address_kk  text,
    director_name     text,
    director_name_kk  text,
    director_basis    text,
    phone             text,
    email             text,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE own_organizations IS 'Организации-продавцы (от чьего имени выписываются счёт/АВР/З-2).';

CREATE TABLE service_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    name_kk     text,
    note        text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE service_categories IS 'Категории сервисного обслуживания — уровень в иерархии тарифов и в правилах блокировки должников.';

CREATE TABLE suppliers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    bin_iin     text,
    contact     text,
    phone       text,
    email       text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_operators (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text UNIQUE,          -- beeline_kz, kcell, tele2_altel, izi
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_operator_plans (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id  uuid NOT NULL REFERENCES sim_operators(id) ON DELETE CASCADE,
    name         text NOT NULL,
    monthly_fee  numeric(14,2),
    note         text,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nomenclature (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind              text NOT NULL CHECK (kind IN ('equipment','material','service')),
    name              text NOT NULL,
    name_kk           text,
    sku               text,
    unit              text NOT NULL DEFAULT 'шт',
    unit_kk           text,
    default_price     numeric(14,2),
    vat_included      boolean NOT NULL DEFAULT true,
    is_serial_tracked boolean NOT NULL DEFAULT false,
    device_type       text,                     -- gps_terminal, fuel_sensor, cctv, ...
    max_sim_slots     int NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN nomenclature.max_sim_slots IS 'Контроль максимума SIM в устройстве при установке через акт ТО.';
CREATE INDEX idx_nomenclature_kind ON nomenclature(kind) WHERE is_active;

CREATE TABLE work_types (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text NOT NULL,
    name_kk        text,
    action         text CHECK (action IN ('install','replace','dismantle','diagnostics','service')),
    photo_required boolean NOT NULL DEFAULT false,
    photo_places   jsonb,                      -- ["кабина","бак","разъём"] — места фотофиксации
    default_rate   numeric(14,2),              -- сдельная расценка «по умолчанию»
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE material_norms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_type_id    uuid NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
    nomenclature_id uuid NOT NULL REFERENCES nomenclature(id),
    quantity        numeric(12,3) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (work_type_id, nomenclature_id)
);
COMMENT ON TABLE material_norms IS 'Нормы расхода материалов — авто-подстановка списаний в акт ТО по виду работ.';
```

### Домен 2. Клиенты и договоры

```sql
CREATE TABLE clients (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text NOT NULL,
    category_id    uuid REFERENCES service_categories(id),
    manager_id     uuid REFERENCES users(id),
    phone          text,
    email          text,
    billing_scheme text NOT NULL DEFAULT 'credit' CHECK (billing_scheme IN ('advance','credit')),
    billing_period text NOT NULL DEFAULT 'month'  CHECK (billing_period IN ('month','quarter')),
    tariff_plan_id uuid,               -- FK добавляется в домене 6 (tariff_plans)
    is_active      boolean NOT NULL DEFAULT true,
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN clients.billing_scheme IS 'advance: счёт в начале месяца, акт в конце (начисления + доначисление − скидки − предоплата); credit: всё в конце месяца.';
CREATE INDEX idx_clients_manager  ON clients(manager_id);
CREATE INDEX idx_clients_category ON clients(category_id);
CREATE INDEX idx_clients_name     ON clients(lower(name));

CREATE TABLE counterparties (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name             text NOT NULL,
    name_kk          text,
    legal_form       text CHECK (legal_form IN ('TOO','IP','AO','GU','KGP','NAO','FL','other')),
    bin_iin          text,
    kbe              text,
    is_vat_payer     boolean NOT NULL DEFAULT false,
    is_resident      boolean NOT NULL DEFAULT true,
    is_government    boolean NOT NULL DEFAULT false,
    legal_address    text,
    legal_address_kk text,
    actual_address   text,
    phone            text,
    email            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE counterparties IS 'Контрагент (юрлицо) ≠ клиент (партнёр): у холдинга несколько контрагентов на одного клиента.';
COMMENT ON COLUMN counterparties.is_government IS 'ГУ/КГП — сценарий бюджетников: закрывающие документы «до установки».';
CREATE INDEX idx_cp_client ON counterparties(client_id);
CREATE INDEX idx_cp_bin    ON counterparties(bin_iin);

CREATE TABLE counterparty_bank_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    counterparty_id uuid NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
    iik             text NOT NULL,      -- IBAN KZ...
    bik             text NOT NULL,
    bank_name       text,
    currency        text NOT NULL DEFAULT 'KZT',
    is_primary      boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_contacts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name        text NOT NULL,
    position    text,
    phone       text,
    email       text,
    is_primary  boolean NOT NULL DEFAULT false,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ccontacts_client ON client_contacts(client_id);

CREATE TABLE contracts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number          text NOT NULL,
    client_id       uuid NOT NULL REFERENCES clients(id),
    counterparty_id uuid REFERENCES counterparties(id),
    own_org_id      uuid REFERENCES own_organizations(id),
    kind            text NOT NULL DEFAULT 'subscription'
                    CHECK (kind IN ('sale','subscription','repair','complex')),
    is_goszakup     boolean NOT NULL DEFAULT false,
    goszakup_number text,
    goszakup_url    text,
    signed_at       date,
    valid_from      date,
    valid_to        date,
    currency        text NOT NULL DEFAULT 'KZT',
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft','active','suspended','terminated')),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN contracts.goszakup_number IS 'Номер договора на портале goszakup.gov.kz (госзакуп).';
CREATE INDEX idx_contracts_client ON contracts(client_id);
CREATE INDEX idx_contracts_number ON contracts(number);
```

### Домен 3. Объекты мониторинга

```sql
CREATE TABLE monitoring_objects (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id      uuid NOT NULL REFERENCES clients(id),
    contract_id    uuid REFERENCES contracts(id),
    name           text NOT NULL,
    kind           text NOT NULL DEFAULT 'vehicle' CHECK (kind IN ('vehicle','stationary','other')),
    brand          text,
    model          text,
    reg_number     text,
    vin            text,
    address        text,
    lat            double precision,
    lng            double precision,
    contact_person text,
    contact_phone  text,
    tariff_plan_id uuid,               -- FK добавляется в домене 6
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN monitoring_objects.name IS 'Шаблонное имя (марка + госномер); при импорте из Omnicomm марка/госномер парсятся из имени объекта.';
CREATE INDEX idx_mobj_client ON monitoring_objects(client_id);
CREATE INDEX idx_mobj_reg    ON monitoring_objects(reg_number);
CREATE INDEX idx_mobj_status ON monitoring_objects(status);
```

### Домен 4. Оборудование и SIM

```sql
CREATE TABLE warehouses (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    type        text NOT NULL DEFAULT 'physical'
                CHECK (type IN ('physical','technician','contractor','testing','supplier','virtual')),
    holder_id   uuid REFERENCES users(id),       -- для склада техника/подрядчика
    supplier_id uuid REFERENCES suppliers(id),   -- для виртуального склада поставщика
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE equipment_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    nomenclature_id uuid NOT NULL REFERENCES nomenclature(id),
    serial_number   text UNIQUE,
    imei            text UNIQUE,
    condition       text NOT NULL DEFAULT 'new' CHECK (condition IN ('new','used')),
    status          text NOT NULL DEFAULT 'in_stock'
                    CHECK (status IN ('in_stock','with_technician','on_testing','at_supplier',
                           'installed','reserved','written_off')),
    billing_state   text CHECK (billing_state IN ('active','conservation','disabled')),
    warehouse_id    uuid REFERENCES warehouses(id),
    holder_id       uuid REFERENCES users(id),
    client_id       uuid REFERENCES clients(id),
    object_id       uuid REFERENCES monitoring_objects(id),
    contract_id     uuid REFERENCES contracts(id),
    supplier_id     uuid REFERENCES suppliers(id),
    purchase_price  numeric(14,2),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN equipment_items.condition IS 'БУ нельзя продать как новое и отдать на тест; возврат в «Новое» — документом смены состояния с ценой оприходования (equipment_movements.reason=condition_change).';
COMMENT ON COLUMN equipment_items.billing_state IS 'Только при status=installed. active: данные идут, абонплата идёт; conservation: данных нет, абонплата идёт; disabled: удалён из СМ, не начисляется. Текущий срез equipment_state_history.';
CREATE INDEX idx_eq_status    ON equipment_items(status);
CREATE INDEX idx_eq_warehouse ON equipment_items(warehouse_id);
CREATE INDEX idx_eq_holder    ON equipment_items(holder_id);
CREATE INDEX idx_eq_client    ON equipment_items(client_id);
CREATE INDEX idx_eq_object    ON equipment_items(object_id);

CREATE TABLE equipment_state_history (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id uuid NOT NULL REFERENCES equipment_items(id) ON DELETE CASCADE,
    object_id    uuid REFERENCES monitoring_objects(id),
    client_id    uuid REFERENCES clients(id),
    contract_id  uuid REFERENCES contracts(id),
    state        text NOT NULL CHECK (state IN ('active','conservation','disabled')),
    valid_from   timestamptz NOT NULL,
    valid_to     timestamptz,
    source_type  text,                 -- maintenance_act | manual | import | sync
    source_id    uuid,
    created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE equipment_state_history IS 'Регистр состояний — единственный источник посуточного биллинга «по активному оборудованию». Интервалы не пересекаются; дни считаются по календарю Asia/Almaty.';
CREATE UNIQUE INDEX uq_esh_open      ON equipment_state_history(equipment_id) WHERE valid_to IS NULL;
CREATE INDEX idx_esh_eq_period       ON equipment_state_history(equipment_id, valid_from);
CREATE INDEX idx_esh_client_period   ON equipment_state_history(client_id, valid_from);

CREATE TABLE equipment_movements (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id      uuid NOT NULL REFERENCES equipment_items(id) ON DELETE CASCADE,
    from_warehouse_id uuid REFERENCES warehouses(id),
    to_warehouse_id   uuid REFERENCES warehouses(id),
    from_holder_id    uuid REFERENCES users(id),
    to_holder_id      uuid REFERENCES users(id),
    from_client_id    uuid REFERENCES clients(id),
    to_client_id      uuid REFERENCES clients(id),
    new_status        text,
    new_condition     text,
    reason            text NOT NULL
                      CHECK (reason IN ('receipt','assign_to_technician','return_to_warehouse',
                             'install','dismantle','to_testing','from_testing',
                             'receive_from_client','send_to_supplier','receive_from_supplier',
                             'issue_to_client','write_off','condition_change')),
    source_type       text,            -- maintenance_act | repair_doc | testing_order | work_order | manual
    source_id         uuid,
    performed_by      uuid REFERENCES users(id),
    note              text,
    created_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN equipment_movements.reason IS 'assign_to_technician создаётся автоматически при назначении наряда (автоперемещение на техника).';
CREATE INDEX idx_eqmov_eq      ON equipment_movements(equipment_id);
CREATE INDEX idx_eqmov_created ON equipment_movements(created_at DESC);
CREATE INDEX idx_eqmov_source  ON equipment_movements(source_type, source_id);

CREATE TABLE equipment_repair_docs (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number       text UNIQUE,
    doc_type     text NOT NULL
                 CHECK (doc_type IN ('receive_from_client','issue_to_client',
                        'send_to_supplier','receive_from_supplier')),
    client_id    uuid REFERENCES clients(id),
    supplier_id  uuid REFERENCES suppliers(id),
    status       text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('draft','open','closed','cancelled')),
    note         text,
    performed_by uuid REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE equipment_repair_docs IS 'Ремонтный контур: приём от клиента — всегда приход как БУ и долг перед клиентом (открытый документ) до выдачи/подмены.';
CREATE INDEX idx_repair_client ON equipment_repair_docs(client_id);
CREATE INDEX idx_repair_status ON equipment_repair_docs(status);

CREATE TABLE equipment_repair_doc_items (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id         uuid NOT NULL REFERENCES equipment_repair_docs(id) ON DELETE CASCADE,
    equipment_id   uuid NOT NULL REFERENCES equipment_items(id),
    is_replacement boolean NOT NULL DEFAULT false,   -- выдано из подменного фонда
    defect_note    text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE testing_orders (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number               text UNIQUE,
    client_id            uuid NOT NULL REFERENCES clients(id),
    object_id            uuid REFERENCES monitoring_objects(id),
    warehouse_id         uuid REFERENCES warehouses(id),   -- виртуальный склад тестирования
    status               text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','completed','cancelled')),
    result               text CHECK (result IN ('sale','refusal')),
    sales_order_id       uuid,          -- FK добавляется в домене 6
    dismantle_request_id uuid,          -- FK добавляется в домене 5
    started_at           timestamptz,
    finished_at          timestamptz,
    note                 text,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE testing_orders IS 'Тест-драйв: завершение = продажа (создаётся заказ клиента) или отказ (создаётся заявка на демонтаж). Отчёт «дней на тестировании» — из started_at/finished_at.';

CREATE TABLE testing_order_items (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    testing_order_id uuid NOT NULL REFERENCES testing_orders(id) ON DELETE CASCADE,
    equipment_id     uuid NOT NULL REFERENCES equipment_items(id),
    created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_cards (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    icc           text NOT NULL UNIQUE,
    msisdn        text,
    operator_id   uuid REFERENCES sim_operators(id),
    plan_id       uuid REFERENCES sim_operator_plans(id),
    location_type text NOT NULL DEFAULT 'warehouse'
                  CHECK (location_type IN ('warehouse','employee','contractor','equipment')),
    warehouse_id  uuid REFERENCES warehouses(id),
    holder_id     uuid REFERENCES users(id),
    equipment_id  uuid REFERENCES equipment_items(id),
    status        text NOT NULL DEFAULT 'in_stock'
                  CHECK (status IN ('in_stock','assigned','installed','suspended','written_off')),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sim_location ON sim_cards(location_type);
CREATE INDEX idx_sim_status   ON sim_cards(status);
CREATE INDEX idx_sim_eq       ON sim_cards(equipment_id);
CREATE INDEX idx_sim_msisdn   ON sim_cards(msisdn);

CREATE TABLE sim_movements (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sim_id        uuid NOT NULL REFERENCES sim_cards(id) ON DELETE CASCADE,
    from_type     text,
    to_type       text,
    warehouse_id  uuid REFERENCES warehouses(id),
    holder_id     uuid REFERENCES users(id),
    equipment_id  uuid REFERENCES equipment_items(id),
    source_type   text,                -- maintenance_act | manual | import
    source_id     uuid,
    performed_by  uuid REFERENCES users(id),
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_simmov_sim ON sim_movements(sim_id);
```

### Домен 5. Сервисный контур

```sql
CREATE TABLE tickets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number      text NOT NULL UNIQUE,
    client_id   uuid REFERENCES clients(id),
    contact     text,
    channel     text CHECK (channel IN ('phone','whatsapp','telegram','email','site','manual')),
    subject     text,
    description text,
    status      text NOT NULL DEFAULT 'new'
                CHECK (status IN ('new','in_progress','on_service','done','rejected')),
    resolution  text CHECK (resolution IN ('remote','service_requests','rejected')),
    assigned_to uuid REFERENCES users(id),
    closed_at   timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tickets IS 'resolution=service_requests: авто-создание заявок ТО по одной на объект; тикет авто-закрывается после выполнения всех связанных заявок.';
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_client ON tickets(client_id);

CREATE TABLE requests (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number         text NOT NULL UNIQUE,
    ticket_id      uuid REFERENCES tickets(id) ON DELETE SET NULL,
    client_id      uuid NOT NULL REFERENCES clients(id),
    object_id      uuid REFERENCES monitoring_objects(id),
    type           text NOT NULL
                   CHECK (type IN ('connect','dismantle','replace','diagnostics','gps_fault',
                          'fuel_sensor_fault','cctv_fault','monitoring_setup','consultation',
                          'training','integration','bi_reporting','commercial',
                          'payment_question','docs_question','other')),
    priority       text NOT NULL DEFAULT 'normal'
                   CHECK (priority IN ('low','normal','high','critical')),
    source         text CHECK (source IN ('phone','whatsapp','telegram','email','site','chat','manual')),
    subject        text,
    description    text,
    status         text NOT NULL DEFAULT 'new'
                   CHECK (status IN ('new','assigned','in_progress','visit_planned',
                          'installer_departed','installer_on_site','working','wait_client',
                          'wait_parts','completed','in_review','closed','overdue','cancelled')),
    manager_id     uuid REFERENCES users(id),
    support_id     uuid REFERENCES users(id),
    installer_id   uuid REFERENCES users(id),
    photo_required boolean NOT NULL DEFAULT false,
    due_at         timestamptz,
    result_comment text,
    closed_at      timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_req_status    ON requests(status);
CREATE INDEX idx_req_type      ON requests(type);
CREATE INDEX idx_req_client    ON requests(client_id);
CREATE INDEX idx_req_installer ON requests(installer_id);
CREATE INDEX idx_req_due       ON requests(due_at);
CREATE INDEX idx_req_created   ON requests(created_at DESC);

CREATE TABLE request_history (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
    action     text NOT NULL,
    detail     text,
    user_id    uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reqhist_request ON request_history(request_id);

CREATE TABLE attachments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type text NOT NULL
                CHECK (entity_type IN ('request','ticket','work_order','maintenance_act',
                       'billing_document','equipment_repair_doc','client','monitoring_object')),
    entity_id   uuid NOT NULL,
    kind        text NOT NULL DEFAULT 'photo'
                CHECK (kind IN ('photo','document','signature','audio')),
    place       text,                  -- место фотофиксации из вида работ («кабина», «бак», ...)
    filename    text,
    url         text NOT NULL,
    uploaded_by uuid REFERENCES users(id),
    created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE attachments IS 'Полиморфные вложения (FK не навешивается). kind=signature — подпись клиента с экрана PWA в акте ТО.';
CREATE INDEX idx_att_entity ON attachments(entity_type, entity_id);

CREATE TABLE work_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number          text NOT NULL UNIQUE,
    client_id       uuid REFERENCES clients(id),
    object_id       uuid REFERENCES monitoring_objects(id),
    request_id      uuid REFERENCES requests(id) ON DELETE SET NULL,
    address         text,
    scheduled_start timestamptz,
    scheduled_end   timestamptz,       -- многодневные периоды
    status          text NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('draft','planned','in_progress','done','rework','cancelled')),
    logist_id       uuid REFERENCES users(id),
    note            text,
    created_by      uuid REFERENCES users(id),
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN work_orders.address IS 'Автоподстановка по прошлым выездам к этому клиенту/объекту.';
CREATE INDEX idx_wo_status   ON work_orders(status);
CREATE INDEX idx_wo_schedule ON work_orders(scheduled_start);
CREATE INDEX idx_wo_client   ON work_orders(client_id);

CREATE TABLE work_order_performers (
    work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    user_id       uuid NOT NULL REFERENCES users(id),
    is_lead       boolean NOT NULL DEFAULT false,
    PRIMARY KEY (work_order_id, user_id)
);
CREATE INDEX idx_wop_user ON work_order_performers(user_id);

CREATE TABLE work_order_trips (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id   uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    date_from       date NOT NULL,
    date_to         date NOT NULL,
    transport       text,
    cost            numeric(14,2) NOT NULL DEFAULT 0,
    include_in_cost boolean NOT NULL DEFAULT true,   -- в стоимость для клиента / только себестоимость
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE maintenance_acts (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number             text UNIQUE,
    work_order_id      uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    status             text NOT NULL DEFAULT 'in_preparation'
                       CHECK (status IN ('in_preparation','done','needs_rework','cancelled')),
    rework_request_id  uuid REFERENCES requests(id),
    client_signer_name text,
    signed_by_client_at timestamptz,
    performed_by       uuid REFERENCES users(id),
    closed_by          uuid REFERENCES users(id),
    closed_at          timestamptz,
    note               text,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE maintenance_acts IS 'Центральный документ: закрытие акта порождает движения оборудования, записи equipment_state_history, списания материалов, SIM-операции и сдельные начисления. Акты из PWA приходят in_preparation; закрывает офис (самозакрытие — отдельное право). needs_rework → авто-наряд (rework_request_id).';
CREATE INDEX idx_act_wo     ON maintenance_acts(work_order_id);
CREATE INDEX idx_act_status ON maintenance_acts(status);

CREATE TABLE maintenance_act_lines (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    act_id                 uuid NOT NULL REFERENCES maintenance_acts(id) ON DELETE CASCADE,
    action                 text NOT NULL
                           CHECK (action IN ('install','replace','dismantle','diagnostics','service')),
    basis                  text
                           CHECK (basis IN ('sales_order','shipped_earlier','write_off',
                                  'warranty','testing','safekeeping')),
    object_id              uuid REFERENCES monitoring_objects(id),
    installed_equipment_id uuid REFERENCES equipment_items(id),
    removed_equipment_id   uuid REFERENCES equipment_items(id),
    work_type_id           uuid REFERENCES work_types(id),
    note                   text,
    created_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE maintenance_act_lines IS 'Матрица действие × основание определяет движения. replace заполняет ОБА поля: installed_ И removed_equipment_id (серии обоих приборов).';
CREATE INDEX idx_actline_act ON maintenance_act_lines(act_id);

CREATE TABLE act_materials (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    act_id          uuid NOT NULL REFERENCES maintenance_acts(id) ON DELETE CASCADE,
    nomenclature_id uuid NOT NULL REFERENCES nomenclature(id),
    quantity        numeric(12,3) NOT NULL,
    by_norm         boolean NOT NULL DEFAULT true,   -- подставлено по норме расхода
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_actmat_act ON act_materials(act_id);

CREATE TABLE act_sim_ops (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    act_id       uuid NOT NULL REFERENCES maintenance_acts(id) ON DELETE CASCADE,
    sim_id       uuid NOT NULL REFERENCES sim_cards(id),
    op           text NOT NULL CHECK (op IN ('install','remove')),
    equipment_id uuid REFERENCES equipment_items(id),
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_actsim_act ON act_sim_ops(act_id);

CREATE TABLE act_works (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    act_id       uuid NOT NULL REFERENCES maintenance_acts(id) ON DELETE CASCADE,
    work_type_id uuid NOT NULL REFERENCES work_types(id),
    performer_id uuid NOT NULL REFERENCES users(id),
    quantity     numeric(12,2) NOT NULL DEFAULT 1,
    rate         numeric(14,2) NOT NULL,
    amount       numeric(14,2) NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE act_works IS 'Расценка фиксируется на момент закрытия акта разрешением work_rates (исполнитель > категория > умолчание) — источник payroll_entries kind=work.';
CREATE INDEX idx_actworks_act       ON act_works(act_id);
CREATE INDEX idx_actworks_performer ON act_works(performer_id);

CREATE TABLE visits (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id uuid REFERENCES work_orders(id) ON DELETE CASCADE,
    request_id    uuid REFERENCES requests(id),   -- legacy-связь для мигрированных данных
    installer_id  uuid NOT NULL REFERENCES users(id),
    planned_at    timestamptz,
    status        text NOT NULL DEFAULT 'assigned'
                  CHECK (status IN ('assigned','en_route','on_site','working','wait_client',
                         'wait_parts','done','cancelled')),
    repeat_of     uuid REFERENCES visits(id),
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (work_order_id IS NOT NULL OR request_id IS NOT NULL)
);
CREATE INDEX idx_visits_installer ON visits(installer_id);
CREATE INDEX idx_visits_wo        ON visits(work_order_id);

CREATE TABLE visit_steps (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    visit_id   uuid NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    step       text NOT NULL
               CHECK (step IN ('accept','depart','arrive','start','finish','cant_do','repeat')),
    lat        double precision,
    lng        double precision,
    user_id    uuid REFERENCES users(id),
    note       text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_vsteps_visit ON visit_steps(visit_id);

-- отложенный FK из домена 4
ALTER TABLE testing_orders
    ADD CONSTRAINT fk_testing_dismantle_request
    FOREIGN KEY (dismantle_request_id) REFERENCES requests(id);
```

### Домен 6. Биллинг и продажи

```sql
CREATE TABLE tariff_plans (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    name_kk    text,
    currency   text NOT NULL DEFAULT 'KZT',
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tariff_plans IS 'Назначенный клиенту/объекту план приоритетнее произвольных тарифов (tariffs).';

CREATE TABLE tariff_plan_items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
    method       text NOT NULL CHECK (method IN ('activity','subscription','one_time')),
    name         text,
    amount       numeric(14,2) NOT NULL,
    vat_included boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients
    ADD CONSTRAINT fk_clients_tariff_plan FOREIGN KEY (tariff_plan_id) REFERENCES tariff_plans(id);
ALTER TABLE monitoring_objects
    ADD CONSTRAINT fk_mobj_tariff_plan FOREIGN KEY (tariff_plan_id) REFERENCES tariff_plans(id);

CREATE TABLE tariffs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level         text NOT NULL CHECK (level IN ('default','category','client','object')),
    category_id   uuid REFERENCES service_categories(id),
    client_id     uuid REFERENCES clients(id),
    object_id     uuid REFERENCES monitoring_objects(id),
    method        text NOT NULL DEFAULT 'activity'
                  CHECK (method IN ('activity','subscription','one_time')),
    amount        numeric(14,2) NOT NULL DEFAULT 0,
    vat_included  boolean NOT NULL DEFAULT true,
    do_not_charge boolean NOT NULL DEFAULT false,
    currency      text NOT NULL DEFAULT 'KZT',
    valid_from    date NOT NULL DEFAULT CURRENT_DATE,
    valid_to      date,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (level = 'default'  AND category_id IS NULL     AND client_id IS NULL     AND object_id IS NULL) OR
        (level = 'category' AND category_id IS NOT NULL AND client_id IS NULL     AND object_id IS NULL) OR
        (level = 'client'   AND client_id IS NOT NULL   AND object_id IS NULL) OR
        (level = 'object'   AND object_id IS NOT NULL)
    )
);
COMMENT ON TABLE tariffs IS 'Иерархия разрешения (в приложении): объект > клиент > категория обслуживания > умолчание. do_not_charge — явный «нулевой» тариф. Смена среди месяца → два интервала начислений.';
CREATE INDEX idx_tariffs_level  ON tariffs(level, category_id, client_id, object_id);
CREATE INDEX idx_tariffs_period ON tariffs(valid_from, valid_to) WHERE is_active;

CREATE TABLE billing_documents (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number            text UNIQUE,
    kind              text NOT NULL CHECK (kind IN ('advance_invoice','act','one_time_invoice')),
    scheme            text NOT NULL CHECK (scheme IN ('advance','credit')),
    client_id         uuid NOT NULL REFERENCES clients(id),
    counterparty_id   uuid REFERENCES counterparties(id),
    contract_id       uuid REFERENCES contracts(id),
    own_org_id        uuid REFERENCES own_organizations(id),
    period_start      date,
    period_end        date,
    subtotal          numeric(14,2) NOT NULL DEFAULT 0,
    extra_charge      numeric(14,2) NOT NULL DEFAULT 0,
    discount_amount   numeric(14,2) NOT NULL DEFAULT 0,
    prepaid_amount    numeric(14,2) NOT NULL DEFAULT 0,
    vat_rate          numeric(5,2),
    vat_amount        numeric(14,2) NOT NULL DEFAULT 0,
    total             numeric(14,2) NOT NULL DEFAULT 0,
    paid_amount       numeric(14,2) NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'to_accrue'
                      CHECK (status IN ('to_accrue','prepared','issued','sent','partial',
                             'paid','overdue','cancelled')),
    planned_issue_date date,
    issued_at         timestamptz,
    sent_at           timestamptz,
    manager_id        uuid REFERENCES users(id),
    accountant_id     uuid REFERENCES users(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE billing_documents IS 'Авансовая схема: advance_invoice в начале месяца (по состоянию на начало), act в конце: total = subtotal(факт) + extra_charge(доначисление) − discount_amount − prepaid_amount. Кредитная: только act. vat_rate — снэпшот из vat_rates на дату оборота. Печатные формы (счёт, расшифровка, АВР Р-1) — PDF из этих данных + accruals.';
CREATE INDEX idx_bdoc_client_status ON billing_documents(client_id, status);
CREATE INDEX idx_bdoc_period        ON billing_documents(period_start, period_end);
CREATE INDEX idx_bdoc_status        ON billing_documents(status);

CREATE TABLE discounts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    uuid NOT NULL REFERENCES clients(id),
    name         text,
    total_amount numeric(14,2) NOT NULL,
    used_amount  numeric(14,2) NOT NULL DEFAULT 0,
    valid_from   date NOT NULL DEFAULT CURRENT_DATE,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (used_amount <= total_amount)
);
COMMENT ON TABLE discounts IS 'Скидка фиксированной суммой, списывается помесячно в расчётных документах до исчерпания.';
CREATE INDEX idx_discounts_client ON discounts(client_id) WHERE is_active;

CREATE TABLE discount_applications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id         uuid NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    billing_document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
    amount              numeric(14,2) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accruals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
    client_id           uuid NOT NULL REFERENCES clients(id),
    object_id           uuid REFERENCES monitoring_objects(id),
    equipment_id        uuid REFERENCES equipment_items(id),
    tariff_id           uuid REFERENCES tariffs(id),
    tariff_plan_item_id uuid REFERENCES tariff_plan_items(id),
    method              text NOT NULL CHECK (method IN ('activity','subscription','one_time')),
    date_from           date NOT NULL,
    date_to             date NOT NULL,
    days                int,
    amount              numeric(14,2) NOT NULL,
    vat_amount          numeric(14,2) NOT NULL DEFAULT 0,
    status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','billed','cancelled')),
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE accruals IS 'Строка «расшифровки абонплаты по объектам». method=activity: посуточный факт из equipment_state_history (дни по Asia/Almaty); субпериоды при смене тарифа/состояния среди месяца.';
CREATE INDEX idx_accr_doc           ON accruals(billing_document_id);
CREATE INDEX idx_accr_client_period ON accruals(client_id, date_from);
CREATE INDEX idx_accr_object        ON accruals(object_id);

CREATE TABLE payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES clients(id),
    billing_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
    amount              numeric(14,2) NOT NULL,
    paid_at             timestamptz NOT NULL DEFAULT now(),
    method              text CHECK (method IN ('bank','cash','card','offset')),
    bank_reference      text,
    note                text,
    created_by          uuid REFERENCES users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payments IS 'Ведомость расчётов (долги/авансы) = агрегат billing_documents − payments по клиенту; она же — вход автоблокировки должников.';
CREATE INDEX idx_pay_client ON payments(client_id, paid_at DESC);

CREATE TABLE sales_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number          text NOT NULL UNIQUE,
    client_id       uuid NOT NULL REFERENCES clients(id),
    counterparty_id uuid REFERENCES counterparties(id),
    contract_id     uuid REFERENCES contracts(id),
    own_org_id      uuid REFERENCES own_organizations(id),
    warehouse_id    uuid REFERENCES warehouses(id),
    shipment_order  text NOT NULL DEFAULT 'on_install'
                    CHECK (shipment_order IN ('no_install','on_install','before_install')),
    status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','invoiced','paid','in_service','realized','cancelled')),
    manager_id      uuid REFERENCES users(id),
    total_amount    numeric(14,2) NOT NULL DEFAULT 0,
    vat_rate        numeric(5,2),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN sales_orders.shipment_order IS 'no_install: отгрузка сразу; on_install: реализация после акта ТО; before_install: счёт и закрывающие до монтажа (бюджетники ГУ/КГП).';
CREATE INDEX idx_so_client ON sales_orders(client_id);
CREATE INDEX idx_so_status ON sales_orders(status);

CREATE TABLE sales_order_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    nomenclature_id uuid REFERENCES nomenclature(id),
    name            text NOT NULL,
    is_service      boolean NOT NULL DEFAULT false,
    quantity        numeric(12,3) NOT NULL DEFAULT 1,
    price           numeric(14,2) NOT NULL DEFAULT 0,
    object_id       uuid REFERENCES monitoring_objects(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_soi_order ON sales_order_items(order_id);

CREATE TABLE sales_invoices (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('invoice','realization','waybill')),
    number     text,
    amount     numeric(14,2) NOT NULL DEFAULT 0,
    issued_at  timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN sales_invoices.kind IS 'invoice — счёт на оплату; realization — реализация/АВР (Р-1) по работам и услугам; waybill — накладная на отпуск запасов (З-2) по оборудованию.';

-- отложенный FK из домена 4
ALTER TABLE testing_orders
    ADD CONSTRAINT fk_testing_sales_order
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
```

### Домен 7. Сдельная ЗП

```sql
CREATE TABLE performer_categories (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    note       text,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE performer_category_assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id),
    category_id uuid NOT NULL REFERENCES performer_categories(id),
    valid_from  date NOT NULL DEFAULT CURRENT_DATE,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pca_user ON performer_category_assignments(user_id, valid_from DESC);

CREATE TABLE work_rates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope        text NOT NULL CHECK (scope IN ('default','category','performer')),
    category_id  uuid REFERENCES performer_categories(id),
    user_id      uuid REFERENCES users(id),
    work_type_id uuid NOT NULL REFERENCES work_types(id),
    rate         numeric(14,2) NOT NULL,
    valid_from   date NOT NULL DEFAULT CURRENT_DATE,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (scope = 'default'   AND category_id IS NULL     AND user_id IS NULL) OR
        (scope = 'category'  AND category_id IS NOT NULL AND user_id IS NULL) OR
        (scope = 'performer' AND user_id IS NOT NULL)
    )
);
COMMENT ON TABLE work_rates IS 'Разрешение расценки: исполнитель > категория > умолчание (default в work_types.default_rate как последний фолбэк).';
CREATE INDEX idx_wrates_scope ON work_rates(scope, work_type_id) WHERE is_active;

CREATE TABLE payroll_rules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    scope           text NOT NULL DEFAULT 'default'
                    CHECK (scope IN ('default','category','performer')),
    category_id     uuid REFERENCES performer_categories(id),
    user_id         uuid REFERENCES users(id),
    salary          numeric(14,2) NOT NULL DEFAULT 0,
    norm_count      int NOT NULL DEFAULT 0,
    piece_over_norm boolean NOT NULL DEFAULT false,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payroll_rules IS 'Схема «оклад за норму N монтажей + сделка сверх порога»: salary покрывает первые norm_count работ; при piece_over_norm сверх нормы платится сделка по work_rates.';

CREATE TABLE payroll_sheets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start date NOT NULL,
    period_end   date NOT NULL,
    status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
    note         text,
    created_by   uuid REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payroll_sheets IS 'Расчёт за месяц или полмесяца — period_start/period_end задают вариант.';

CREATE TABLE payroll_sheet_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_id            uuid NOT NULL REFERENCES payroll_sheets(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id),
    acts_count          int NOT NULL DEFAULT 0,
    work_amount         numeric(14,2) NOT NULL DEFAULT 0,
    salary_amount       numeric(14,2) NOT NULL DEFAULT 0,
    bonus_amount        numeric(14,2) NOT NULL DEFAULT 0,
    compensation_amount numeric(14,2) NOT NULL DEFAULT 0,
    deduction_amount    numeric(14,2) NOT NULL DEFAULT 0,
    total               numeric(14,2) NOT NULL DEFAULT 0,
    threshold_met       boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sheet_id, user_id)
);

CREATE TABLE payroll_entries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id),
    entry_date    date NOT NULL DEFAULT CURRENT_DATE,
    kind          text NOT NULL CHECK (kind IN ('work','compensation','deduction')),
    act_work_id   uuid REFERENCES act_works(id) ON DELETE SET NULL,
    reason        text,                -- ГСМ, амортизация, штраф за ошибку...
    amount        numeric(14,2) NOT NULL,
    sheet_line_id uuid REFERENCES payroll_sheet_lines(id) ON DELETE SET NULL,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payroll_entries IS 'Единый регистр: kind=work создаётся при закрытии акта (из act_works), компенсации/удержания — вручную; sheet_line_id ставится при включении в расчёт.';
CREATE INDEX idx_pentries_user     ON payroll_entries(user_id, entry_date);
CREATE INDEX idx_pentries_unlinked ON payroll_entries(user_id) WHERE sheet_line_id IS NULL;
```

### Домен 8. Интеграция с телематикой

```sql
CREATE TABLE telematics_servers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    server_type       text NOT NULL DEFAULT 'omnicomm'
                      CHECK (server_type IN ('omnicomm','wialon')),
    base_url          text NOT NULL,
    auth_login        text,
    auth_secret       text,
    is_active         boolean NOT NULL DEFAULT true,
    health_status     text NOT NULL DEFAULT 'unknown'
                      CHECK (health_status IN ('ok','degraded','down','unknown')),
    health_checked_at timestamptz,
    note              text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN telematics_servers.health_status IS 'Health-проба перед каждой sync-операцией (учётки Omnicomm деградируют под нагрузкой); auth_secret хранить шифрованным (ключ в env).';

CREATE TABLE telematics_accounts (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id          uuid NOT NULL REFERENCES telematics_servers(id) ON DELETE CASCADE,
    client_id          uuid REFERENCES clients(id),
    login              text,
    external_id        text,
    auto_block_debtors boolean NOT NULL DEFAULT false,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE telematics_accounts IS 'Учётная запись клиента в системе мониторинга; auto_block_debtors — «блокировать при задолженности автоматически» (как в карточке учётки СМ Аскан).';

CREATE TABLE telematics_object_links (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id              uuid NOT NULL REFERENCES telematics_servers(id) ON DELETE CASCADE,
    account_id             uuid REFERENCES telematics_accounts(id),
    object_id              uuid NOT NULL REFERENCES monitoring_objects(id),
    equipment_id           uuid REFERENCES equipment_items(id),
    external_uuid          text NOT NULL,
    external_name          text,
    sync_status            text NOT NULL DEFAULT 'pending'
                           CHECK (sync_status IN ('synced','pending','error','pending_delete','deleted')),
    data_reception_enabled boolean NOT NULL DEFAULT true,
    profile_backup         jsonb,
    profile_backup_at      timestamptz,
    last_synced_at         timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (server_id, external_uuid)
);
COMMENT ON COLUMN telematics_object_links.data_reception_enabled IS 'Консервация → «приём данных выключен» в Omnicomm.';
COMMENT ON COLUMN telematics_object_links.sync_status IS 'pending_delete — двухэтапное удаление: объект попадает в список «к удалению», фактическое удаление — отдельным правом.';
COMMENT ON COLUMN telematics_object_links.profile_backup IS 'Резерв настроек объекта (экспорт профиля) перед удалением — для восстановления.';
CREATE INDEX idx_tol_object ON telematics_object_links(object_id);
CREATE INDEX idx_tol_status ON telematics_object_links(sync_status);

CREATE TABLE sync_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id     uuid REFERENCES telematics_servers(id) ON DELETE SET NULL,
    operation     text NOT NULL,       -- create_object, disable_reception, delete, block, unblock, import, health
    entity_type   text,
    entity_id     uuid,
    status        text NOT NULL CHECK (status IN ('ok','error')),
    error_message text,
    payload       jsonb,
    duration_ms   int,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_synclog_server  ON sync_log(server_id, created_at DESC);
CREATE INDEX idx_synclog_errors  ON sync_log(created_at DESC) WHERE status = 'error';

CREATE TABLE blocking_rules (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name               text NOT NULL,
    scope              text NOT NULL DEFAULT 'default'
                       CHECK (scope IN ('default','category','client')),
    category_id        uuid REFERENCES service_categories(id),
    client_id          uuid REFERENCES clients(id),
    advance_grace_days int NOT NULL DEFAULT 0,
    credit_grace_days  int NOT NULL DEFAULT 0,
    allowed_debt       numeric(14,2) NOT NULL DEFAULT 0,
    warn_days_before   int NOT NULL DEFAULT 3,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE blocking_rules IS 'Дни отсрочки задаются отдельно для авансовой и кредитной схем; долг сверх allowed_debt после отсрочки → предупреждение (email+сообщение), затем блокировка в СМ.';

CREATE TABLE blocking_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id       uuid REFERENCES blocking_rules(id) ON DELETE SET NULL,
    client_id     uuid NOT NULL REFERENCES clients(id),
    object_id     uuid REFERENCES monitoring_objects(id),
    link_id       uuid REFERENCES telematics_object_links(id),
    action        text NOT NULL CHECK (action IN ('warning','block','unblock','manual_unblock')),
    debt_amount   numeric(14,2),
    unblock_until date,                -- ручная разблокировка «до даты»
    performed_by  uuid REFERENCES users(id),   -- NULL = автоматически
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_blkev_client  ON blocking_events(client_id, created_at DESC);
CREATE INDEX idx_blkev_created ON blocking_events(created_at DESC);
```

### Домен 9. Коммуникации и уведомления

```sql
CREATE TABLE calls (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direction     text NOT NULL CHECK (direction IN ('incoming','outgoing','missed')),
    phone         text NOT NULL,
    client_id     uuid REFERENCES clients(id),
    request_id    uuid REFERENCES requests(id) ON DELETE SET NULL,
    ticket_id     uuid REFERENCES tickets(id) ON DELETE SET NULL,
    user_id       uuid REFERENCES users(id),
    duration_sec  int NOT NULL DEFAULT 0,
    recording_url text,
    result        text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_phone   ON calls(phone);
CREATE INDEX idx_calls_client  ON calls(client_id);
CREATE INDEX idx_calls_created ON calls(created_at DESC);

CREATE TABLE messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel     text NOT NULL CHECK (channel IN ('whatsapp','telegram','email','site','chat','sms')),
    direction   text NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
    contact     text,
    client_id   uuid REFERENCES clients(id),
    request_id  uuid REFERENCES requests(id) ON DELETE SET NULL,
    ticket_id   uuid REFERENCES tickets(id) ON DELETE SET NULL,
    text        text,
    external_id text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_client  ON messages(client_id);
CREATE INDEX idx_msg_contact ON messages(contact);
CREATE INDEX idx_msg_created ON messages(created_at DESC);

CREATE TABLE notification_templates (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,   -- billing_doc_email, block_warning, ...
    channel    text NOT NULL CHECK (channel IN ('email','telegram','whatsapp','web_push','sms')),
    subject_ru text,
    subject_kk text,
    body_ru    text NOT NULL,
    body_kk    text,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_queue (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel         text NOT NULL CHECK (channel IN ('email','telegram','whatsapp','web_push','sms')),
    recipient       text NOT NULL,
    template_code   text,
    subject         text,
    body            text,
    attachments     jsonb,             -- [{url, filename}] — PDF расчётных документов
    entity_type     text,
    entity_id       uuid,
    status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sending','sent','failed','cancelled')),
    attempts        int NOT NULL DEFAULT 0,
    next_attempt_at timestamptz,
    sent_at         timestamptz,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE notification_queue IS 'Рассылка партиями (cron-воркер): массовые расчётные документы, предупреждения о блокировке; ретраи с next_attempt_at.';
CREATE INDEX idx_nq_pending ON notification_queue(next_attempt_at) WHERE status IN ('queued','failed');

CREATE TABLE push_subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   text NOT NULL UNIQUE,
    keys       jsonb NOT NULL,          -- {p256dh, auth}
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);
```

### Финализация: триггеры updated_at

```sql
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
```

---

## Миграция данных: SQLite (crm-backend) → PostgreSQL

Техника: на время миграции в целевые таблицы добавляется временная колонка `legacy_id int`
(crosswalk старых INTEGER PK → UUID для восстановления FK-связей), после проверки — удаляется.
Русские статусы/типы перекодируются в машинные коды (карты ниже). Прогонять на копии прода;
секвенций-ресинк не нужен (PK — UUID), но нумераторы `seq_*_number` выставить на max(number)+1.

| SQLite-таблица | Целевая таблица | Примечания |
|---|---|---|
| `roles` | `roles` | коды как есть |
| `users` | `users` | `active`→`is_active`; `installer_status` рус → коды (`свободен`→`free`, …) |
| `clients` | `clients` + `counterparties` (+`counterparty_bank_accounts`) | при наличии `bin_iin` создаётся контрагент 1:1; банковские реквизиты добиваются вручную |
| `objects` | `monitoring_objects` | `name` парсится на brand/reg_number где возможно, оригинал сохраняется в `name` |
| `requests` | `requests` | рус. типы/статусы → коды (карта соответствия = migration-020 liftplatform); `priority` `Обычный`→`normal` |
| `request_history` | `request_history` | 1:1 |
| `attachments` | `attachments` | `entity_type='request'`, `entity_id` = новый UUID заявки; `kind` нормализуется |
| `visits` | `visits` | остаётся `request_id` (legacy-связь); `work_order_id` NULL |
| `visit_steps` | `visit_steps` | 1:1 |
| `calls` | `calls` | 1:1 |
| `messages` | `messages` | `direction` `in/out` совпадает |
| `warehouses` | `warehouses` | `type` расширен; holder переносится |
| `equipment` | `equipment_items` (+`nomenclature`, +`equipment_state_history`) | `model`/`eq_type` → записи `nomenclature(kind='equipment')`; `status='active'` → `status='installed'`, `billing_state='active'` + стартовая запись в `equipment_state_history` (valid_from = дата акта либо `created_at`) |
| `sales_orders` | `sales_orders` | `shipment_order`, `status` — коды совпадают |
| `sales_order_items` | `sales_order_items` | `qty`→`quantity`; связка `nomenclature_id` по имени, где найдётся |
| `work_orders` | `work_orders` | `planned_at` → `scheduled_start`; исполнитель заявки → `work_order_performers` |
| `maintenance_acts` | `maintenance_acts` | `status='done'` как есть; `equipment_activated=1` + `billing_started_at` → запись `equipment_state_history(state='active')` |
| `subscription_plans` | `tariffs` | `level='client'`, `method='subscription'`, `valid_from=created_at::date`; `active`→`is_active` |
| `subscription_invoices` | `billing_documents` + `accruals` | `kind='act'`, `scheme='credit'`; одна строка `accruals(method='subscription')` на период; статусы `issued/paid/partial/overdue` совпадают |
| `sim_cards` | `sim_cards` | `serial`→`icc`; `operator` (текст) → FK на предзаполненный `sim_operators` |

Новые таблицы без источника данных (заполняются на этапах 0–2): справочники РК
(`vat_rates`: 12% c 1900-01-01, 16% с 2026-01-01; `sim_operators`; `own_organizations`),
тикеты, тарифные планы, скидки, платежи, ЗП, интеграция, очередь уведомлений.
