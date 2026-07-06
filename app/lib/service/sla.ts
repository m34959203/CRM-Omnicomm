/**
 * Нормативы сроков (SLA) и джоб просрочек.
 * dueAtFor: расчёт due_at из норматива типа заявки (если не задан вручную).
 * markOverdueAndNotify: активные заявки с истёкшим due_at → status='overdue'
 * + история + адресные уведомления (менеджер заявки и руководство head/boss —
 * telegram при заполненном chat_id, иначе email) через очередь уведомлений.
 */
import { query, tx } from "@/lib/db";
import { enqueueNotification } from "@/lib/notify/worker";

export async function dueAtFor(requestType: string): Promise<string | null> {
  const [sla] = await query<{ execution_hours: number }>(
    `SELECT execution_hours FROM request_sla WHERE request_type = $1 AND is_active`,
    [requestType]
  );
  if (!sla) return null;
  const [row] = await query<{ due: string }>(
    `SELECT (now() + ($1::int || ' hours')::interval)::text AS due`,
    [sla.execution_hours]
  );
  return row.due;
}

const ACTIVE_STATUSES = [
  "new", "assigned", "in_progress", "visit_planned", "installer_departed",
  "installer_on_site", "working", "wait_client", "wait_parts", "in_review",
];

type OverdueRow = {
  id: string;
  number: string;
  subject: string | null;
  type: string;
  due_at: string;
  client_name: string | null;
  manager_id: string | null;
};

export async function markOverdueAndNotify(): Promise<{ marked: number; notified: number }> {
  const rows = await tx(async (q) => {
    const overdue = await q<OverdueRow>(
      `UPDATE requests r SET status = 'overdue'
       WHERE r.due_at < now() AND r.status = ANY($1)
       RETURNING r.id, r.number, r.subject, r.type, r.due_at::text, r.manager_id,
         (SELECT name FROM clients WHERE id = r.client_id) AS client_name`,
      [ACTIVE_STATUSES]
    );
    for (const r of overdue) {
      await q(
        `INSERT INTO request_history (request_id, action, detail)
         VALUES ($1, 'status', 'overdue: авто-простановка по нормативу SLA')`,
        [r.id]
      );
    }
    return overdue;
  });

  // Получатели: менеджер каждой заявки + все head/boss (один раз списком).
  let notified = 0;
  if (rows.length > 0) {
    const managers = await query<{ id: string; email: string; telegram_chat_id: string | null; full_name: string }>(
      `SELECT DISTINCT u.id, u.email, u.telegram_chat_id, u.full_name
       FROM users u
       WHERE u.is_active AND (
         u.id = ANY($1::uuid[])
         OR u.role_id IN (SELECT id FROM roles WHERE code IN ('head','boss'))
       )`,
      [rows.map((r) => r.manager_id).filter(Boolean)]
    );
    const list = rows
      .map((r) => `• ${r.number} (${r.client_name ?? "—"}): ${r.subject ?? r.type}, срок ${r.due_at.slice(0, 16)}`)
      .join("\n");
    const body = `Просрочены заявки (${rows.length}):\n${list}`;
    for (const u of managers) {
      try {
        await enqueueNotification({
          channel: u.telegram_chat_id ? "telegram" : "email",
          recipient: u.telegram_chat_id ?? u.email,
          subject: `Просроченные заявки: ${rows.length}`,
          body,
          entityType: "request",
        });
        notified++;
      } catch {
        // очередь недоступна — не роняем джоб
      }
    }
  }
  return { marked: rows.length, notified };
}
