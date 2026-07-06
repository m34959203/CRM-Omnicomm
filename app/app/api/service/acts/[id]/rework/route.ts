import { requireRole, authErrorResponse } from "@/lib/auth";
import { reworkMaintenanceAct, ActCloseError } from "@/lib/service/act-close";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

/** «Требуется доработка»: акт → needs_rework + авто-наряд по той же заявке. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = (await req.json().catch(() => null)) ?? {};
  try {
    const result = await reworkMaintenanceAct(id, userId, b.note?.trim() || undefined);
    return Response.json(result);
  } catch (e) {
    if (e instanceof ActCloseError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("act rework:", e);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
