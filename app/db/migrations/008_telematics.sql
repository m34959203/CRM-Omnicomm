-- Домен 8. Интеграция с телематикой

CREATE TABLE telematics_servers (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name              text NOT NULL,
    server_type       text NOT NULL DEFAULT 'omnicomm'
                      CHECK (server_type IN ('omnicomm','wialon')),
    base_url          text NOT NULL,
    auth_login        text,
    auth_secret       text,
    is_active         boolean NOT NULL DEFAULT true,
    health_status     text NOT NULL DEFAULT 'unknown'
                      CHECK (health_status IN ('ok','degraded','down','unknown')),
    health_checked_at timestamptz,
    note              text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN telematics_servers.health_status IS 'Health-проба перед каждой sync-операцией (учётки Omnicomm деградируют под нагрузкой); auth_secret хранить шифрованным (ключ в env).';

CREATE TABLE telematics_accounts (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id          uuid NOT NULL REFERENCES telematics_servers(id) ON DELETE CASCADE,
    client_id          uuid REFERENCES clients(id),
    login              text,
    external_id        text,
    auto_block_debtors boolean NOT NULL DEFAULT false,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE telematics_accounts IS 'Учётная запись клиента в системе мониторинга; auto_block_debtors — «блокировать при задолженности автоматически» (как в карточке учётки СМ Аскан).';

CREATE TABLE telematics_object_links (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id              uuid NOT NULL REFERENCES telematics_servers(id) ON DELETE CASCADE,
    account_id             uuid REFERENCES telematics_accounts(id),
    object_id              uuid NOT NULL REFERENCES monitoring_objects(id),
    equipment_id           uuid REFERENCES equipment_items(id),
    external_uuid          text NOT NULL,
    external_name          text,
    sync_status            text NOT NULL DEFAULT 'pending'
                           CHECK (sync_status IN ('synced','pending','error','pending_delete','deleted')),
    data_reception_enabled boolean NOT NULL DEFAULT true,
    profile_backup         jsonb,
    profile_backup_at      timestamptz,
    last_synced_at         timestamptz,
    created_at             timestamptz NOT NULL DEFAULT now(),
    updated_at             timestamptz NOT NULL DEFAULT now(),
    UNIQUE (server_id, external_uuid)
);
COMMENT ON COLUMN telematics_object_links.data_reception_enabled IS 'Консервация → «приём данных выключен» в Omnicomm.';
COMMENT ON COLUMN telematics_object_links.sync_status IS 'pending_delete — двухэтапное удаление: объект попадает в список «к удалению», фактическое удаление — отдельным правом.';
COMMENT ON COLUMN telematics_object_links.profile_backup IS 'Резерв настроек объекта (экспорт профиля) перед удалением — для восстановления.';
CREATE INDEX idx_tol_object ON telematics_object_links(object_id);
CREATE INDEX idx_tol_status ON telematics_object_links(sync_status);

CREATE TABLE sync_log (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id     uuid REFERENCES telematics_servers(id) ON DELETE SET NULL,
    operation     text NOT NULL,       -- create_object, disable_reception, delete, block, unblock, import, health
    entity_type   text,
    entity_id     uuid,
    status        text NOT NULL CHECK (status IN ('ok','error')),
    error_message text,
    payload       jsonb,
    duration_ms   int,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_synclog_server  ON sync_log(server_id, created_at DESC);
CREATE INDEX idx_synclog_errors  ON sync_log(created_at DESC) WHERE status = 'error';

CREATE TABLE blocking_rules (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name               text NOT NULL,
    scope              text NOT NULL DEFAULT 'default'
                       CHECK (scope IN ('default','category','client')),
    category_id        uuid REFERENCES service_categories(id),
    client_id          uuid REFERENCES clients(id),
    advance_grace_days int NOT NULL DEFAULT 0,
    credit_grace_days  int NOT NULL DEFAULT 0,
    allowed_debt       numeric(14,2) NOT NULL DEFAULT 0,
    warn_days_before   int NOT NULL DEFAULT 3,
    is_active          boolean NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE blocking_rules IS 'Дни отсрочки задаются отдельно для авансовой и кредитной схем; долг сверх allowed_debt после отсрочки → предупреждение (email+сообщение), затем блокировка в СМ.';

CREATE TABLE blocking_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id       uuid REFERENCES blocking_rules(id) ON DELETE SET NULL,
    client_id     uuid NOT NULL REFERENCES clients(id),
    object_id     uuid REFERENCES monitoring_objects(id),
    link_id       uuid REFERENCES telematics_object_links(id),
    action        text NOT NULL CHECK (action IN ('warning','block','unblock','manual_unblock')),
    debt_amount   numeric(14,2),
    unblock_until date,                -- ручная разблокировка «до даты»
    performed_by  uuid REFERENCES users(id),   -- NULL = автоматически
    note          text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_blkev_client  ON blocking_events(client_id, created_at DESC);
CREATE INDEX idx_blkev_created ON blocking_events(created_at DESC);
