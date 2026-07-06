import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";

export async function GET(req: Request) {
  try {
    await requireRole(["admin", "manager", "support", "head", "boss"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const errorsOnly = new URL(req.url).searchParams.get("errors") === "1";
  const rows = await query(
    `SELECT to_char(l.created_at AT TIME ZONE 'Asia/Almaty', 'DD.MM.YYYY HH24:MI:SS') AS created,
            s.name AS server, l.operation, l.status, l.entity_type,
            l.error_message, l.payload::text AS payload, l.duration_ms
     FROM sync_log l
     LEFT JOIN telematics_servers s ON s.id = l.server_id
     WHERE ($1 = false OR l.status = 'error')
     ORDER BY l.created_at DESC
     LIMIT 5000`,
    [errorsOnly]
  );
  return excelResponse(
    "Журнал синхронизации",
    [
      { header: "Дата/время", key: "created", width: 20 },
      { header: "Сервер", key: "server", width: 24 },
      { header: "Операция", key: "operation", width: 18 },
      { header: "Статус", key: "status", width: 10 },
      { header: "Сущность", key: "entity_type", width: 22 },
      { header: "Ошибка", key: "error_message", width: 50 },
      { header: "Данные", key: "payload", width: 40 },
      { header: "мс", key: "duration_ms", width: 8 },
    ],
    rows,
    {
      title: "Журнал синхронизации",
      params: errorsOnly ? [["Отбор:", "только ошибки"]] : [],
    }
  );
}
