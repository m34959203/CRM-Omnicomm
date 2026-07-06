import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { omnicommClientFor, writeSyncLog } from "@/lib/telematics/server";
import { getLinkWithServer } from "@/lib/telematics/links";

/** Этап 1 двухэтапного удаления: резерв профиля → sync_status='pending_delete'. */
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
  if (link.sync_status === "deleted" || link.sync_status === "pending_delete") {
    return Response.json({ error: `объект уже в статусе ${link.sync_status}` }, { status: 409 });
  }

  const start = Date.now();
  let profile: Record<string, unknown>;
  try {
    profile = await omnicommClientFor(server).getVehicleProfile(link.external_uuid);
  } catch (e) {
    const msg = (e as Error).message;
    await writeSyncLog({
      serverId: server.id,
      operation: "pending_delete",
      entityType: "telematics_object_link",
      entityId: link.id,
      status: "error",
      errorMessage: msg,
      durationMs: Date.now() - start,
    });
    return Response.json({ error: `Omnicomm (резерв профиля): ${msg}` }, { status: 502 });
  }

  await tx(async (q) => {
    await q(
      `UPDATE telematics_object_links
       SET profile_backup = $2, profile_backup_at = now(),
           sync_status = 'pending_delete', updated_at = now()
       WHERE id = $1::uuid`,
      [link.id, JSON.stringify(profile)]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'mark_delete', 'telematics_object_link', $2, $3)`,
      [userId, link.id, JSON.stringify({ external_uuid: link.external_uuid })]
    );
  });

  await writeSyncLog({
    serverId: server.id,
    operation: "pending_delete",
    entityType: "telematics_object_link",
    entityId: link.id,
    status: "ok",
    payload: { external_uuid: link.external_uuid, profile_backed_up: true },
    durationMs: Date.now() - start,
  });
  return Response.json({ ok: true, sync_status: "pending_delete" });
}
