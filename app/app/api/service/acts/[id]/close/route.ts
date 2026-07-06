import { requireRole, authErrorResponse } from "@/lib/auth";
import { closeMaintenanceAct, ActCloseError } from "@/lib/service/act-close";
import { syncActivations } from "@/lib/service/activation-sync";
import { ACT_CLOSE_ROLES } from "@/lib/service/common";

/**
 * Закрытие акта ТО (движения, ESH, SIM, ЗП — в одной транзакции документа),
 * затем best-effort синхронизация активаций в Omnicomm ВНЕ транзакции:
 * сетевые ошибки СМ не откатывают документ, а фиксируются в sync_log.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(ACT_CLOSE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = (await req.json().catch(() => null)) ?? {};

  try {
    const result = await closeMaintenanceAct(id, userId, {
      returnWarehouseId: b.return_warehouse_id || undefined,
    });
    await syncActivations(result.activations); // никогда не бросает
    return Response.json(result);
  } catch (e) {
    if (e instanceof ActCloseError) {
      return Response.json({ error: e.message }, { status: e.status });
    }
    console.error("act close:", e);
    return Response.json({ error: "server" }, { status: 500 });
  }
}
