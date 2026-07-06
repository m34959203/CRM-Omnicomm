import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";
import { t } from "@/lib/i18n";
import { SUPPORT_READ_ROLES } from "@/lib/support/common";

export async function GET(req: Request) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(SUPPORT_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const s = t(locale).support;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") ?? "";
  const channel = sp.get("channel") ?? "";
  const clientId = sp.get("client_id") ?? "";

  const rows = await query<Record<string, unknown>>(
    `SELECT tk.number, c.name AS client, tk.contact, tk.channel, tk.subject,
            tk.status, tk.resolution, u.full_name AS assigned,
            to_char(tk.created_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS created_at,
            to_char(tk.closed_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS closed_at
     FROM tickets tk
     LEFT JOIN clients c ON c.id = tk.client_id
     LEFT JOIN users u ON u.id = tk.assigned_to
     WHERE ($1 = '' OR tk.status = $1)
       AND ($2 = '' OR tk.channel = $2)
       AND ($3 = '' OR tk.client_id = $3::uuid)
     ORDER BY tk.created_at DESC`,
    [status, channel, clientId]
  );
  const mapped = rows.map((r) => ({
    ...r,
    channel: (s.channels as Record<string, string>)[String(r.channel)] ?? r.channel,
    status: (s.ticketStatuses as Record<string, string>)[String(r.status)] ?? r.status,
    resolution: r.resolution
      ? (s.resolutions as Record<string, string>)[String(r.resolution)] ?? r.resolution
      : null,
  }));
  const clientName = clientId
    ? (await query<{ name: string }>(`SELECT name FROM clients WHERE id = $1::uuid`, [clientId]))[0]
        ?.name ?? clientId
    : "";
  const params: [string, string][] = [];
  if (clientName) params.push([`${s.client}:`, clientName]);
  if (status) params.push([`${s.status}:`, (s.ticketStatuses as Record<string, string>)[status] ?? status]);
  if (channel) params.push([`${s.channel}:`, (s.channels as Record<string, string>)[channel] ?? channel]);
  return excelResponse(
    s.ticketsTitle,
    [
      { header: s.number, key: "number", width: 12 },
      { header: s.client, key: "client", width: 30 },
      { header: s.contact, key: "contact", width: 22 },
      { header: s.channel, key: "channel", width: 14 },
      { header: s.subject, key: "subject", width: 36 },
      { header: s.status, key: "status", width: 18 },
      { header: s.resolution, key: "resolution", width: 20 },
      { header: s.assigned, key: "assigned", width: 24 },
      { header: s.createdAt, key: "created_at", width: 17 },
      { header: s.closedAt, key: "closed_at", width: 17 },
    ],
    mapped,
    { title: s.ticketsTitle, params }
  );
}
