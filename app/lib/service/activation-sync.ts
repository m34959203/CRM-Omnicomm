/**
 * Best-effort синхронизация активаций/деактиваций оборудования с Omnicomm Online
 * после закрытия акта ТО. Вызывается ПОСЛЕ коммита транзакции документа —
 * ошибка сети/учётки не должна откатывать акт. Никогда не бросает.
 *
 * activated:   нет привязки объекта → создать объект в СМ (единственный активный
 *              сервер) и записать telematics_object_links (synced / error).
 * deactivated: привязка есть → выключить приём данных (консервация в СМ).
 */
import { query } from "@/lib/db";
import { omnicommClientFor, writeSyncLog, type TelematicsServerRow } from "@/lib/telematics/server";
import type { ActivationEvent } from "./act-close";

type LinkRow = { id: string; server_id: string; external_uuid: string; sync_status: string };

function extractUuid(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  for (const k of ["uuid", "vehicleUuid", "vehicle_uuid"]) {
    if (typeof d[k] === "string" && d[k]) return d[k] as string;
  }
  if (d.data && typeof d.data === "object") return extractUuid(d.data);
  return null;
}

/** manufactureId в Omnicomm: только [A-Za-z0-9], ≤50 символов. */
function sanitizeManufactureId(raw: string): string {
  return raw.replace(/[^A-Za-z0-9]/g, "").slice(0, 50);
}

export async function syncActivations(events: ActivationEvent[]): Promise<void> {
  for (const ev of events) {
    try {
      if (ev.kind === "activated") await syncActivated(ev);
      else await syncDeactivated(ev);
    } catch (e) {
      // последний рубеж: сама запись в sync_log упала — только консоль
      console.error("syncActivations:", (e as Error).message);
    }
  }
}

async function syncActivated(ev: ActivationEvent): Promise<void> {
  if (!ev.objectId) return; // без объекта создавать нечего
  const [existing] = await query<LinkRow>(
    `SELECT id, server_id, external_uuid, sync_status FROM telematics_object_links
     WHERE object_id = $1::uuid AND sync_status <> 'deleted' LIMIT 1`,
    [ev.objectId]
  );
  if (existing) return; // привязка уже есть — объект в СМ существует

  const servers = await query<TelematicsServerRow>(
    `SELECT id, name, server_type, base_url, auth_login, auth_secret,
            is_active, health_status, health_checked_at
     FROM telematics_servers WHERE is_active AND server_type = 'omnicomm'`
  );
  if (servers.length !== 1) {
    await writeSyncLog({
      operation: "create_object",
      entityType: "monitoring_object",
      entityId: ev.objectId,
      status: "error",
      errorMessage:
        servers.length === 0
          ? "Нет активного телематического сервера"
          : "Несколько активных серверов — выбор неоднозначен",
    });
    return;
  }
  const server = servers[0];

  const [info] = await query<{
    object_name: string;
    serial_number: string | null;
    imei: string | null;
    device_type: string | null;
  }>(
    `SELECT o.name AS object_name, e.serial_number, e.imei, n.device_type
     FROM monitoring_objects o
     LEFT JOIN equipment_items e ON e.id = $2::uuid
     LEFT JOIN nomenclature n ON n.id = e.nomenclature_id
     WHERE o.id = $1::uuid`,
    [ev.objectId, ev.equipmentId]
  );
  if (!info) return;

  const manufactureId = sanitizeManufactureId(info.serial_number ?? info.imei ?? "");
  const start = Date.now();
  try {
    if (!manufactureId) throw new Error("У единицы нет серийника/IMEI для manufactureId");
    const res = await omnicommClientFor(server).createVehicle({
      vehicleName: info.object_name.slice(0, 64),
      terminalType: info.device_type || "FAS",
      manufactureId,
      groupId: [],
    });
    const uuid = extractUuid(res);
    if (!uuid) throw new Error("В ответе создания объекта нет uuid");
    await query(
      `INSERT INTO telematics_object_links
         (server_id, object_id, equipment_id, external_uuid, external_name,
          sync_status, data_reception_enabled, last_synced_at)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'synced', true, now())
       ON CONFLICT (server_id, external_uuid) DO NOTHING`,
      [server.id, ev.objectId, ev.equipmentId, uuid, info.object_name]
    );
    await writeSyncLog({
      serverId: server.id,
      operation: "create_object",
      entityType: "monitoring_object",
      entityId: ev.objectId,
      status: "ok",
      payload: { external_uuid: uuid, manufactureId },
      durationMs: Date.now() - start,
    });
  } catch (e) {
    const msg = (e as Error).message;
    // привязка-маркер с ошибкой: видна в «Привязках объектов», можно повторить вручную
    await query(
      `INSERT INTO telematics_object_links
         (server_id, object_id, equipment_id, external_uuid, external_name, sync_status)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, 'error')
       ON CONFLICT (server_id, external_uuid) DO UPDATE SET sync_status = 'error', updated_at = now()`,
      [server.id, ev.objectId, ev.equipmentId, `pending:${ev.objectId}`, info.object_name]
    );
    await writeSyncLog({
      serverId: server.id,
      operation: "create_object",
      entityType: "monitoring_object",
      entityId: ev.objectId,
      status: "error",
      errorMessage: msg,
      durationMs: Date.now() - start,
    });
  }
}

async function syncDeactivated(ev: ActivationEvent): Promise<void> {
  if (!ev.objectId) return;
  const [link] = await query<LinkRow>(
    `SELECT l.id, l.server_id, l.external_uuid, l.sync_status
     FROM telematics_object_links l
     WHERE l.object_id = $1::uuid AND l.sync_status IN ('synced','pending','error')
       AND l.external_uuid NOT LIKE 'pending:%'
     LIMIT 1`,
    [ev.objectId]
  );
  if (!link) return; // объекта в СМ нет — выключать нечего

  const [server] = await query<TelematicsServerRow>(
    `SELECT id, name, server_type, base_url, auth_login, auth_secret,
            is_active, health_status, health_checked_at
     FROM telematics_servers WHERE id = $1::uuid`,
    [link.server_id]
  );
  if (!server) return;

  const start = Date.now();
  try {
    await omnicommClientFor(server).setDataCapture(link.external_uuid, false);
    await query(
      `UPDATE telematics_object_links
       SET data_reception_enabled = false, last_synced_at = now(), updated_at = now()
       WHERE id = $1::uuid`,
      [link.id]
    );
    await writeSyncLog({
      serverId: server.id,
      operation: "disable_reception",
      entityType: "telematics_object_link",
      entityId: link.id,
      status: "ok",
      payload: { external_uuid: link.external_uuid },
      durationMs: Date.now() - start,
    });
  } catch (e) {
    await writeSyncLog({
      serverId: server.id,
      operation: "disable_reception",
      entityType: "telematics_object_link",
      entityId: link.id,
      status: "error",
      errorMessage: (e as Error).message,
      durationMs: Date.now() - start,
    });
  }
}
