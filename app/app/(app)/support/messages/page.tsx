import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { query } from "@/lib/db";
import {
  SUPPORT_READ_ROLES,
  SUPPORT_WRITE_ROLES,
  MESSAGE_CHANNELS,
} from "@/lib/support/common";
import { SupportTabs } from "../tabs";
import { channelBadge, fmtAlmaty } from "../badges";
import { MessageForm } from "./messages-client";

type Row = {
  id: string;
  created_at: string;
  channel: string;
  direction: string;
  contact: string | null;
  client_name: string | null;
  text: string | null;
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string; client_id?: string }>;
}) {
  const user = await getSession();
  if (!user) redirect("/login");
  if (!SUPPORT_READ_ROLES.includes(user.role)) redirect("/dashboard");
  const d = t(user.locale);
  const s = d.support;
  const canEdit = SUPPORT_WRITE_ROLES.includes(user.role);
  const sp = await searchParams;
  const channel = sp.channel ?? "";
  const clientId = sp.client_id ?? "";

  const [rows, clients] = await Promise.all([
    query<Row>(
      `SELECT m.id, m.created_at::text, m.channel, m.direction, m.contact,
              c.name AS client_name, m.text
       FROM messages m
       LEFT JOIN clients c ON c.id = m.client_id
       WHERE ($1 = '' OR m.channel = $1)
         AND ($2 = '' OR m.client_id = $2::uuid)
       ORDER BY m.created_at DESC
       LIMIT 500`,
      [channel, clientId]
    ),
    query<{ id: string; name: string }>(
      `SELECT id, name FROM clients WHERE is_active ORDER BY name`
    ),
  ]);

  const sel =
    "rounded-md border border-line bg-card px-2 py-1.5 text-sm outline-none transition focus:border-accent";

  return (
    <div>
      <h1 className="text-2xl font-semibold">{s.messagesTitle}</h1>
      <SupportTabs d={d} active="messages" />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <select name="channel" defaultValue={channel} className={sel}>
            <option value="">{s.allChannels}</option>
            {MESSAGE_CHANNELS.map((ch) => (
              <option key={ch} value={ch}>
                {(s.channels as Record<string, string>)[ch]}
              </option>
            ))}
          </select>
          <select name="client_id" defaultValue={clientId} className={sel}>
            <option value="">{s.allClients}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button className="rounded-md border border-line bg-card px-3 py-1.5 text-sm transition hover:border-accent">
            {s.apply}
          </button>
        </form>
        {canEdit && (
          <MessageForm
            clients={clients}
            channels={MESSAGE_CHANNELS.map((ch) => [
              ch,
              (s.channels as Record<string, string>)[ch] ?? ch,
            ])}
            labels={{
              add: s.addMessage,
              channel: s.channel,
              direction: s.direction,
              directionIn: s.directionIn,
              directionOut: s.directionOut,
              contact: s.contact,
              client: s.client,
              text: s.text,
              save: d.common.save,
            }}
          />
        )}
      </div>

      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-ink-dim">
              <th className="px-4 py-3 font-medium">{s.createdAt}</th>
              <th className="px-4 py-3 font-medium">{s.channel}</th>
              <th className="px-4 py-3 font-medium">{s.direction}</th>
              <th className="px-4 py-3 font-medium">{s.contact}</th>
              <th className="px-4 py-3 font-medium">{s.client}</th>
              <th className="px-4 py-3 font-medium">{s.text}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-ink-dim">
                  {d.common.empty}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-line last:border-0 transition hover:bg-accent-soft/40">
                <td className="px-4 py-2.5 text-[13px] whitespace-nowrap">{fmtAlmaty(r.created_at)}</td>
                <td className="px-4 py-2.5">{channelBadge(r.channel, s)}</td>
                <td className="px-4 py-2.5 text-[13px]">
                  {r.direction === "in" ? s.directionIn : s.directionOut}
                </td>
                <td className="px-4 py-2.5">{r.contact ?? "—"}</td>
                <td className="px-4 py-2.5">{r.client_name ?? "—"}</td>
                <td className="px-4 py-2.5 max-w-md">
                  <span className="line-clamp-2 whitespace-pre-wrap">{r.text ?? "—"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
