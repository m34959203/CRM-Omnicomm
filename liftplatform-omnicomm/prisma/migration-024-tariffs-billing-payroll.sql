-- Migration 024 (Omnicomm/Blueprint): иерархия тарифов, биллинг по активности, мотивация.
-- Закрывает раздел 6 Blueprint: тарифы, MRR, сдельная оплата техников.

-- Иерархия тарифов: общий → на клиента → на объект
CREATE TABLE IF NOT EXISTS tariffs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    level           VARCHAR(10) NOT NULL CHECK (level IN ('general','client','object')),
    organization_id UUID REFERENCES organizations(id),  -- для level=client/object
    object_id       UUID REFERENCES elevators(id),       -- для level=object
    method          VARCHAR(20) NOT NULL DEFAULT 'subscription'
                    CHECK (method IN ('activity','subscription','one_time')),
    amount          NUMERIC(14,2) NOT NULL,
    period          VARCHAR(20) DEFAULT 'month',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- учёт активности оборудования (для биллинга «по дням Активен»)
CREATE TABLE IF NOT EXISTS equipment_activity (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    equipment_id  UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
    active_from   DATE NOT NULL,
    active_to     DATE,
    days_active   INT GENERATED ALWAYS AS (
                    GREATEST(0, COALESCE(active_to, CURRENT_DATE) - active_from)) STORED,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- мотивация техников: сдельная по закрытым Актам + пороги + компенсации
CREATE TABLE IF NOT EXISTS payroll_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    base_rate       NUMERIC(12,2) NOT NULL,        -- ставка за акт
    threshold_count INT DEFAULT 0,                 -- порог инсталляций
    bonus_rate      NUMERIC(12,2) DEFAULT 0,       -- ставка сверх порога
    is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS technician_payroll (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID NOT NULL REFERENCES users(id),
    period_start  DATE NOT NULL,
    period_end    DATE NOT NULL,
    acts_count    INT NOT NULL DEFAULT 0,
    base_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
    bonus_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
    fuel_comp     NUMERIC(14,2) NOT NULL DEFAULT 0,  -- ГСМ
    deductions    NUMERIC(14,2) NOT NULL DEFAULT 0,  -- удержания за ошибки
    total         NUMERIC(14,2) NOT NULL DEFAULT 0,
    threshold_met BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tariffs_level ON tariffs(level, organization_id, object_id);
CREATE INDEX IF NOT EXISTS idx_eqact_eq ON equipment_activity(equipment_id);
CREATE INDEX IF NOT EXISTS idx_payroll_user ON technician_payroll(user_id, period_start);
