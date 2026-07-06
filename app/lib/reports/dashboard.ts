/** Дашборд руководителя (этап 7): операционные и финансовые счётчики одним заходом. */
import { monthBounds, currentAlmatyPeriod } from "@/lib/billing/dates";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export type DashboardData = {
  requests: { status: string; count: number }[];
  overdueRequests: number;
  ordersToday: number;
  installersBusy: { full_name: string; orders: number }[];
  equipment: { installed: number; in_stock: number; with_technician: number; on_testing: number; at_supplier: number };
  billing: { period: string; billed: number; paid: number; documents: number };
  topDebtors: { client_name: string; debt: number }[];
  syncErrors24h: number;
  openTickets: number;
};

export async function dashboardData(q: Q): Promise<DashboardData> {
  const period = currentAlmatyPeriod();
  const { start, end } = monthBounds(period);

  const [requests, overdue, ordersToday, busy, eq, billing, debtors, syncErr, tickets] =
    await Promise.all([
      q<{ status: string; count: string }>(
        `SELECT status, count(*) AS count FROM requests
         WHERE status NOT IN ('closed','cancelled','completed') GROUP BY status ORDER BY count DESC`
      ),
      q<{ n: string }>(
        `SELECT count(*) AS n FROM requests
         WHERE due_at < now() AND status NOT IN ('closed','cancelled','completed')`
      ),
      q<{ n: string }>(
        `SELECT count(*) AS n FROM work_orders
         WHERE status IN ('planned','in_progress')
           AND scheduled_start < (CURRENT_DATE + 1)::timestamptz
           AND COALESCE(scheduled_end, scheduled_start) >= CURRENT_DATE::timestamptz`
      ),
      q<{ full_name: string; orders: string }>(
        `SELECT u.full_name, count(*) AS orders
         FROM work_order_performers p
         JOIN work_orders w ON w.id = p.work_order_id AND w.status IN ('planned','in_progress')
         JOIN users u ON u.id = p.user_id
         GROUP BY u.full_name ORDER BY orders DESC LIMIT 10`
      ),
      q<{ installed: string; in_stock: string; with_technician: string; on_testing: string; at_supplier: string }>(
        `SELECT count(*) FILTER (WHERE status='installed') AS installed,
                count(*) FILTER (WHERE status='in_stock') AS in_stock,
                count(*) FILTER (WHERE status='with_technician') AS with_technician,
                count(*) FILTER (WHERE status='on_testing') AS on_testing,
                count(*) FILTER (WHERE status='at_supplier') AS at_supplier
         FROM equipment_items`
      ),
      q<{ billed: string; paid: string; documents: string }>(
        `SELECT COALESCE(sum(total),0) AS billed, COALESCE(sum(paid_amount),0) AS paid, count(*) AS documents
         FROM billing_documents
         WHERE period_start >= $1::date AND period_start <= $2::date AND status <> 'cancelled'`,
        [start, end]
      ),
      q<{ client_name: string; debt: string }>(
        `SELECT c.name AS client_name,
                COALESCE(d.billed,0) - COALESCE(p.paid,0) AS debt
         FROM clients c
         LEFT JOIN (SELECT client_id, sum(total) AS billed FROM billing_documents
                    WHERE status <> 'cancelled' GROUP BY client_id) d ON d.client_id = c.id
         LEFT JOIN (SELECT client_id, sum(amount) AS paid FROM payments GROUP BY client_id) p ON p.client_id = c.id
         WHERE COALESCE(d.billed,0) - COALESCE(p.paid,0) > 0
         ORDER BY debt DESC LIMIT 5`
      ),
      q<{ n: string }>(
        `SELECT count(*) AS n FROM sync_log WHERE status='error' AND created_at > now() - interval '24 hours'`
      ),
      q<{ n: string }>(
        `SELECT count(*) AS n FROM tickets WHERE status IN ('new','in_progress','on_service')`
      ),
    ]);

  return {
    requests: requests.map((r) => ({ status: r.status, count: Number(r.count) })),
    overdueRequests: Number(overdue[0].n),
    ordersToday: Number(ordersToday[0].n),
    installersBusy: busy.map((b) => ({ full_name: b.full_name, orders: Number(b.orders) })),
    equipment: {
      installed: Number(eq[0].installed),
      in_stock: Number(eq[0].in_stock),
      with_technician: Number(eq[0].with_technician),
      on_testing: Number(eq[0].on_testing),
      at_supplier: Number(eq[0].at_supplier),
    },
    billing: {
      period,
      billed: Number(billing[0].billed),
      paid: Number(billing[0].paid),
      documents: Number(billing[0].documents),
    },
    topDebtors: debtors.map((d) => ({ client_name: d.client_name, debt: Number(d.debt) })),
    syncErrors24h: Number(syncErr[0].n),
    openTickets: Number(tickets[0].n),
  };
}
