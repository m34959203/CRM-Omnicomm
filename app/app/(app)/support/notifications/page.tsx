import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import {
  SUPPORT_READ_ROLES,
  SUPPORT_WRITE_ROLES,
  NOTIFY_CHANNELS,
} from "@/lib/support/common";
import { SupportTabs } from "../tabs";
import { channelBadge, queueStatusBadge, fmtAlmaty } from "../badges";
import {
  SendNowButton,
  CancelQueueItemButton,
  TemplateForm,
  TemplateRowActions,
  type TemplateRow,
} from "./notifications-client";

type QueueRow = {
  id: string;
  created_at: string;
  channel: string;
  recipient: string;
  template_code: string | null;
  subject: string | null;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  sent_at: string | null;
  last_error: string | null;
};

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!SUPPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const s = d.support;
  const canEdit = SUPPORT_WRITE_ROLES.includes(user.role);
  const canRun = ["admin", "head"].includes(user.role);
  const sp = await searchParams;
  const tab = sp.tab === "templates" ? "templates" : "queue";
  const status = sp.status ?? "";

  const channelOptions: [string, string][] = NOTIFY_CHANNELS.map((ch) => [
    ch,
    (s.channels as Record<string, string>)[ch] ?? ch,
  ]);

  const subTab = (key: string, href: string, lbl: string) => (
    <Link
      key={key}
      href={href}
      className={
        key === tab
          ? "rounded-md bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent-ink"
          : "rounded-md px-3 py-1.5 text-sm text-ink-dim transition hover:text-accent-ink"
      }
    >
      {lbl}
    </Link>
  );

  if (tab === "templates") {
    const templates = await query<TemplateRow>(
      `SELECT id, code, channel, subject_ru, subject_kk, body_ru, body_kk, is_active
       FROM notification_templates ORDER BY code`
    );
    return (
      <div>
        <h1 className="text-2xl font-semibold">{s.notificationsTitle}</h1>
        <SupportTabs d={d} active="notifications" />
        <div className="mt-4 flex gap-1">
          {subTab("queue", "/support/notifications", s.tabQueue)}
          {subTab("templates", "/support/notifications?tab=templates", s.tabTemplates)}
        </div>

        <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
                <th className="px-4 py-3 font-medium">{s.code}</th>
                <th className="px-4 py-3 font-medium">{s.channel}</th>
                <th className="px-4 py-3 font-medium">{s.subjectRu}</th>
                <th className="px-4 py-3 font-medium">{s.bodyRu}</th>
                {canEdit && <th className="px-4 py-3 font-medium">{d.common.actions}</th>}
              </tr>
            </thead>
            <tbody>
              {templates.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-ink-dim">
                    {d.common.empty}
                  </td>
                </tr>
              )}
              {templates.map((tpl) => (
                <tr
                  key={tpl.id}
                  className={`border-b border-line last:border-0 ${tpl.is_active ? "" : "opacity-50"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-[13px] font-medium">{tpl.code}</td>
                  <td className="px-4 py-2.5">{channelBadge(tpl.channel, s)}</td>
                  <td className="px-4 py-2.5">{tpl.subject_ru ?? "—"}</td>
                  <td className="px-4 py-2.5 max-w-md">
                    <span className="line-clamp-2 whitespace-pre-wrap text-[13px]">{tpl.body_ru}</span>
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5 align-top">
                      <TemplateRowActions
                        template={tpl}
                        channels={channelOptions}
                        labels={{
                          edit: s.editTemplate,
                          delete: d.common.delete,
                          code: s.code,
                          channel: s.channel,
                          subjectRu: s.subjectRu,
                          subjectKk: s.subjectKk,
                          bodyRu: s.bodyRu,
                          bodyKk: s.bodyKk,
                          save: d.common.save,
                        }}
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {canEdit && (
          <TemplateForm
            channels={channelOptions}
            labels={{
              add: s.addTemplate,
              code: s.code,
              channel: s.channel,
              subjectRu: s.subjectRu,
              subjectKk: s.subjectKk,
              bodyRu: s.bodyRu,
              bodyKk: s.bodyKk,
              save: d.common.save,
            }}
          />
        )}
      </div>
    );
  }

  const rows = await query<QueueRow>(
    `SELECT id, created_at::text, channel, recipient, template_code, subject, status,
            attempts, next_attempt_at::text, sent_at::text, last_error
     FROM notification_queue
     WHERE ($1 = '' OR status = $1)
     ORDER BY created_at DESC
     LIMIT 300`,
    [status]
  );

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{s.notificationsTitle}</h1>
        {canRun && <SendNowButton labels={{ send: s.sendNow, processed: s.processed }} />}
      </div>
      <SupportTabs d={d} active="notifications" />
      <div className="mt-4 flex gap-1">
        {subTab("queue", "/support/notifications", s.tabQueue)}
        {subTab("templates", "/support/notifications?tab=templates", s.tabTemplates)}
      </div>

      <form method="GET" className="mt-4 flex flex-wrap items-center gap-2">
        <select name="status" defaultValue={status} className={sel}>
          <option value="">{s.allStatuses}</option>
          {Object.entries(s.queueStatuses).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent">
          {s.apply}
        </button>
      </form>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{s.createdAt}</th>
              <th className="px-4 py-3 font-medium">{s.channel}</th>
              <th className="px-4 py-3 font-medium">{s.recipient}</th>
              <th className="px-4 py-3 font-medium">{s.template}</th>
              <th className="px-4 py-3 font-medium">{s.subject}</th>
              <th className="px-4 py-3 font-medium">{s.status}</th>
              <th className="px-4 py-3 text-right font-medium">{s.attempts}</th>
              <th className="px-4 py-3 font-medium">{s.lastError}</th>
              {canEdit && <th className="px-4 py-3 font-medium">{d.common.actions}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2.5 text-[13px] whitespace-nowrap">{fmtAlmaty(r.created_at)}</td>
                <td className="px-4 py-2.5">{channelBadge(r.channel, s)}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.recipient}</td>
                <td className="px-4 py-2.5 font-mono text-[13px]">{r.template_code ?? "—"}</td>
                <td className="px-4 py-2.5 max-w-xs">
                  <span className="line-clamp-1">{r.subject ?? "—"}</span>
                </td>
                <td className="px-4 py-2.5">{queueStatusBadge(r.status, s)}</td>
                <td className="px-4 py-2.5 text-right">{r.attempts}</td>
                <td className="px-4 py-2.5 max-w-xs">
                  <span className="line-clamp-2 text-[13px] text-ink-dim">{r.last_error ?? "—"}</span>
                </td>
                {canEdit && (
                  <td className="px-4 py-2.5">
                    {["queued", "failed"].includes(r.status) && (
                      <CancelQueueItemButton id={r.id} labelCancel={s.cancelItem} />
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
