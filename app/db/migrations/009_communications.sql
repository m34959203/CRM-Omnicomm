-- Домен 9. Коммуникации и уведомления

CREATE TABLE calls (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    direction     text NOT NULL CHECK (direction IN ('incoming','outgoing','missed')),
    phone         text NOT NULL,
    client_id     uuid REFERENCES clients(id),
    request_id    uuid REFERENCES requests(id) ON DELETE SET NULL,
    ticket_id     uuid REFERENCES tickets(id) ON DELETE SET NULL,
    user_id       uuid REFERENCES users(id),
    duration_sec  int NOT NULL DEFAULT 0,
    recording_url text,
    result        text,
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_calls_phone   ON calls(phone);
CREATE INDEX idx_calls_client  ON calls(client_id);
CREATE INDEX idx_calls_created ON calls(created_at DESC);

CREATE TABLE messages (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel     text NOT NULL CHECK (channel IN ('whatsapp','telegram','email','site','chat','sms')),
    direction   text NOT NULL DEFAULT 'in' CHECK (direction IN ('in','out')),
    contact     text,
    client_id   uuid REFERENCES clients(id),
    request_id  uuid REFERENCES requests(id) ON DELETE SET NULL,
    ticket_id   uuid REFERENCES tickets(id) ON DELETE SET NULL,
    text        text,
    external_id text,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_msg_client  ON messages(client_id);
CREATE INDEX idx_msg_contact ON messages(contact);
CREATE INDEX idx_msg_created ON messages(created_at DESC);

CREATE TABLE notification_templates (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code       text NOT NULL UNIQUE,   -- billing_doc_email, block_warning, ...
    channel    text NOT NULL CHECK (channel IN ('email','telegram','whatsapp','web_push','sms')),
    subject_ru text,
    subject_kk text,
    body_ru    text NOT NULL,
    body_kk    text,
    is_active  boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_queue (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    channel         text NOT NULL CHECK (channel IN ('email','telegram','whatsapp','web_push','sms')),
    recipient       text NOT NULL,
    template_code   text,
    subject         text,
    body            text,
    attachments     jsonb,             -- [{url, filename}] — PDF расчётных документов
    entity_type     text,
    entity_id       uuid,
    status          text NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued','sending','sent','failed','cancelled')),
    attempts        int NOT NULL DEFAULT 0,
    next_attempt_at timestamptz,
    sent_at         timestamptz,
    last_error      text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE notification_queue IS 'Рассылка партиями (cron-воркер): массовые расчётные документы, предупреждения о блокировке; ретраи с next_attempt_at.';
CREATE INDEX idx_nq_pending ON notification_queue(next_attempt_at) WHERE status IN ('queued','failed');

CREATE TABLE push_subscriptions (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint   text NOT NULL UNIQUE,
    keys       jsonb NOT NULL,          -- {p256dh, auth}
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'updated_at'
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_%I_updated_at
       BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t);
  END LOOP;
END $$;
