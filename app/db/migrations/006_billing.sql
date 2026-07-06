-- Домен 6. Биллинг и продажи

CREATE TABLE tariff_plans (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    name_kk    text,
    currency   text NOT NULL DEFAULT 'KZT',
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE tariff_plans IS 'Назначенный клиенту/объекту план приоритетнее произвольных тарифов (tariffs).';

CREATE TABLE tariff_plan_items (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id      uuid NOT NULL REFERENCES tariff_plans(id) ON DELETE CASCADE,
    method       text NOT NULL CHECK (method IN ('activity','subscription','one_time')),
    name         text,
    amount       numeric(14,2) NOT NULL,
    vat_included boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE clients
    ADD CONSTRAINT fk_clients_tariff_plan FOREIGN KEY (tariff_plan_id) REFERENCES tariff_plans(id);
ALTER TABLE monitoring_objects
    ADD CONSTRAINT fk_mobj_tariff_plan FOREIGN KEY (tariff_plan_id) REFERENCES tariff_plans(id);

CREATE TABLE tariffs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    level         text NOT NULL CHECK (level IN ('default','category','client','object')),
    category_id   uuid REFERENCES service_categories(id),
    client_id     uuid REFERENCES clients(id),
    object_id     uuid REFERENCES monitoring_objects(id),
    method        text NOT NULL DEFAULT 'activity'
                  CHECK (method IN ('activity','subscription','one_time')),
    amount        numeric(14,2) NOT NULL DEFAULT 0,
    vat_included  boolean NOT NULL DEFAULT true,
    do_not_charge boolean NOT NULL DEFAULT false,
    currency      text NOT NULL DEFAULT 'KZT',
    valid_from    date NOT NULL DEFAULT CURRENT_DATE,
    valid_to      date,
    is_active     boolean NOT NULL DEFAULT true,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (level = 'default'  AND category_id IS NULL     AND client_id IS NULL     AND object_id IS NULL) OR
        (level = 'category' AND category_id IS NOT NULL AND client_id IS NULL     AND object_id IS NULL) OR
        (level = 'client'   AND client_id IS NOT NULL   AND object_id IS NULL) OR
        (level = 'object'   AND object_id IS NOT NULL)
    )
);
COMMENT ON TABLE tariffs IS 'Иерархия разрешения (в приложении): объект > клиент > категория обслуживания > умолчание. do_not_charge — явный «нулевой» тариф. Смена среди месяца → два интервала начислений.';
CREATE INDEX idx_tariffs_level  ON tariffs(level, category_id, client_id, object_id);
CREATE INDEX idx_tariffs_period ON tariffs(valid_from, valid_to) WHERE is_active;

CREATE TABLE billing_documents (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number            text UNIQUE,
    kind              text NOT NULL CHECK (kind IN ('advance_invoice','act','one_time_invoice')),
    scheme            text NOT NULL CHECK (scheme IN ('advance','credit')),
    client_id         uuid NOT NULL REFERENCES clients(id),
    counterparty_id   uuid REFERENCES counterparties(id),
    contract_id       uuid REFERENCES contracts(id),
    own_org_id        uuid REFERENCES own_organizations(id),
    period_start      date,
    period_end        date,
    subtotal          numeric(14,2) NOT NULL DEFAULT 0,
    extra_charge      numeric(14,2) NOT NULL DEFAULT 0,
    discount_amount   numeric(14,2) NOT NULL DEFAULT 0,
    prepaid_amount    numeric(14,2) NOT NULL DEFAULT 0,
    vat_rate          numeric(5,2),
    vat_amount        numeric(14,2) NOT NULL DEFAULT 0,
    total             numeric(14,2) NOT NULL DEFAULT 0,
    paid_amount       numeric(14,2) NOT NULL DEFAULT 0,
    status            text NOT NULL DEFAULT 'to_accrue'
                      CHECK (status IN ('to_accrue','prepared','issued','sent','partial',
                             'paid','overdue','cancelled')),
    planned_issue_date date,
    issued_at         timestamptz,
    sent_at           timestamptz,
    manager_id        uuid REFERENCES users(id),
    accountant_id     uuid REFERENCES users(id),
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE billing_documents IS 'Авансовая схема: advance_invoice в начале месяца (по состоянию на начало), act в конце: total = subtotal(факт) + extra_charge(доначисление) − discount_amount − prepaid_amount. Кредитная: только act. vat_rate — снэпшот из vat_rates на дату оборота. Печатные формы (счёт, расшифровка, АВР Р-1) — PDF из этих данных + accruals.';
CREATE INDEX idx_bdoc_client_status ON billing_documents(client_id, status);
CREATE INDEX idx_bdoc_period        ON billing_documents(period_start, period_end);
CREATE INDEX idx_bdoc_status        ON billing_documents(status);

CREATE TABLE discounts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id    uuid NOT NULL REFERENCES clients(id),
    name         text,
    total_amount numeric(14,2) NOT NULL,
    used_amount  numeric(14,2) NOT NULL DEFAULT 0,
    valid_from   date NOT NULL DEFAULT CURRENT_DATE,
    is_active    boolean NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CHECK (used_amount <= total_amount)
);
COMMENT ON TABLE discounts IS 'Скидка фиксированной суммой, списывается помесячно в расчётных документах до исчерпания.';
CREATE INDEX idx_discounts_client ON discounts(client_id) WHERE is_active;

CREATE TABLE discount_applications (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    discount_id         uuid NOT NULL REFERENCES discounts(id) ON DELETE CASCADE,
    billing_document_id uuid NOT NULL REFERENCES billing_documents(id) ON DELETE CASCADE,
    amount              numeric(14,2) NOT NULL,
    created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accruals (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    billing_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
    client_id           uuid NOT NULL REFERENCES clients(id),
    object_id           uuid REFERENCES monitoring_objects(id),
    equipment_id        uuid REFERENCES equipment_items(id),
    tariff_id           uuid REFERENCES tariffs(id),
    tariff_plan_item_id uuid REFERENCES tariff_plan_items(id),
    method              text NOT NULL CHECK (method IN ('activity','subscription','one_time')),
    date_from           date NOT NULL,
    date_to             date NOT NULL,
    days                int,
    amount              numeric(14,2) NOT NULL,
    vat_amount          numeric(14,2) NOT NULL DEFAULT 0,
    status              text NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','billed','cancelled')),
    note                text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE accruals IS 'Строка «расшифровки абонплаты по объектам». method=activity: посуточный факт из equipment_state_history (дни по Asia/Almaty); субпериоды при смене тарифа/состояния среди месяца.';
CREATE INDEX idx_accr_doc           ON accruals(billing_document_id);
CREATE INDEX idx_accr_client_period ON accruals(client_id, date_from);
CREATE INDEX idx_accr_object        ON accruals(object_id);

CREATE TABLE payments (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id           uuid NOT NULL REFERENCES clients(id),
    billing_document_id uuid REFERENCES billing_documents(id) ON DELETE SET NULL,
    amount              numeric(14,2) NOT NULL,
    paid_at             timestamptz NOT NULL DEFAULT now(),
    method              text CHECK (method IN ('bank','cash','card','offset')),
    bank_reference      text,
    note                text,
    created_by          uuid REFERENCES users(id),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE payments IS 'Ведомость расчётов (долги/авансы) = агрегат billing_documents − payments по клиенту; она же — вход автоблокировки должников.';
CREATE INDEX idx_pay_client ON payments(client_id, paid_at DESC);

CREATE TABLE sales_orders (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    number          text NOT NULL UNIQUE,
    client_id       uuid NOT NULL REFERENCES clients(id),
    counterparty_id uuid REFERENCES counterparties(id),
    contract_id     uuid REFERENCES contracts(id),
    own_org_id      uuid REFERENCES own_organizations(id),
    warehouse_id    uuid REFERENCES warehouses(id),
    shipment_order  text NOT NULL DEFAULT 'on_install'
                    CHECK (shipment_order IN ('no_install','on_install','before_install')),
    status          text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','invoiced','paid','in_service','realized','cancelled')),
    manager_id      uuid REFERENCES users(id),
    total_amount    numeric(14,2) NOT NULL DEFAULT 0,
    vat_rate        numeric(5,2),
    note            text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN sales_orders.shipment_order IS 'no_install: отгрузка сразу; on_install: реализация после акта ТО; before_install: счёт и закрывающие до монтажа (бюджетники ГУ/КГП).';
CREATE INDEX idx_so_client ON sales_orders(client_id);
CREATE INDEX idx_so_status ON sales_orders(status);

CREATE TABLE sales_order_items (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    nomenclature_id uuid REFERENCES nomenclature(id),
    name            text NOT NULL,
    is_service      boolean NOT NULL DEFAULT false,
    quantity        numeric(12,3) NOT NULL DEFAULT 1,
    price           numeric(14,2) NOT NULL DEFAULT 0,
    object_id       uuid REFERENCES monitoring_objects(id),
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_soi_order ON sales_order_items(order_id);

CREATE TABLE sales_invoices (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   uuid NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
    kind       text NOT NULL CHECK (kind IN ('invoice','realization','waybill')),
    number     text,
    amount     numeric(14,2) NOT NULL DEFAULT 0,
    issued_at  timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN sales_invoices.kind IS 'invoice — счёт на оплату; realization — реализация/АВР (Р-1) по работам и услугам; waybill — накладная на отпуск запасов (З-2) по оборудованию.';

-- отложенный FK из домена 4
ALTER TABLE testing_orders
    ADD CONSTRAINT fk_testing_sales_order
    FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id);
