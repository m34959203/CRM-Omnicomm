-- Migration 018 (Omnicomm): Telephony calls + multi-channel client messages
-- Закрывает раздел 12 ТЗ. WhatsApp уже покрыт whatsapp_message_log (migration-008);
-- здесь добавляются звонки (IP-телефония) и обобщённый журнал сообщений каналов.

CREATE TABLE IF NOT EXISTS calls (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    direction       VARCHAR(20) NOT NULL CHECK (direction IN ('incoming','outgoing','missed')),
    phone           VARCHAR(50) NOT NULL,
    organization_id UUID REFERENCES organizations(id),   -- клиент (если найден по номеру)
    incident_id     UUID REFERENCES incidents(id) ON DELETE SET NULL,   -- связанная заявка
    user_id         UUID REFERENCES users(id),           -- сотрудник
    duration_sec    INT DEFAULT 0,
    recording_url   TEXT,
    result          VARCHAR(50),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calls_phone ON calls(phone);
CREATE INDEX IF NOT EXISTS idx_calls_org ON calls(organization_id);
CREATE INDEX IF NOT EXISTS idx_calls_created ON calls(created_at DESC);

CREATE TABLE IF NOT EXISTS client_messages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel         VARCHAR(20) NOT NULL CHECK (channel IN ('whatsapp','telegram','email','site','chat')),
    direction       VARCHAR(20) NOT NULL DEFAULT 'incoming' CHECK (direction IN ('incoming','outgoing')),
    contact         VARCHAR(255) NOT NULL,                -- телефон или email
    organization_id UUID REFERENCES organizations(id),
    incident_id     UUID REFERENCES incidents(id) ON DELETE SET NULL,
    content         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cmsg_channel ON client_messages(channel);
CREATE INDEX IF NOT EXISTS idx_cmsg_contact ON client_messages(contact);
CREATE INDEX IF NOT EXISTS idx_cmsg_org ON client_messages(organization_id);
