/**
 * Анализ активности оборудования за месяц (этап 7): по клиентам —
 * текущий срез billing_state установленных единиц + дни состояний за месяц
 * из equipment_state_history. Дни считаются по календарю Asia/Almaty (UTC+5,
 * упрощённо сдвигом +5h — как billable-дни биллинга: день засчитывается,
 * если интервал покрывает любую часть суток; active+conservation = оплачиваемые).
 */
import { monthBounds } from "@/lib/billing/dates";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export type ActivityRow = {
  client_id: string;
  client_name: string;
  now_active: number;
  now_conservation: number;
  now_disabled: number;
  active_days: number;
  conservation_days: number;
  billable_days: number;
};

export async function activityReport(q: Q, period: string): Promise<ActivityRow[]> {
  const { start, end } = monthBounds(period);

  const [slice, days] = await Promise.all([
    q<{ client_id: string; client_name: string; now_active: string; now_conservation: string; now_disabled: string }>(
      `SELECT c.id AS client_id, c.name AS client_name,
              count(e.id) FILTER (WHERE e.billing_state = 'active')       AS now_active,
              count(e.id) FILTER (WHERE e.billing_state = 'conservation') AS now_conservation,
              count(e.id) FILTER (WHERE e.billing_state = 'disabled')     AS now_disabled
       FROM clients c
       JOIN equipment_items e ON e.client_id = c.id AND e.status = 'installed'
       GROUP BY c.id, c.name`
    ),
    // DISTINCT (equipment, day, state): смежные интервалы (закрыт/открыт в один момент)
    // не задваивают граничный день внутри одного состояния.
    q<{ client_id: string; client_name: string; active_days: string; conservation_days: string; billable_days: string }>(
      `WITH day_set AS (
         SELECT DISTINCT h.client_id, h.equipment_id, h.state, d.d::date AS day
         FROM equipment_state_history h
         CROSS JOIN LATERAL generate_series(
           GREATEST((h.valid_from AT TIME ZONE 'UTC' + interval '5 hours')::date, $1::date),
           LEAST((COALESCE(h.valid_to, now()) AT TIME ZONE 'UTC' + interval '5 hours')::date, $2::date),
           interval '1 day'
         ) AS d(d)
         WHERE h.client_id IS NOT NULL
       )
       SELECT s.client_id, c.name AS client_name,
              count(DISTINCT (s.equipment_id, s.day)) FILTER (WHERE s.state = 'active')       AS active_days,
              count(DISTINCT (s.equipment_id, s.day)) FILTER (WHERE s.state = 'conservation') AS conservation_days,
              count(DISTINCT (s.equipment_id, s.day)) FILTER (WHERE s.state IN ('active','conservation')) AS billable_days
       FROM day_set s
       JOIN clients c ON c.id = s.client_id
       GROUP BY s.client_id, c.name`,
      [start, end]
    ),
  ]);

  const map = new Map<string, ActivityRow>();
  const blank = (id: string, name: string): ActivityRow => ({
    client_id: id,
    client_name: name,
    now_active: 0,
    now_conservation: 0,
    now_disabled: 0,
    active_days: 0,
    conservation_days: 0,
    billable_days: 0,
  });
  for (const r of slice) {
    const row = blank(r.client_id, r.client_name);
    row.now_active = Number(r.now_active);
    row.now_conservation = Number(r.now_conservation);
    row.now_disabled = Number(r.now_disabled);
    map.set(r.client_id, row);
  }
  for (const r of days) {
    const row = map.get(r.client_id) ?? blank(r.client_id, r.client_name);
    row.active_days = Number(r.active_days);
    row.conservation_days = Number(r.conservation_days);
    row.billable_days = Number(r.billable_days);
    map.set(r.client_id, row);
  }
  return [...map.values()].sort((a, b) => a.client_name.localeCompare(b.client_name, "ru"));
}
