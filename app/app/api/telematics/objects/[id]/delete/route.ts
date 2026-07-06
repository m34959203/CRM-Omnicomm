import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { omnicommClientFor, writeSyncLog } from "@/lib/telematics/server";
import { getLinkWithServer } from "@/lib/telematics/links";

/** Этап 2 двухэтапного удаления: фактическое удаление в Omnicomm (только admin/head). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const found = await getLinkWithServer(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  const { link, server } = found;
  if (link.sync_status !== "pending_delete") {
    return Response.json(
      { error: "удалять можно только объекты в статусе «к удалению» (pending_delete)" },
      { status: 409 }
    );
  }

  const start = Date.now();
  try {
    await omnicommClientFor(server).deleteVehicles([link.external_uuid]);
  } catch (e) {
    const msg = (e as Error).message;
    await writeSyncLog({
      serverId: server.id,
      operation: "delete",
      entityType: "telematics_object_link",
      entityId: link.id,
      status: "error",
      errorMessage: msg,
      durationMs: Date.now() - start,
    });
    return Response.json({ error: `Omnicomm (удаление): ${msg}` }, { status: 502 });
  }

  await tx(async (q) => {
    await q(
      `UPDATE telematics_object_links
       SET sync_status = 'deleted', data_reception_enabled = false,
           last_synced_at = now(), updated_at = now()
       WHERE id = $1::uuid`,
      [link.id]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'delete', 'telematics_object_link', $2, $3)`,
      [userId, link.id, JSON.stringify({ external_uuid: link.external_uuid })]
    );
  });

  await writeSyncLog({
    serverId: server.id,
    operation: "delete",
    entityType: "telematics_object_link",
    entityId: link.id,
    status: "ok",
    payload: { external_uuid: link.external_uuid },
    durationMs: Date.now() - start,
  });
  return Response.json({ ok: true, sync_status: "deleted" });
}
