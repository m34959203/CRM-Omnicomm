-- Migration 017 (Omnicomm): Visit steps with geolocation
-- Дополняет maintenance_schedules (= "выезды монтажников") пошаговой фиксацией
-- этапов выезда с геометкой. Закрывает раздел 9.3 ТЗ Omnicomm.

CREATE TABLE IF NOT EXISTS visit_steps (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    maintenance_id  UUID NOT NULL REFERENCES maintenance_schedules(id) ON DELETE CASCADE,
    step            VARCHAR(20) NOT NULL
                    CHECK (step IN ('accept','depart','arrive','start','finish','cant_do','repeat')),
    lat             DOUBLE PRECISION,
    lng             DOUBLE PRECISION,
    performed_by    UUID REFERENCES users(id),
    note            TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visit_steps_maintenance ON visit_steps(maintenance_id);
CREATE INDEX IF NOT EXISTS idx_visit_steps_step ON visit_steps(step);

-- Признак обязательности фотоотчёта по типу работ (раздел 9.4 / 20 ТЗ)
ALTER TABLE maintenance_schedules ADD COLUMN IF NOT EXISTS photo_required BOOLEAN NOT NULL DEFAULT FALSE;
-- Статус монтажника (раздел 9.2 ТЗ)
ALTER TABLE users ADD COLUMN IF NOT EXISTS installer_status VARCHAR(30) DEFAULT 'free'
    CHECK (installer_status IN ('free','assigned','en_route','on_site','working','wait_client','wait_parts','done','unavailable','day_off'));
