-- Migration 025 (Vendor-gap): sales-контур — заказ клиента, порядок отгрузки, реализация.
-- Из демо вендора: заказ → счёт → 3 порядка отгрузки (без/при/до установки) → реализация.

CREATE TABLE IF NOT EXISTS sales_orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    number          VARCHAR(20) UNIQUE,
    organization_id UUID NOT NULL REFERENCES organizations(id),
    seller_org      VARCHAR(255),                    -- от какой организации продаём
    warehouse_id    UUID REFERENCES warehouses(id),
    shipment_order  VARCHAR(20) NOT NULL DEFAULT 'on_install'
                    CHECK (shipment_order IN ('no_install','on_install','before_install')),
    -- no_install: отгрузка сразу; on_install: реализация после Акта ТО; before_install: документы авансом
    status          VARCHAR(20) NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','invoiced','paid','in_service','realized','cancelled')),
    manager_id      UUID REFERENCES users(id),
    total_amount    NUMERIC(14,2) DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sales_order_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    name          VARCHAR(255) NOT NULL,
    is_service    BOOLEAN NOT NULL DEFAULT FALSE,
    quantity      NUMERIC(12,2) NOT NULL DEFAULT 1,
    price         NUMERIC(14,2) NOT NULL DEFAULT 0,
    object_id     UUID REFERENCES elevators(id)       -- распределение по объекту обслуживания
);

-- реализация (закрытие продажи) и счёт
CREATE TABLE IF NOT EXISTS sales_invoices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id      UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    kind          VARCHAR(20) NOT NULL CHECK (kind IN ('invoice','realization')),
    amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    issued_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_so_org ON sales_orders(organization_id);
CREATE INDEX IF NOT EXISTS idx_so_status ON sales_orders(status);
CREATE SEQUENCE IF NOT EXISTS sales_order_seq START 1;
