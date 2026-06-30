-- Migration 020 (Omnicomm): доменный слой заявок поверх incidents.
-- Закрывает разделы 7 (поля карточки), 7.2 (16 типов), 8 (14 статусов), 18 (поиск).
-- incidents используется как сущность «заявка/обращение»; добавляются поля ТЗ.

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS request_number  VARCHAR(20) UNIQUE;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS source          VARCHAR(20)
    CHECK (source IN ('phone','whatsapp','telegram','email','site','chat','manual'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS request_type    VARCHAR(40)
    CHECK (request_type IN (
        'connect','dismantle','replace','diagnostics','gps_fault','fuel_sensor_fault',
        'cctv_fault','monitoring_setup','consultation','training','integration',
        'bi_reporting','commercial','payment_question','docs_question','other'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS omnicomm_status VARCHAR(30) DEFAULT 'new'
    CHECK (omnicomm_status IN (
        'new','assigned','in_progress','visit_planned','installer_departed','installer_on_site',
        'working','wait_client','wait_parts','completed','in_review','closed','overdue','cancelled'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority_level  VARCHAR(20) DEFAULT 'normal'
    CHECK (priority_level IN ('low','normal','high','critical'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS manager_id      UUID REFERENCES users(id);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS support_id      UUID REFERENCES users(id);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS installer_id    UUID REFERENCES users(id);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS due_at          TIMESTAMPTZ;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS result_comment  TEXT;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS contact_phone   VARCHAR(50);
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS contact_email   VARCHAR(255);

-- Нумерация заявок (раздел 7.1: «номер заявки»)
CREATE SEQUENCE IF NOT EXISTS omnicomm_request_seq START 1;

-- Индексы под фильтрацию и поиск (раздел 18)
CREATE INDEX IF NOT EXISTS idx_inc_omnicomm_status ON incidents(omnicomm_status);
CREATE INDEX IF NOT EXISTS idx_inc_request_type    ON incidents(request_type);
CREATE INDEX IF NOT EXISTS idx_inc_source          ON incidents(source);
CREATE INDEX IF NOT EXISTS idx_inc_installer       ON incidents(installer_id);
CREATE INDEX IF NOT EXISTS idx_inc_due_at          ON incidents(due_at);
CREATE INDEX IF NOT EXISTS idx_inc_request_number  ON incidents(request_number);
