import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { omnicommClientFor, writeSyncLog, type TelematicsServerRow } from "@/lib/telematics/server";

const STATES = ["active", "conservation", "disabled"] as const;

type LinkRow = {
  link_id: string;
  external_uuid: string;
  sync_status: string;
  server_id: string;
  server_name: string;
  server_type: string;
  base_url: string;
  auth_login: string | null;
  auth_secret: string | null;
  is_active: boolean;
  health_status: string;
  health_checked_at: string | null;
};

/**
 * «Установка состояния» из карточки клиента: ESH-переход (закрыть открытый
 * интервал, открыть новый, source_type='manual') + billing_state; для
 * active/conservation — best-effort setDataCapture через привязку СМ
 * (ошибка → sync_log, операцию не роняет).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "manager", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const state = b?.state as (typeof STATES)[number];
  if (!STATES.includes(state)) {
    return Response.json({ error: "state: active|conservation|disabled" }, { status: 400 });
  }

  const result = await tx(async (q) => {
    const [eq] = await q<{
      id: string;
      status: string;
      billing_state: string | null;
      client_id: string | null;
      object_id: string | null;
      contract_id: string | null;
    }>(
      `SELECT id, status, billing_state, client_id, object_id, contract_id
       FROM equipment_items WHERE id = $1::uuid FOR UPDATE`,
      [id]
    );
    if (!eq) return { error: "not found", status: 404 } as const;
    if (eq.status !== "installed") {
      return { error: "оборудование не установлено у клиента", status: 409 } as const;
    }
    if (eq.billing_state === state) {
      return { error: "состояние уже установлено", status: 409 } as const;
    }
    // Регистр состояний — источник посуточного биллинга: закрываем открытый интервал, добавляем новый.
    await q(
      `UPDATE equipment_state_history SET valid_to = now()
       WHERE equipment_id = $1::uuid AND valid_to IS NULL`,
      [id]
    );
    await q(
      `INSERT INTO equipment_state_history
         (equipment_id, object_id, client_id, contract_id, state, valid_from, source_type)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, now(), 'manual')`,
      [id, eq.object_id, eq.client_id, eq.contract_id, state]
    );
    await q(
      `UPDATE equipment_items SET billing_state = $2, updated_at = now() WHERE id = $1::uuid`,
      [id, state]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'set_state', 'equipment_item', $2, $3)`,
      [userId, id, JSON.stringify({ from: eq.billing_state, to: state })]
    );
    return { ok: true } as const;
  });
  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }

  // Best-effort команда в СМ: consеrvation → приём выкл., active → приём вкл.
  let sync: "ok" | "error" | "skipped" = "skipped";
  if (state !== "disabled") {
    const [link] = await query<LinkRow>(
      `SELECT l.id AS link_id, l.external_uuid, l.sync_status,
              s.id AS server_id, s.name AS server_name, s.server_type, s.base_url,
              s.auth_login, s.auth_secret, s.is_active, s.health_status, s.health_checked_at
       FROM telematics_object_links l
       JOIN telematics_servers s ON s.id = l.server_id
       WHERE l.equipment_id = $1::uuid AND l.sync_status <> 'deleted'
       ORDER BY l.created_at DESC LIMIT 1`,
      [id]
    );
    if (link) {
      const server: TelematicsServerRow = {
        id: link.server_id,
        name: link.server_name,
        server_type: link.server_type,
        base_url: link.base_url,
        auth_login: link.auth_login,
        auth_secret: link.auth_secret,
        is_active: link.is_active,
        health_status: link.health_status,
        health_checked_at: link.health_checked_at,
      };
      const enabled = state === "active";
      const operation = enabled ? "enable_reception" : "disable_reception";
      const start = Date.now();
      try {
        await omnicommClientFor(server).setDataCapture(link.external_uuid, enabled);
        await query(
          `UPDATE telematics_object_links
           SET data_reception_enabled = $2, last_synced_at = now(), updated_at = now()
           WHERE id = $1::uuid`,
          [link.link_id, enabled]
        );
        await writeSyncLog({
          serverId: server.id,
          operation,
          entityType: "telematics_object_link",
          entityId: link.link_id,
          status: "ok",
          payload: { external_uuid: link.external_uuid, enabled, via: "client_card" },
          durationMs: Date.now() - start,
        });
        sync = "ok";
      } catch (e) {
        await writeSyncLog({
          serverId: server.id,
          operation,
          entityType: "telematics_object_link",
          entityId: link.link_id,
          status: "error",
          errorMessage: (e as Error).message,
          durationMs: Date.now() - start,
        });
        sync = "error";
      }
    }
  }

  return Response.json({ ok: true, state, sync });
}
