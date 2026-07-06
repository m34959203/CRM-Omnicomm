import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { omnicommClientFor, writeSyncLog } from "@/lib/telematics/server";
import { getLinkWithServer } from "@/lib/telematics/links";

/** Консервация / возобновление: body { enabled: boolean } (false = консервация). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "manager", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (typeof b?.enabled !== "boolean") {
    return Response.json({ error: "enabled: boolean обязателен" }, { status: 400 });
  }
  const found = await getLinkWithServer(id);
  if (!found) return Response.json({ error: "not found" }, { status: 404 });
  const { link, server } = found;
  if (link.sync_status === "deleted") {
    return Response.json({ error: "объект удалён в СМ" }, { status: 409 });
  }

  const operation = b.enabled ? "enable_reception" : "disable_reception";
  const start = Date.now();
  try {
    await omnicommClientFor(server).setDataCapture(link.external_uuid, b.enabled);
  } catch (e) {
    const msg = (e as Error).message;
    await writeSyncLog({
      serverId: server.id,
      operation,
      entityType: "telematics_object_link",
      entityId: link.id,
      status: "error",
      errorMessage: msg,
      durationMs: Date.now() - start,
    });
    return Response.json({ error: `Omnicomm: ${msg}` }, { status: 502 });
  }

  await tx(async (q) => {
    await q(
      `UPDATE telematics_object_links
       SET data_reception_enabled = $2, last_synced_at = now(), updated_at = now()
       WHERE id = $1::uuid`,
      [link.id, b.enabled]
    );
    if (link.equipment_id) {
      // Регистр состояний — источник посуточного биллинга: закрываем открытый интервал, добавляем новый.
      const state = b.enabled ? "active" : "conservation";
      await q(
        `UPDATE equipment_state_history SET valid_to = now()
         WHERE equipment_id = $1::uuid AND valid_to IS NULL`,
        [link.equipment_id]
      );
      await q(
        `INSERT INTO equipment_state_history
           (equipment_id, object_id, client_id, contract_id, state, valid_from, source_type, source_id)
         VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, now(), 'sync', $6::uuid)`,
        [link.equipment_id, link.object_id, link.client_id, link.contract_id, state, link.id]
      );
      await q(
        `UPDATE equipment_items SET billing_state = $2, updated_at = now() WHERE id = $1::uuid`,
        [link.equipment_id, state]
      );
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, $2, 'telematics_object_link', $3, $4)`,
      [userId, b.enabled ? "resume" : "conserve", link.id, JSON.stringify({ external_uuid: link.external_uuid })]
    );
  });

  await writeSyncLog({
    serverId: server.id,
    operation,
    entityType: "telematics_object_link",
    entityId: link.id,
    status: "ok",
    payload: { external_uuid: link.external_uuid, enabled: b.enabled },
    durationMs: Date.now() - start,
  });
  return Response.json({ ok: true, data_reception_enabled: b.enabled });
}
