-- Migration 019 (Omnicomm): Subscription (абонентская плата) billing
-- Закрывает раздел 16 ТЗ. Опирается на service_contracts и organizations LiftPlatform.

CREATE TABLE IF NOT EXISTS subscription_plans (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    contract_id     UUID REFERENCES service_contracts(id) ON DELETE SET NULL,
    amount          NUMERIC(14,2) NOT NULL,
    period          VARCHAR(20) NOT NULL DEFAULT 'month' CHECK (period IN ('month','quarter','custom')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id             UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES organizations(id),
    period_start        DATE NOT NULL,
    period_end          DATE NOT NULL,
    amount              NUMERIC(14,2) NOT NULL,
    paid_amount         NUMERIC(14,2) NOT NULL DEFAULT 0,
    planned_issue_date  DATE,
    issued_at           TIMESTAMPTZ,
    status              VARCHAR(20) NOT NULL DEFAULT 'to_accrue'
                        CHECK (status IN ('to_accrue','prepared','issued','paid','partial','overdue')),
    manager_id          UUID REFERENCES users(id),
    accountant_id       UUID REFERENCES users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_plans_org ON subscription_plans(organization_id);
CREATE INDEX IF NOT EXISTS idx_sub_inv_org ON subscription_invoices(organization_id);
CREATE INDEX IF NOT EXISTS idx_sub_inv_status ON subscription_invoices(status);
CREATE INDEX IF NOT EXISTS idx_sub_inv_period ON subscription_invoices(period_start, period_end);
