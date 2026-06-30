-- Migration 026 (Vendor-gap): учёт SIM-карт (из демо: оприходование, перемещение, остатки).
CREATE TABLE IF NOT EXISTS sim_cards (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    serial_number   VARCHAR(50) UNIQUE,
    msisdn          VARCHAR(30),                     -- абонентский номер
    operator        VARCHAR(100),
    tariff_plan     VARCHAR(100),
    location_type   VARCHAR(20) NOT NULL DEFAULT 'warehouse'
                    CHECK (location_type IN ('warehouse','employee','contractor','equipment')),
    warehouse_id    UUID REFERENCES warehouses(id),
    holder_id       UUID REFERENCES users(id),
    equipment_id    UUID REFERENCES equipment(id),
    status          VARCHAR(20) NOT NULL DEFAULT 'in_stock'
                    CHECK (status IN ('in_stock','assigned','installed','written_off')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sim_movements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sim_id      UUID NOT NULL REFERENCES sim_cards(id) ON DELETE CASCADE,
    from_type   VARCHAR(20), to_type VARCHAR(20),
    holder_id   UUID REFERENCES users(id),
    equipment_id UUID REFERENCES equipment(id),
    user_id     UUID REFERENCES users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sim_status ON sim_cards(status);
CREATE INDEX IF NOT EXISTS idx_sim_loc ON sim_cards(location_type);
