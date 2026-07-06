-- Домен 2. Клиенты и договоры

CREATE TABLE clients (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text NOT NULL,
    category_id    uuid REFERENCES service_categories(id),
    manager_id     uuid REFERENCES users(id),
    phone          text,
    email          text,
    billing_scheme text NOT NULL DEFAULT 'credit' CHECK (billing_scheme IN ('advance','credit')),
    billing_period text NOT NULL DEFAULT 'month'  CHECK (billing_period IN ('month','quarter')),
    tariff_plan_id uuid,               -- FK добавляется в домене 6 (tariff_plans)
    is_active      boolean NOT NULL DEFAULT true,
    notes          text,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN clients.billing_scheme IS 'advance: счёт в начале месяца, акт в конце (начисления + доначисление − скидки − предоплата); credit: всё в конце месяца.';
CREATE INDEX idx_clients_manager  ON clients(manager_id);
CREATE INDEX idx_clients_category ON clients(category_id);
CREATE INDEX idx_clients_name     ON clients(lower(name));

CREATE TABLE counterparties (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id        uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name             text NOT NULL,
    name_kk          text,
    legal_form       text CHECK (legal_form IN ('TOO','IP','AO','GU','KGP','NAO','FL','other')),
    bin_iin          text,
    kbe              text,
    is_vat_payer     boolean NOT NULL DEFAULT false,
    is_resident      boolean NOT NULL DEFAULT true,
    is_government    boolean NOT NULL DEFAULT false,
    legal_address    text,
    legal_address_kk text,
    actual_address   text,
    phone            text,
    email            text,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE counterparties IS 'Контрагент (юрлицо) ≠ клиент (партнёр): у холдинга несколько контрагентов на одного клиента.';
COMMENT ON COLUMN counterparties.is_government IS 'ГУ/КГП — сценарий бюджетников: закрывающие документы «до установки».';
CREATE INDEX idx_cp_client ON counterparties(client_id);
CREATE INDEX idx_cp_bin    ON counterparties(bin_iin);

CREATE TABLE counterparty_bank_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    counterparty_id uuid NOT NULL REFERENCES counterparties(id) ON DELETE CASCADE,
    iik             text NOT NULL,      -- IBAN KZ...
    bik             text NOT NULL,
    bank_name       text,
    currency        text NOT NULL DEFAULT 'KZT',
    is_primary      boolean NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE client_contacts (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id   uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name        text NOT NULL,
    position    text,
    phone       text,
    email       text,
    is_primary  boolean NOT NULL DEFAULT false,
    note        text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ccontacts_client ON client_contacts(client_id);

CREATE TABLE contracts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number          text NOT NULL,
    client_id       uuid NOT NULL REFERENCES clients(id),
    counterparty_id uuid REFERENCES counterparties(id),
    own_org_id      uuid REFERENCES own_organizations(id),
    kind            text NOT NULL DEFAULT 'subscription'
                    CHECK (kind IN ('sale','subscription','repair','complex')),
    is_goszakup     boolean NOT NULL DEFAULT false,
    goszakup_number text,
    goszakup_url    text,
    signed_at       date,
    valid_from      date,
    valid_to        date,
    currency        text NOT NULL DEFAULT 'KZT',
    status          text NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft','active','suspended','terminated')),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN contracts.goszakup_number IS 'Номер договора на портале goszakup.gov.kz (госзакуп).';
CREATE INDEX idx_contracts_client ON contracts(client_id);
CREATE INDEX idx_contracts_number ON contracts(number);
