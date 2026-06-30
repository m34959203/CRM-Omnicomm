-- Migration 021 (Omnicomm): 7-я роль (бухгалтерия) + нормативы сроков.
-- Закрывает раздел 4 (роли) и раздел 10 (контроль сроков) ТЗ.

-- Раздел 4: добавить роль accounting к существующим 6 ролям LiftPlatform.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('admin','org_admin','manager','technician','inspector','viewer','accounting'));

-- Раздел 10: нормативные сроки реакции и исполнения (часы) через sla_configs.
-- Маппинг приоритета/типа ТЗ → max_response_hours / max_resolution_hours.
INSERT INTO sla_configs (name, entity_type, severity, max_response_hours, max_resolution_hours)
SELECT v.name, 'incident', v.severity, v.resp, v.res
FROM (VALUES
    ('Критичная техническая неисправность', 'critical', 0.5, 8),
    ('Обычная техническая заявка',          'medium',   2.0, 16),
    ('Монтаж оборудования',                 'low',      8.0, 24),
    ('Коммерческий запрос',                 'medium',   2.0, 8),
    ('Вопросы по оплате и документам',      'low',      8.0, 16)
) AS v(name, severity, resp, res)
WHERE NOT EXISTS (SELECT 1 FROM sla_configs s WHERE s.name = v.name);
