import { requireRole, authErrorResponse } from "@/lib/auth";
import { getServer, writeSyncLog } from "@/lib/telematics/server";
import {
  fetchVehiclesChecked,
  importVehicles,
  ImportUnavailableError,
} from "@/lib/telematics/import";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const server = await getServer(id);
  if (!server) return Response.json({ error: "not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const start = Date.now();
  try {
    const vehicles = await fetchVehiclesChecked(server);
    const result = await importVehicles(server, vehicles, userId, body?.client_id);
    await writeSyncLog({
      serverId: server.id,
      operation: "import",
      entityType: "telematics_server",
      entityId: server.id,
      status: "ok",
      payload: { created: result.created, updated: result.updated, total: result.total },
      durationMs: Date.now() - start,
    });
    return Response.json(result);
  } catch (e) {
    if (e instanceof ImportUnavailableError) {
      return Response.json(
        { error: `Сервер недоступен, импорт отменён: ${e.message}` },
        { status: 503 }
      );
    }
    const msg = (e as Error).message ?? String(e);
    await writeSyncLog({
      serverId: server.id,
      operation: "import",
      entityType: "telematics_server",
      entityId: server.id,
      status: "error",
      errorMessage: msg,
      durationMs: Date.now() - start,
    });
    return Response.json({ error: msg }, { status: 502 });
  }
}
