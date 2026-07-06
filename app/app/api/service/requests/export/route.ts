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
  const type = sp.get("type") ?? "";
  const clientId = sp.get("client_id") ?? "";

  const rows = await query<Record<string, unknown>>(
    `SELECT r.number, c.name AS client, o.name AS object, r.type, r.priority, r.status,
            um.full_name AS manager, us.full_name AS support, ui.full_name AS installer,
            to_char(r.due_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS due_at,
            to_char(r.created_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI') AS created_at,
            r.result_comment
     FROM requests r
     JOIN clients c ON c.id = r.client_id
     LEFT JOIN monitoring_objects o ON o.id = r.object_id
     LEFT JOIN users um ON um.id = r.manager_id
     LEFT JOIN users us ON us.id = r.support_id
     LEFT JOIN users ui ON ui.id = r.installer_id
     WHERE ($1 = '' OR r.status = $1)
       AND ($2 = '' OR r.type = $2)
       AND ($3 = '' OR r.client_id = $3::uuid)
     ORDER BY r.created_at DESC`,
    [status, type, clientId]
  );
  const mapped = rows.map((r) => ({
    ...r,
    type: (d.requestTypes as Record<string, string>)[String(r.type)] ?? r.type,
    priority: (d.priorities as Record<string, string>)[String(r.priority)] ?? r.priority,
    status: (d.requestStatuses as Record<string, string>)[String(r.status)] ?? r.status,
  }));
  return excelResponse(
    d.requestsTitle,
    [
      { header: d.number, key: "number", width: 12 },
      { header: d.client, key: "client", width: 30 },
      { header: d.object, key: "object", width: 26 },
      { header: d.type, key: "type", width: 28 },
      { header: d.priority, key: "priority", width: 12 },
      { header: d.status, key: "status", width: 18 },
      { header: d.manager, key: "manager", width: 22 },
      { header: d.support, key: "support", width: 22 },
      { header: d.installer, key: "installer", width: 22 },
      { header: d.dueAt, key: "due_at", width: 17 },
      { header: d.createdAt, key: "created_at", width: 17 },
      { header: d.resultComment, key: "result_comment", width: 40 },
    ],
    mapped
  );
}
