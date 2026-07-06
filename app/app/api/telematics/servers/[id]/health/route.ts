import { requireRole, authErrorResponse } from "@/lib/auth";
import { getServer, probeAndStore, writeSyncLog } from "@/lib/telematics/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireRole(["admin", "head"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const server = await getServer(id);
  if (!server) return Response.json({ error: "not found" }, { status: 404 });

  const probe = await probeAndStore(server);
  await writeSyncLog({
    serverId: server.id,
    operation: "health",
    entityType: "telematics_server",
    entityId: server.id,
    status: probe.ok ? "ok" : "error",
    errorMessage: probe.error ?? null,
    payload: { health_status: probe.status },
    durationMs: probe.ms,
  });
  return Response.json({
    health_status: probe.status,
    ms: probe.ms,
    error: probe.error ?? null,
  });
}
