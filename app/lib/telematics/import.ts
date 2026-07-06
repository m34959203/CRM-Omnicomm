import { tx } from "@/lib/db";
import type { OmniVehicle } from "@/lib/omnicomm/client";
import { parseVehicleName } from "@/lib/telematics/parse-name";
import {
  getServer,
  omnicommClientFor,
  probeAndStore,
  writeSyncLog,
  type TelematicsServerRow,
} from "@/lib/telematics/server";

export const IMPORT_CLIENT_NAME = "Не распределено (импорт Omnicomm)";

export class ImportUnavailableError extends Error {}

/** Health-проба перед забором (учётки деградируют) + плоский список ТС. down → ImportUnavailableError. */
export async function fetchVehiclesChecked(
  server: TelematicsServerRow
): Promise<OmniVehicle[]> {
  const probe = await probeAndStore(server);
  if (!probe.ok) {
    await writeSyncLog({
      serverId: server.id,
      operation: "health",
      entityType: "telematics_server",
      entityId: server.id,
      status: "error",
      errorMessage: probe.error ?? "health down",
      durationMs: probe.ms,
    });
    throw new ImportUnavailableError(probe.error ?? "Сервер телематики недоступен");
  }
  return omnicommClientFor(server).listVehicles();
}

export async function loadServerOr404(id: string): Promise<TelematicsServerRow | null> {
  return getServer(id);
}

export type ImportResult = { created: number; updated: number; total: number };

/** Импорт абонбазы: новые ТС → monitoring_object + link, существующие — обновление. Всё в одной tx. */
export async function importVehicles(
  server: TelematicsServerRow,
  vehicles: OmniVehicle[],
  userId: string,
  targetClientId?: string | null
): Promise<ImportResult> {
  return tx(async (q) => {
    let clientId = targetClientId ?? null;
    if (!clientId) {
      // Технический клиент-приёмник: monitoring_objects.client_id NOT NULL,
      // распределение по реальным клиентам — вручную после импорта.
      const [existing] = await q<{ id: string }>(
        `SELECT id FROM clients WHERE name = $1`,
        [IMPORT_CLIENT_NAME]
      );
      if (existing) clientId = existing.id;
      else {
        const [created] = await q<{ id: string }>(
          `INSERT INTO clients (name, notes) VALUES ($1, 'Служебный клиент: сюда попадают объекты импорта из Omnicomm до распределения') RETURNING id`,
          [IMPORT_CLIENT_NAME]
        );
        clientId = created.id;
      }
    }

    let created = 0;
    let updated = 0;
    for (const v of vehicles) {
      if (!v.uuid) continue;
      const [link] = await q<{ id: string }>(
        `SELECT id FROM telematics_object_links WHERE server_id = $1::uuid AND external_uuid = $2`,
        [server.id, v.uuid]
      );
      if (link) {
        await q(
          `UPDATE telematics_object_links
           SET external_name = $2, last_synced_at = now(), updated_at = now()
           WHERE id = $1::uuid`,
          [link.id, v.name]
        );
        updated++;
        continue;
      }
      const parsed = parseVehicleName(v.name);
      const [obj] = await q<{ id: string }>(
        `INSERT INTO monitoring_objects (client_id, name, kind, brand, model, reg_number)
         VALUES ($1::uuid, $2, 'vehicle', $3, $4, $5) RETURNING id`,
        [clientId, v.name || v.uuid, parsed.brand, parsed.model, parsed.regNumber]
      );
      await q(
        `INSERT INTO telematics_object_links
           (server_id, object_id, external_uuid, external_name, sync_status, data_reception_enabled, last_synced_at)
         VALUES ($1::uuid, $2::uuid, $3, $4, 'synced', $5, now())`,
        [server.id, obj.id, v.uuid, v.name, v.receiveData]
      );
      created++;
    }

    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'import', 'telematics_server', $2, $3)`,
      [userId, server.id, JSON.stringify({ created, updated })]
    );
    return { created, updated, total: vehicles.length };
  });
}
