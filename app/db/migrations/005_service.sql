-- Домен 5. Сервисный контур

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
