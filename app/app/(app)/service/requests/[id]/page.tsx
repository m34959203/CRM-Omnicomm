import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import { requestStatusBadge, priorityBadge, orderStatusBadge, fmtAlmaty } from "../../badges";
import { AttachmentsGallery, type AttachmentItem } from "../../attachments-gallery";
import { RequestActions } from "./request-actions";

type RequestRow = {
  id: string;
  number: string;
  client_id: string;
  client_name: string;
  object_name: string | null;
  type: string;
  priority: string;
  status: string;
  subject: string | null;
  description: string | null;
  photo_required: boolean;
  due_at: string | null;
  result_comment: string | null;
  manager_id: string | null;
  support_id: string | null;
  installer_id: string | null;
  created_at: string;
};

export default async function RequestCardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  const d = t(user.locale);
  const s = d.service;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const [[r], history, attachments, orders, users] = await Promise.all([
    query<RequestRow>(
      `SELECT r.*, c.name AS client_name, o.name AS object_name
       FROM requests r
       JOIN clients c ON c.id = r.client_id
       LEFT JOIN monitoring_objects o ON o.id = r.object_id
       WHERE r.id = $1::uuid`,
      [id]
    ),
    query<{ id: string; action: string; detail: string | null; user_name: string | null; created_at: string }>(
      `SELECT h.id, h.action, h.detail, u.full_name AS user_name, h.created_at
       FROM request_history h LEFT JOIN users u ON u.id = h.user_id
       WHERE h.request_id = $1::uuid ORDER BY h.created_at DESC LIMIT 100`,
      [id]
    ),
    query<AttachmentItem>(
      `SELECT id, kind, place, filename FROM attachments
       WHERE entity_type = 'request' AND entity_id = $1::uuid ORDER BY created_at DESC`,
      [id]
    ),
    query<{ id: string; number: string; status: string; scheduled_start: string | null }>(
      `SELECT id, number, status, scheduled_start FROM work_orders
       WHERE request_id = $1::uuid ORDER BY created_at DESC`,
      [id]
    ),
    query<{ id: string; full_name: string; role_code: string }>(
      `SELECT u.id, u.full_name, r.code AS role_code
       FROM users u JOIN roles r ON r.id = u.role_id WHERE u.is_active ORDER BY u.full_name`,
      []
    ),
  ]);
  if (!r) notFound();

  const canEdit = ["admin", "manager", "support", "head"].includes(user.role);
  const info: [string, React.ReactNode][] = [
    [s.client, r.client_name],
    [s.object, r.object_name ?? "—"],
    [s.type, (s.requestTypes as Record<string, string>)[r.type] ?? r.type],
    [s.priority, priorityBadge(r.priority, s)],
    [s.dueAt, fmtAlmaty(r.due_at)],
    [s.createdAt, fmtAlmaty(r.created_at)],
  ];

  return (
    <div className="max-w-5xl">
      <div className="flex items-center gap-3">
        <Link href="/service/requests" className="text-sm text-ink-dim hover:text-accent-ink">
          ← {s.requestsTitle}
        </Link>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{r.number}</h1>
        {requestStatusBadge(r.status, s)}
        {r.photo_required && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800">
            {s.photoRequired}
          </span>
        )}
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-lg border border-line bg-card p-5">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {info.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs uppercase tracking-wider text-ink-dim">{k}</dt>
                  <dd className="mt-0.5 text-sm">{v}</dd>
                </div>
              ))}
            </dl>
            {(r.subject || r.description) && (
              <div className="mt-4 border-t border-line pt-3">
                {r.subject && <div className="text-sm font-medium">{r.subject}</div>}
                {r.description && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-ink-dim">{r.description}</p>
                )}
              </div>
            )}
            {r.result_comment && (
              <div className="mt-4 rounded border border-line bg-paper px-3 py-2 text-sm">
                <span className="text-xs uppercase tracking-wider text-ink-dim">
                  {s.resultComment}:
                </span>{" "}
                {r.result_comment}
              </div>
            )}
          </div>

          {canEdit && (
            <RequestActions
              id={r.id}
              status={r.status}
              managerId={r.manager_id}
              supportId={r.support_id}
              installerId={r.installer_id}
              users={users}
              s={{
                changeStatus: s.changeStatus,
                resultComment: s.resultComment,
                statuses: s.requestStatuses as Record<string, string>,
                manager: s.manager,
                support: s.support,
                installer: s.installer,
                save: d.common.save,
                createOrder: s.createOrder,
              }}
            />
          )}

          <div className="rounded-lg border border-line bg-card p-5">
            <AttachmentsGallery
              entityType="request"
              entityId={r.id}
              items={attachments}
              labels={{ title: s.photos, upload: s.uploadPhoto }}
              canUpload={canEdit || user.role === "installer"}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
              {s.tabOrders}
            </h2>
            <ul className="mt-2 space-y-1.5">
              {orders.length === 0 && <li className="text-sm text-ink-dim">—</li>}
              {orders.map((w) => (
                <li key={w.id} className="flex items-center gap-2 text-sm">
                  <Link
                    href={`/service/orders/${w.id}`}
                    className="font-mono text-[13px] font-medium text-accent-ink hover:underline"
                  >
                    {w.number}
                  </Link>
                  {orderStatusBadge(w.status, s)}
                  <span className="text-xs text-ink-dim">{fmtAlmaty(w.scheduled_start)}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-line bg-card p-5">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-dim">
              {s.history}
            </h2>
            <ul className="mt-2 space-y-2">
              {history.map((h) => (
                <li key={h.id} className="border-l-2 border-line pl-3 text-sm">
                  <div>{h.detail ?? h.action}</div>
                  <div className="text-xs text-ink-dim">
                    {h.user_name ?? "—"} · {fmtAlmaty(h.created_at)}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
