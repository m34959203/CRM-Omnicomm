-- Omnicomm demo seed: абонплата, звонок, сообщение канала, этапы выезда.
-- Идемпотентно-безопасен: берёт первую организацию/ТО, не дублирует план.
-- Запуск: psql "$DATABASE_URL" -f prisma/seed-omnicomm.sql

DO $$
DECLARE
  v_org   UUID;
  v_maint UUID;
  v_user  UUID;
  v_plan  UUID;
BEGIN
  SELECT id INTO v_org   FROM organizations         ORDER BY created_at LIMIT 1;
  SELECT id INTO v_maint FROM maintenance_schedules ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user  FROM users WHERE role = 'technician' ORDER BY created_at LIMIT 1;

  IF v_org IS NULL THEN
    RAISE NOTICE 'Нет организаций — пропуск сидов Omnicomm';
    RETURN;
  END IF;

  -- Абонплата: план + начисление за текущий месяц
  IF NOT EXISTS (SELECT 1 FROM subscription_plans WHERE organization_id = v_org) THEN
    INSERT INTO subscription_plans (organization_id, amount, period)
    VALUES (v_org, 45000, 'month') RETURNING id INTO v_plan;

    INSERT INTO subscription_invoices
      (plan_id, organization_id, period_start, period_end, amount, planned_issue_date, issued_at, status, paid_amount)
    VALUES
      (v_plan, v_org,
       date_trunc('month', CURRENT_DATE)::date,
       (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date,
       45000, date_trunc('month', CURRENT_DATE)::date, NOW(), 'issued', 0);
  END IF;

  -- Демо-звонок и сообщение канала
  INSERT INTO calls (direction, phone, organization_id, duration_sec, result)
  VALUES ('incoming', '+77011112233', v_org, 132, 'Консультация по подключению');

  INSERT INTO client_messages (channel, contact, organization_id, content)
  VALUES ('telegram', '+77011112233', v_org, 'Когда приедет монтажник по заявке?');

  -- Демо-этапы выезда с геолокацией (если есть ТО и техник)
  IF v_maint IS NOT NULL AND v_user IS NOT NULL THEN
    UPDATE maintenance_schedules SET photo_required = TRUE WHERE id = v_maint;
    INSERT INTO visit_steps (maintenance_id, step, lat, lng, performed_by) VALUES
      (v_maint, 'accept', NULL,  NULL,  v_user),
      (v_maint, 'depart', 43.20, 76.90, v_user),
      (v_maint, 'arrive', 43.27, 76.92, v_user);
  END IF;

  RAISE NOTICE 'Omnicomm demo seed применён для организации %', v_org;
END $$;
