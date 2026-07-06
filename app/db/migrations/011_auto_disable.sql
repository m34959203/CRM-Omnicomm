-- Авто-отключение ТС должников (голосовое заказчика 04.07.2026, ~10 000 ТС):
-- «не проплатили → ТС отключается и уходит из CRM». Механика: через N дней после
-- автоблокировки учётки оборудование клиента переводится в disabled (биллинг
-- останавливается), приём данных в СМ выключается, объекты архивируются.
-- Оплата долга симметрично возвращает то, что отключала автоматика.

ALTER TABLE blocking_rules
    ADD COLUMN disable_objects_after_days int;
COMMENT ON COLUMN blocking_rules.disable_objects_after_days IS
  'NULL = не отключать. Иначе: спустя N дней ПОСЛЕ дня блокировки оборудование клиента → disabled (счета не выставляются), объекты → archived, приём данных в СМ выключается.';

ALTER TABLE blocking_events DROP CONSTRAINT blocking_events_action_check;
ALTER TABLE blocking_events ADD CONSTRAINT blocking_events_action_check
  CHECK (action IN ('warning','block','unblock','manual_unblock','disable_objects','restore_objects'));
