-- Домен 1. Система и справочники

-- gen_random_uuid() встроен в PG13+; расширение не требуется.

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$ LANGUAGE plpgsql;

-- Нумераторы документов (формат номера собирает приложение, напр. 'ЗН-000123')
CREATE SEQUENCE IF NOT EXISTS seq_request_number;
CREATE SEQUENCE IF NOT EXISTS seq_ticket_number;
CREATE SEQUENCE IF NOT EXISTS seq_work_order_number;
CREATE SEQUENCE IF NOT EXISTS seq_act_number;
CREATE SEQUENCE IF NOT EXISTS seq_sales_order_number;
CREATE SEQUENCE IF NOT EXISTS seq_billing_doc_number;
CREATE SEQUENCE IF NOT EXISTS seq_repair_doc_number;
CREATE SEQUENCE IF NOT EXISTS seq_testing_order_number;

CREATE TABLE roles (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code        text NOT NULL UNIQUE,
    name        text NOT NULL,
    name_kk     text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name        text NOT NULL,
    email            text NOT NULL UNIQUE,
    phone            text,
    role_id          uuid NOT NULL REFERENCES roles(id),
    password_hash    text NOT NULL,
    is_active        boolean NOT NULL DEFAULT true,
    region           text,
    installer_status text NOT NULL DEFAULT 'free'
                     CHECK (installer_status IN ('free','assigned','en_route','on_site','working',
                            'wait_client','wait_parts','done','unavailable','day_off')),
    telegram_chat_id text,
    locale           text NOT NULL DEFAULT 'ru' CHECK (locale IN ('ru','kk')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_role ON users(role_id);

CREATE TABLE app_settings (
    key         text PRIMARY KEY,
    value       jsonb NOT NULL,
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid REFERENCES users(id),
    action      text NOT NULL,
    entity_type text NOT NULL,
    entity_id   uuid,
    detail      jsonb,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entity  ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

CREATE TABLE vat_rates (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rate        numeric(5,2) NOT NULL,
    valid_from  date NOT NULL UNIQUE,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE vat_rates IS
  'НДС как параметр с датой действия (12% до 31.12.2025, 16% с 01.01.2026). Ставка выбирается по ДАТЕ ОБОРОТА, не по дате договора/оплаты.';

CREATE TABLE own_organizations (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    name_kk           text,
    legal_form        text CHECK (legal_form IN ('TOO','IP','AO','GU','KGP','NAO','other')),
    bin               text,
    iik               text,
    bik               text,
    bank_name         text,
    kbe               text,
    is_vat_payer      boolean NOT NULL DEFAULT true,
    vat_certificate   text,
    legal_address     text,
    legal_address_kk  text,
    director_name     text,
    director_name_kk  text,
    director_basis    text,
    phone             text,
    email             text,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE own_organizations IS 'Организации-продавцы (от чьего имени выписываются счёт/АВР/З-2).';

CREATE TABLE service_categories (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    name_kk     text,
    note        text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE service_categories IS 'Категории сервисного обслуживания — уровень в иерархии тарифов и в правилах блокировки должников.';

CREATE TABLE suppliers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    bin_iin     text,
    contact     text,
    phone       text,
    email       text,
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_operators (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    code        text UNIQUE,          -- beeline_kz, kcell, tele2_altel, izi
    is_active   boolean NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sim_operator_plans (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    operator_id  uuid NOT NULL REFERENCES sim_operators(id) ON DELETE CASCADE,
    name         text NOT NULL,
    monthly_fee  numeric(14,2),
    note         text,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nomenclature (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    kind              text NOT NULL CHECK (kind IN ('equipment','material','service')),
    name              text NOT NULL,
    name_kk           text,
    sku               text,
    unit              text NOT NULL DEFAULT 'шт',
    unit_kk           text,
    default_price     numeric(14,2),
    vat_included      boolean NOT NULL DEFAULT true,
    is_serial_tracked boolean NOT NULL DEFAULT false,
    device_type       text,                     -- gps_terminal, fuel_sensor, cctv, ...
    max_sim_slots     int NOT NULL DEFAULT 0,
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN nomenclature.max_sim_slots IS 'Контроль максимума SIM в устройстве при установке через акт ТО.';
CREATE INDEX idx_nomenclature_kind ON nomenclature(kind) WHERE is_active;

CREATE TABLE work_types (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text NOT NULL,
    name_kk        text,
    action         text CHECK (action IN ('install','replace','dismantle','diagnostics','service')),
    photo_required boolean NOT NULL DEFAULT false,
    photo_places   jsonb,                      -- ["кабина","бак","разъём"] — места фотофиксации
    default_rate   numeric(14,2),              -- сдельная расценка «по умолчанию»
    is_active      boolean NOT NULL DEFAULT true,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE material_norms (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    work_type_id    uuid NOT NULL REFERENCES work_types(id) ON DELETE CASCADE,
    nomenclature_id uuid NOT NULL REFERENCES nomenclature(id),
    quantity        numeric(12,3) NOT NULL,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (work_type_id, nomenclature_id)
);
COMMENT ON TABLE material_norms IS 'Нормы расхода материалов — авто-подстановка списаний в акт ТО по виду работ.';
