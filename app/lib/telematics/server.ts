import { query } from "@/lib/db";
import { OmnicommClient } from "@/lib/omnicomm/client";

export type TelematicsServerRow = {
  id: string;
  name: string;
  server_type: string;
  base_url: string;
  auth_login: string | null;
  auth_secret: string | null;
  is_active: boolean;
  health_status: string;
  health_checked_at: string | null;
};

/** Сервер по id. auth_secret хранится как есть — TODO: шифрование (ключ в env), см. 008_telematics.sql. */
export async function getServer(id: string): Promise<TelematicsServerRow | null> {
  const [row] = await query<TelematicsServerRow>(
    `SELECT id, name, server_type, base_url, auth_login, auth_secret,
            is_active, health_status, health_checked_at
     FROM telematics_servers WHERE id = $1::uuid`,
    [id]
  );
  return row ?? null;
}

export function omnicommClientFor(server: TelematicsServerRow): OmnicommClient {
  return new OmnicommClient(
    server.base_url,
    server.auth_login ?? "",
    server.auth_secret ?? ""
  );
}

/** Запись в журнал синхронизации ВНЕ транзакций мутаций — чтобы ошибка не откатывала лог. */
export async function writeSyncLog(e: {
  serverId?: string | null;
  operation: string;
  entityType?: string;
  entityId?: string | null;
  status: "ok" | "error";
  errorMessage?: string | null;
  payload?: Record<string, unknown> | null;
  durationMs?: number | null;
}): Promise<void> {
  await query(
    `INSERT INTO sync_log (server_id, operation, entity_type, entity_id, status, error_message, payload, duration_ms)
     VALUES ($1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8)`,
    [
      e.serverId ?? null,
      e.operation,
      e.entityType ?? null,
      e.entityId ?? null,
      e.status,
      e.errorMessage ?? null,
      e.payload ? JSON.stringify(e.payload) : null,
      e.durationMs ?? null,
    ]
  );
}

/** Health-проба + фиксация результата в telematics_servers (>10 с = degraded). */
export async function probeAndStore(server: TelematicsServerRow): Promise<{
  ok: boolean;
  ms: number;
  error?: string;
  status: "ok" | "degraded" | "down";
}> {
  const client = omnicommClientFor(server);
  const probe = await client.healthProbe();
  const status: "ok" | "degraded" | "down" = probe.ok
    ? probe.ms > 10000
      ? "degraded"
      : "ok"
    : "down";
  await query(
    `UPDATE telematics_servers SET health_status = $2, health_checked_at = now(), updated_at = now()
     WHERE id = $1::uuid`,
    [server.id, status]
  );
  return { ...probe, status };
}
