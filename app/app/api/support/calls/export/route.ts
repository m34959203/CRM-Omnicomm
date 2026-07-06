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
  const direction = sp.get("direction") ?? "";
  const clientId = sp.get("client_id") ?? "";

  const rows = await query<Record<string, unknown>>(
    `SELECT to_char(cl.created_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS created_at,
            cl.direction, cl.phone, c.name AS client, r.number AS request,
            cl.duration_sec, cl.result, u.full_name AS registered_by
     FROM calls cl
     LEFT JOIN clients c ON c.id = cl.client_id
     LEFT JOIN requests r ON r.id = cl.request_id
     LEFT JOIN users u ON u.id = cl.user_id
     WHERE ($1 = '' OR cl.direction = $1)
       AND ($2 = '' OR cl.client_id = $2::uuid)
     ORDER BY cl.created_at DESC`,
    [direction, clientId]
  );
  const mapped = rows.map((r) => ({
    ...r,
    direction: (s.directions as Record<string, string>)[String(r.direction)] ?? r.direction,
  }));
  return excelResponse(
    s.callsTitle,
    [
      { header: s.createdAt, key: "created_at", width: 17 },
      { header: s.direction, key: "direction", width: 14 },
      { header: s.phone, key: "phone", width: 18 },
      { header: s.client, key: "client", width: 30 },
      { header: s.request, key: "request", width: 12 },
      { header: s.durationSec, key: "duration_sec", width: 14 },
      { header: s.result, key: "result", width: 36 },
      { header: s.registeredBy, key: "registered_by", width: 24 },
    ],
    mapped
  );
}
