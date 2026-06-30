-- Migration 022 (Omnicomm/Blueprint): учёт оборудования и склад+исполнитель.
-- Закрывает разделы 4-5 Blueprint: статусы Новое/Б/У/демо, измерение «Склад + Исполнитель».

CREATE TABLE IF NOT EXISTS warehouses (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    type        VARCHAR(20) NOT NULL DEFAULT 'physical'
                CHECK (type IN ('physical','virtual','technician','client')),
    holder_id   UUID REFERENCES users(id),          -- для склада техника
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS equipment (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model           VARCHAR(255) NOT NULL,
    serial_number   VARCHAR(100) UNIQUE,
    eq_type         VARCHAR(40),                     -- gps, fuel_sensor, cctv ...
    status          VARCHAR(20) NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','used','demo','active','written_off')),
    warehouse_id    UUID REFERENCES warehouses(id),  -- где числится (склад)
    holder_id       UUID REFERENCES users(id),       -- за кем закреплено (исполнитель)
    organization_id UUID REFERENCES organizations(id), -- клиент (после установки)
    object_id       UUID REFERENCES elevators(id),     -- объект установки
    contract_id     UUID REFERENCES service_contracts(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- история перемещений (склад↔техник↔клиент), смена статуса/договора/контрагента
CREATE TABLE IF NOT EXISTS equipment_movements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    from_warehouse  UUID REFERENCES warehouses(id),
    to_warehouse    UUID REFERENCES warehouses(id),
    from_holder     UUID REFERENCES users(id),
    to_holder       UUID REFERENCES users(id),
    new_status      VARCHAR(20),
    reason          VARCHAR(50),                      -- assign, install, dismantle, resell, write_off, demo
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eq_status   ON equipment(status);
CREATE INDEX IF NOT EXISTS idx_eq_holder   ON equipment(holder_id);
CREATE INDEX IF NOT EXISTS idx_eq_org      ON equipment(organization_id);
CREATE INDEX IF NOT EXISTS idx_eqmov_eq    ON equipment_movements(equipment_id);
