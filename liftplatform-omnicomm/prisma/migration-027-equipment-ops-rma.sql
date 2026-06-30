-- Migration 027 (Vendor-gap): операции с оборудованием клиента + RMA.
-- Из демо: установка состояния, перевод, снятие с учёта, регистрация, приём от клиента,
-- передача поставщику, выдача/получение.

-- журнал клиентских операций (формальные документы из демо вендора)
CREATE TABLE IF NOT EXISTS equipment_client_ops (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id    UUID NOT NULL REFERENCES equipment(id),
    op_type         VARCHAR(30) NOT NULL CHECK (op_type IN
                    ('set_state','transfer','deregister','register','receive_from_client','send_to_supplier','return_to_client','receive_from_supplier')),
    new_state       VARCHAR(20),                     -- active/disabled (вкл/выкл абонплату)
    new_org         UUID REFERENCES organizations(id),
    new_contract    UUID REFERENCES service_contracts(id),
    new_object      UUID REFERENCES elevators(id),
    supplier_name   VARCHAR(255),
    billing_effect  VARCHAR(20),                     -- start/stop/none
    monitoring_sync BOOLEAN DEFAULT FALSE,           -- перегрузка в систему мониторинга
    reason          TEXT,
    reg_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    user_id         UUID REFERENCES users(id),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ecops_eq ON equipment_client_ops(equipment_id);
CREATE INDEX IF NOT EXISTS idx_ecops_type ON equipment_client_ops(op_type);
