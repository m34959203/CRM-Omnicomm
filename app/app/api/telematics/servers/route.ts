import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "support", "head", "boss"] as const;
const WRITE_ROLES = ["admin", "head"] as const;

export async function GET() {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  // auth_secret наружу не отдаём
  const rows = await query(
    `SELECT id, name, server_type, base_url, auth_login, is_active,
            health_status, health_checked_at, note, created_at
     FROM telematics_servers ORDER BY name`
  );
  return Response.json(rows);
}

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.name?.trim() || !b?.base_url?.trim()) {
    return Response.json({ error: "name и base_url обязательны" }, { status: 400 });
  }

  const id = await tx(async (q) => {
    // TODO: auth_secret хранится открытым текстом — добавить шифрование (AES-GCM, ключ в env)
    const [row] = await q<{ id: string }>(
      `INSERT INTO telematics_servers (name, server_type, base_url, auth_login, auth_secret, note)
       VALUES ($1, COALESCE($2, 'omnicomm'), $3, $4, $5, $6) RETURNING id`,
      [
        b.name.trim(),
        b.server_type || null,
        b.base_url.trim().replace(/\/+$/, ""),
        b.auth_login || null,
        b.auth_secret || null,
        b.note || null,
      ]
    );
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1, 'create', 'telematics_server', $2)`,
      [userId, row.id]
    );
    return row.id;
  });
  return Response.json({ id }, { status: 201 });
}
