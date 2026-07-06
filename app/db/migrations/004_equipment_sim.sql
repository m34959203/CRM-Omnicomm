-- Домен 4. Оборудование и SIM

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
