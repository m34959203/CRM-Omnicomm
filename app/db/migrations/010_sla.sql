-- Нормативы реакции/исполнения по типам заявок (фактчек п.2):
-- due_at при создании заявки проставляется автоматически из норматива, если не задан;
-- джоб /api/jobs/overdue помечает просроченные и шлёт адресные уведомления.

CREATE TABLE request_sla (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    request_type      text NOT NULL UNIQUE,
    reaction_minutes  int,               -- норматив первой реакции (взять в работу)
    execution_hours   int NOT NULL,      -- норматив исполнения (расчёт due_at)
    is_active         boolean NOT NULL DEFAULT true,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_request_sla_updated_at
BEFORE UPDATE ON request_sla FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Разумные дефолты (правятся в UI /service/sla)
INSERT INTO request_sla (request_type, reaction_minutes, execution_hours) VALUES
  ('connect',            60,  72),
  ('dismantle',          60,  72),
  ('replace',            60,  48),
  ('diagnostics',        30,  24),
  ('gps_fault',          30,  24),
  ('fuel_sensor_fault',  30,  24),
  ('cctv_fault',         30,  48),
  ('monitoring_setup',   60,  48),
  ('consultation',       30,   8),
  ('training',          240, 120),
  ('integration',       240, 240),
  ('bi_reporting',      240, 120),
  ('commercial',         60,  24),
  ('payment_question',   60,  24),
  ('docs_question',      60,  24),
  ('other',              60,  48);
