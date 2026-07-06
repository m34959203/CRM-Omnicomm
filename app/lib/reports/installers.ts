/**
 * Карточка специалиста (фактчек п.1): метрики монтажников за месяц.
 * Среднее время прибытия = depart→arrive, выполнения = start→finish (visit_steps);
 * повторные выезды = visits.repeat_of + акты needs_rework; «качество» = доля
 * закрытых актов без доработки.
 */
import { monthBounds } from "@/lib/billing/dates";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export type InstallerCard = {
  user_id: string;
  full_name: string;
  active_requests: number;
  done_acts: number;
  overdue_requests: number;
  avg_arrival_min: number | null;
  avg_work_min: number | null;
  repeat_visits: number;
  rework_acts: number;
  quality_pct: number | null;
};

export async function installerCards(q: Q, period: string): Promise<InstallerCard[]> {
  const { start, end } = monthBounds(period);
  const rows = await q<Record<string, string | null>>(
    `
    WITH techs AS (
      SELECT u.id, u.full_name FROM users u
      JOIN roles r ON r.id = u.role_id
      WHERE r.code = 'installer' AND u.is_active
    ),
    step_pairs AS (
      SELECT v.installer_id,
             extract(epoch FROM (arr.created_at - dep.created_at))/60 AS arrival_min,
             extract(epoch FROM (fin.created_at - st.created_at))/60  AS work_min
      FROM visits v
      LEFT JOIN LATERAL (SELECT created_at FROM visit_steps WHERE visit_id=v.id AND step='depart' ORDER BY created_at LIMIT 1) dep ON true
      LEFT JOIN LATERAL (SELECT created_at FROM visit_steps WHERE visit_id=v.id AND step='arrive' ORDER BY created_at LIMIT 1) arr ON true
      LEFT JOIN LATERAL (SELECT created_at FROM visit_steps WHERE visit_id=v.id AND step='start'  ORDER BY created_at LIMIT 1) st  ON true
      LEFT JOIN LATERAL (SELECT created_at FROM visit_steps WHERE visit_id=v.id AND step='finish' ORDER BY created_at LIMIT 1) fin ON true
      WHERE v.created_at >= $1::date AND v.created_at < ($2::date + 1)
    ),
    acts AS (
      SELECT performed_by,
             count(*) FILTER (WHERE status = 'done') AS done_acts,
             count(*) FILTER (WHERE status = 'needs_rework') AS rework_acts
      FROM maintenance_acts
      WHERE COALESCE(closed_at, updated_at) >= $1::date
        AND COALESCE(closed_at, updated_at) < ($2::date + 1)
      GROUP BY performed_by
    )
    SELECT t.id AS user_id, t.full_name,
      (SELECT count(*) FROM requests r WHERE r.installer_id = t.id
         AND r.status NOT IN ('completed','closed','cancelled'))::text AS active_requests,
      COALESCE(a.done_acts, 0)::text AS done_acts,
      (SELECT count(*) FROM requests r WHERE r.installer_id = t.id AND r.status = 'overdue')::text AS overdue_requests,
      (SELECT round(avg(arrival_min)) FROM step_pairs sp WHERE sp.installer_id = t.id AND arrival_min BETWEEN 0 AND 1440)::text AS avg_arrival_min,
      (SELECT round(avg(work_min)) FROM step_pairs sp WHERE sp.installer_id = t.id AND work_min BETWEEN 0 AND 1440)::text AS avg_work_min,
      (SELECT count(*) FROM visits v WHERE v.installer_id = t.id AND v.repeat_of IS NOT NULL
         AND v.created_at >= $1::date AND v.created_at < ($2::date + 1))::text AS repeat_visits,
      COALESCE(a.rework_acts, 0)::text AS rework_acts
    FROM techs t
    LEFT JOIN acts a ON a.performed_by = t.id
    ORDER BY t.full_name`,
    [start, end]
  );
  return rows.map((r) => {
    const done = Number(r.done_acts);
    const rework = Number(r.rework_acts);
    return {
      user_id: String(r.user_id),
      full_name: String(r.full_name),
      active_requests: Number(r.active_requests),
      done_acts: done,
      overdue_requests: Number(r.overdue_requests),
      avg_arrival_min: r.avg_arrival_min ? Number(r.avg_arrival_min) : null,
      avg_work_min: r.avg_work_min ? Number(r.avg_work_min) : null,
      repeat_visits: Number(r.repeat_visits),
      rework_acts: rework,
      quality_pct: done + rework > 0 ? Math.round((done / (done + rework)) * 100) : null,
    };
  });
}
