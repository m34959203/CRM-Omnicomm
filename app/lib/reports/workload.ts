/**
 * Загруженность исполнителей план/факт за месяц (этап 7):
 *  план — назначенные наряды (work_order_performers × пересечение с периодом);
 *  факт — закрытые акты ТО (performed_by, closed_at в периоде);
 *  деньги — сдельные начисления payroll_entries kind=work за период.
 * Границы месяца — по календарю Asia/Almaty (как в биллинге).
 */
import { almatyDayStart, monthBounds } from "@/lib/billing/dates";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export type WorkloadRow = {
  user_id: string;
  full_name: string;
  planned_orders: number;
  closed_acts: number;
  piece_amount: number;
};

export async function workloadReport(q: Q, period: string): Promise<WorkloadRow[]> {
  const { start, end } = monthBounds(period);
  const fromTs = almatyDayStart(start).toISOString();
  // эксклюзивная верхняя граница: начало суток Алматы следующего дня после конца месяца
  const toTs = new Date(almatyDayStart(end).getTime() + 86400000).toISOString();

  const rows = await q<{
    user_id: string;
    full_name: string;
    planned_orders: string;
    closed_acts: string;
    piece_amount: string;
  }>(
    `
    WITH plan AS (
      SELECT p.user_id, count(*) AS orders
      FROM work_order_performers p
      JOIN work_orders w ON w.id = p.work_order_id
      WHERE w.status NOT IN ('draft','cancelled')
        AND w.scheduled_start < $2::timestamptz
        AND COALESCE(w.scheduled_end, w.scheduled_start) >= $1::timestamptz
      GROUP BY p.user_id
    ),
    fact AS (
      SELECT a.performed_by AS user_id, count(*) AS acts
      FROM maintenance_acts a
      WHERE a.status = 'done' AND a.performed_by IS NOT NULL
        AND a.closed_at >= $1::timestamptz AND a.closed_at < $2::timestamptz
      GROUP BY a.performed_by
    ),
    piece AS (
      SELECT user_id, sum(amount) AS amount
      FROM payroll_entries
      WHERE kind = 'work' AND entry_date >= $3::date AND entry_date <= $4::date
      GROUP BY user_id
    )
    SELECT u.id AS user_id, u.full_name,
           COALESCE(plan.orders, 0)   AS planned_orders,
           COALESCE(fact.acts, 0)     AS closed_acts,
           COALESCE(piece.amount, 0)  AS piece_amount
    FROM users u
    LEFT JOIN plan  ON plan.user_id  = u.id
    LEFT JOIN fact  ON fact.user_id  = u.id
    LEFT JOIN piece ON piece.user_id = u.id
    WHERE plan.user_id IS NOT NULL OR fact.user_id IS NOT NULL OR piece.user_id IS NOT NULL
       OR (u.is_active AND EXISTS (
             SELECT 1 FROM roles r WHERE r.id = u.role_id AND r.code = 'installer'))
    ORDER BY u.full_name`,
    [fromTs, toTs, start, end]
  );
  return rows.map((r) => ({
    user_id: r.user_id,
    full_name: r.full_name,
    planned_orders: Number(r.planned_orders),
    closed_acts: Number(r.closed_acts),
    piece_amount: Number(r.piece_amount),
  }));
}
