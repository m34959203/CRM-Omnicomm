import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { getServer } from "@/lib/telematics/server";
import { parseVehicleName } from "@/lib/telematics/parse-name";
import {
  fetchVehiclesChecked,
  ImportUnavailableError,
} from "@/lib/telematics/import";

/** Dry-run импорта для UI: первые 50 ТС + счётчики. В БД ничего не пишет (кроме health-статуса). */
export async function GET(
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

  try {
    const vehicles = await fetchVehiclesChecked(server);
    const existing = await query<{ external_uuid: string }>(
      `SELECT external_uuid FROM telematics_object_links WHERE server_id = $1::uuid`,
      [server.id]
    );
    const known = new Set(existing.map((r) => r.external_uuid));

    let toCreate = 0;
    let toUpdate = 0;
    for (const v of vehicles) {
      if (known.has(v.uuid)) toUpdate++;
      else toCreate++;
    }

    return Response.json({
      total: vehicles.length,
      to_create: toCreate,
      to_update: toUpdate,
      sample: vehicles.slice(0, 50).map((v) => ({
        uuid: v.uuid,
        name: v.name,
        receive_data: v.receiveData,
        exists: known.has(v.uuid),
        ...parseVehicleName(v.name),
      })),
    });
  } catch (e) {
    if (e instanceof ImportUnavailableError) {
      return Response.json({ error: e.message }, { status: 503 });
    }
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
