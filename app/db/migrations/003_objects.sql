-- Домен 3. Объекты мониторинга

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
