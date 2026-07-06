-- Домен 7. Сдельная ЗП

CREATE TABLE performer_categories (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    note       text,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE performer_category_assignments (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES users(id),
    category_id uuid NOT NULL REFERENCES performer_categories(id),
    valid_from  date NOT NULL DEFAULT CURRENT_DATE,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pca_user ON performer_category_assignments(user_id, valid_from DESC);

CREATE TABLE work_rates (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope        text NOT NULL CHECK (scope IN ('default','category','performer')),
    category_id  uuid REFERENCES performer_categories(id),
    user_id      uuid REFERENCES users(id),
    work_type_id uuid NOT NULL REFERENCES work_types(id),
    rate         numeric(14,2) NOT NULL,
    valid_from   date NOT NULL DEFAULT CURRENT_DATE,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (scope = 'default'   AND category_id IS NULL     AND user_id IS NULL) OR
        (scope = 'category'  AND category_id IS NOT NULL AND user_id IS NULL) OR
        (scope = 'performer' AND user_id IS NOT NULL)
    )
);
COMMENT ON TABLE work_rates IS 'Разрешение расценки: исполнитель > категория > умолчание (default в work_types.default_rate как последний фолбэк).';
CREATE INDEX idx_wrates_scope ON work_rates(scope, work_type_id) WHERE is_active;

CREATE TABLE payroll_rules (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    scope           text NOT NULL DEFAULT 'default'
                    CHECK (scope IN ('default','category','performer')),
    category_id     uuid REFERENCES performer_categories(id),
    user_id         uuid REFERENCES users(id),
    salary          numeric(14,2) NOT NULL DEFAULT 0,
    norm_count      int NOT NULL DEFAULT 0,
    piece_over_norm boolean NOT NULL DEFAULT false,
    is_active       boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payroll_rules IS 'Схема «оклад за норму N монтажей + сделка сверх порога»: salary покрывает первые norm_count работ; при piece_over_norm сверх нормы платится сделка по work_rates.';

CREATE TABLE payroll_sheets (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    period_start date NOT NULL,
    period_end   date NOT NULL,
    status       text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','paid')),
    note         text,
    created_by   uuid REFERENCES users(id),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payroll_sheets IS 'Расчёт за месяц или полмесяца — period_start/period_end задают вариант.';

CREATE TABLE payroll_sheet_lines (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    sheet_id            uuid NOT NULL REFERENCES payroll_sheets(id) ON DELETE CASCADE,
    user_id             uuid NOT NULL REFERENCES users(id),
    acts_count          int NOT NULL DEFAULT 0,
    work_amount         numeric(14,2) NOT NULL DEFAULT 0,
    salary_amount       numeric(14,2) NOT NULL DEFAULT 0,
    bonus_amount        numeric(14,2) NOT NULL DEFAULT 0,
    compensation_amount numeric(14,2) NOT NULL DEFAULT 0,
    deduction_amount    numeric(14,2) NOT NULL DEFAULT 0,
    total               numeric(14,2) NOT NULL DEFAULT 0,
    threshold_met       boolean NOT NULL DEFAULT false,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sheet_id, user_id)
);

CREATE TABLE payroll_entries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES users(id),
    entry_date    date NOT NULL DEFAULT CURRENT_DATE,
    kind          text NOT NULL CHECK (kind IN ('work','compensation','deduction')),
    act_work_id   uuid REFERENCES act_works(id) ON DELETE SET NULL,
    reason        text,                -- ГСМ, амортизация, штраф за ошибку...
    amount        numeric(14,2) NOT NULL,
    sheet_line_id uuid REFERENCES payroll_sheet_lines(id) ON DELETE SET NULL,
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payroll_entries IS 'Единый регистр: kind=work создаётся при закрытии акта (из act_works), компенсации/удержания — вручную; sheet_line_id ставится при включении в расчёт.';
CREATE INDEX idx_pentries_user     ON payroll_entries(user_id, entry_date);
CREATE INDEX idx_pentries_unlinked ON payroll_entries(user_id) WHERE sheet_line_id IS NULL;
