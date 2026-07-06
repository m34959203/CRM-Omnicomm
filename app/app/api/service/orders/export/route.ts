import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";
import { t } from "@/lib/i18n";
import { SERVICE_READ_ROLES } from "@/lib/service/common";

export async function GET(req: Request) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(SERVICE_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const d = t(locale).service;
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") ?? "";
  const clientId = sp.get("client_id") ?? "";

  const rows = await query<Record<string, unknown>>(
    `SELECT w.number, c.name AS client, o.name AS object, w.address, w.status,
            r.number AS request_number,
            to_char(w.scheduled_start AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS scheduled_start,
            to_char(w.scheduled_end AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS scheduled_end,
            (SELECT string_agg(u.full_name, ', ') FROM work_order_performers p
             JOIN users u ON u.id = p.user_id WHERE p.work_order_id = w.id) AS performers,
            to_char(w.created_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS created_at
     FROM work_orders w
     LEFT JOIN clients c ON c.id = w.client_id
     LEFT JOIN monitoring_objects o ON o.id = w.object_id
     LEFT JOIN requests r ON r.id = w.request_id
     WHERE ($1 = '' OR w.status = $1)
       AND ($2 = '' OR w.client_id = $2::uuid)
     ORDER BY w.created_at DESC`,
    [status, clientId]
  );
  const mapped = rows.map((r) => ({
    ...r,
    status: (d.orderStatuses as Record<string, string>)[String(r.status)] ?? r.status,
  }));
  return excelResponse(
    d.ordersTitle,
    [
      { header: d.number, key: "number", width: 12 },
      { header: d.client, key: "client", width: 30 },
      { header: d.object, key: "object", width: 26 },
      { header: d.address, key: "address", width: 30 },
      { header: d.fromRequest, key: "request_number", width: 12 },
      { header: d.scheduledStart, key: "scheduled_start", width: 17 },
      { header: d.scheduledEnd, key: "scheduled_end", width: 17 },
      { header: d.performers, key: "performers", width: 30 },
      { header: d.status, key: "status", width: 15 },
      { header: d.createdAt, key: "created_at", width: 17 },
    ],
    mapped
  );
}
