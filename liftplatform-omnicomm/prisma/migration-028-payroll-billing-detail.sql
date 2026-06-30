-- Migration 028 (Vendor-gap): детальная сделка и абонплата.
-- Из демо: категории исполнителей, расценки (контракт/категория/исполнитель),
-- компенсации, удержания, оклад+порог; скидки абонплаты, системы расчётов (аванс/кредит).

CREATE TABLE IF NOT EXISTS performer_categories (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    category    VARCHAR(100) NOT NULL,
    valid_from  DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS work_rates (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope         VARCHAR(20) NOT NULL CHECK (scope IN ('contract','category','performer')),
    category      VARCHAR(100),
    user_id       UUID REFERENCES users(id),
    work_type     VARCHAR(255) NOT NULL,
    rate          NUMERIC(14,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS performer_compensations (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    kind        VARCHAR(50) NOT NULL,                -- ГСМ, амортизация ...
    amount      NUMERIC(14,2) NOT NULL,
    period      DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE IF NOT EXISTS performer_deductions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    kind        VARCHAR(50) NOT NULL,                -- штраф за ошибку ...
    amount      NUMERIC(14,2) NOT NULL,
    period      DATE NOT NULL DEFAULT CURRENT_DATE
);

-- оклад + порог сделки сверх оклада (вопрос из демо)
ALTER TABLE payroll_rules ADD COLUMN IF NOT EXISTS salary NUMERIC(14,2) NOT NULL DEFAULT 0;
ALTER TABLE payroll_rules ADD COLUMN IF NOT EXISTS piece_after_threshold BOOLEAN NOT NULL DEFAULT FALSE;

-- скидки на абонплату (списываются помесячно до исчерпания)
CREATE TABLE IF NOT EXISTS subscription_discounts (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id),
    total_amount    NUMERIC(14,2) NOT NULL,
    used_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
    valid_from      DATE NOT NULL DEFAULT CURRENT_DATE,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

-- система расчётов клиента: авансовая/кредитная + периодичность
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_scheme VARCHAR(20) DEFAULT 'credit'
    CHECK (billing_scheme IN ('advance','credit'));
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_period VARCHAR(20) DEFAULT 'month';

CREATE INDEX IF NOT EXISTS idx_wrates_scope ON work_rates(scope);
CREATE INDEX IF NOT EXISTS idx_subdisc_org ON subscription_discounts(organization_id);
