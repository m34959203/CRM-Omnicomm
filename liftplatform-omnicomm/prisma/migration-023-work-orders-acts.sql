-- Migration 023 (Omnicomm/Blueprint): заказ-наряды, Акт ТО (триггер биллинга), списания.
-- Закрывает разделы 3-4 Blueprint: Field Service, Акт ТО, рекурсивная «доработка», материалы.

CREATE TABLE IF NOT EXISTS work_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number          VARCHAR(20) UNIQUE,
    organization_id UUID REFERENCES organizations(id),
    object_id       UUID REFERENCES elevators(id),
    incident_id     UUID REFERENCES incidents(id) ON DELETE SET NULL,
    address         TEXT,
    scheduled_start TIMESTAMPTZ,
    scheduled_end   TIMESTAMPTZ,                      -- поддержка многодневных
    status          VARCHAR(20) NOT NULL DEFAULT 'planned'
                    CHECK (status IN ('planned','in_progress','done','rework','cancelled')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- бригада: несколько исполнителей на наряд
CREATE TABLE IF NOT EXISTS work_order_performers (
    work_order_id   UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id),
    PRIMARY KEY (work_order_id, user_id)
);

-- Акт технического обслуживания — связь монтажа и биллинга
CREATE TABLE IF NOT EXISTS maintenance_acts (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    work_order_id       UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    status              VARCHAR(20) NOT NULL DEFAULT 'done'
                        CHECK (status IN ('done','needs_rework')),
    equipment_activated BOOLEAN NOT NULL DEFAULT FALSE, -- статус оборудования «Активен»
    billing_started_at  TIMESTAMPTZ,                    -- момент запуска абонплаты
    monitoring_synced   BOOLEAN NOT NULL DEFAULT FALSE, -- активация в Wialon/Omnicomm
    rework_incident_id  UUID REFERENCES incidents(id),  -- авто-заявка при доработке
    performed_by        UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- списание материалов (пломбы, кабели, SIM) на основании Акта
CREATE TABLE IF NOT EXISTS material_writeoffs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    act_id        UUID NOT NULL REFERENCES maintenance_acts(id) ON DELETE CASCADE,
    material_name VARCHAR(255) NOT NULL,
    quantity      NUMERIC(12,2) NOT NULL DEFAULT 1,
    equipment_id  UUID REFERENCES equipment(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wo_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_wo_org    ON work_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_act_wo    ON maintenance_acts(work_order_id);
CREATE SEQUENCE IF NOT EXISTS work_order_seq START 1;
