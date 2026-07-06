import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_READ_ROLES } from "@/lib/service/common";

/** Автоподстановка адреса: последний адрес нарядов клиента. */
export async function GET(req: Request) {
  try {
    await requireRole(SERVICE_READ_ROLES);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const clientId = new URL(req.url).searchParams.get("client_id");
  if (!clientId) return Response.json({ address: null });
  const [row] = await query<{ address: string }>(
    `SELECT address FROM work_orders
     WHERE client_id = $1::uuid AND address IS NOT NULL AND address <> ''
     ORDER BY created_at DESC LIMIT 1`,
    [clientId]
  );
  return Response.json({ address: row?.address ?? null });
}
