import { query } from "@/lib/db";
import type { TelematicsServerRow } from "@/lib/telematics/server";

export type LinkRow = {
  id: string;
  server_id: string;
  object_id: string;
  equipment_id: string | null;
  external_uuid: string;
  external_name: string | null;
  sync_status: string;
  data_reception_enabled: boolean;
  client_id: string | null;
  contract_id: string | null;
};

export type LinkWithServer = { link: LinkRow; server: TelematicsServerRow };

export async function getLinkWithServer(id: string): Promise<LinkWithServer | null> {
  const [row] = await query<LinkRow & TelematicsServerRow & { link_id: string; server_name: string }>(
    `SELECT l.id AS link_id, l.server_id, l.object_id, l.equipment_id, l.external_uuid,
            l.external_name, l.sync_status, l.data_reception_enabled,
            o.client_id, o.contract_id,
            s.id, s.name AS server_name, s.server_type, s.base_url, s.auth_login, s.auth_secret,
            s.is_active, s.health_status, s.health_checked_at
     FROM telematics_object_links l
     JOIN monitoring_objects o ON o.id = l.object_id
     JOIN telematics_servers s ON s.id = l.server_id
     WHERE l.id = $1::uuid`,
    [id]
  );
  if (!row) return null;
  return {
    link: {
      id: row.link_id,
      server_id: row.server_id,
      object_id: row.object_id,
      equipment_id: row.equipment_id,
      external_uuid: row.external_uuid,
      external_name: row.external_name,
      sync_status: row.sync_status,
      data_reception_enabled: row.data_reception_enabled,
      client_id: row.client_id,
      contract_id: row.contract_id,
    },
    server: {
      id: row.server_id,
      name: row.server_name,
      server_type: row.server_type,
      base_url: row.base_url,
      auth_login: row.auth_login,
      auth_secret: row.auth_secret,
      is_active: row.is_active,
      health_status: row.health_status,
      health_checked_at: row.health_checked_at,
    },
  };
}
