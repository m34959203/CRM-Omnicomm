import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { omnicommClientFor, writeSyncLog, type TelematicsServerRow } from "@/lib/telematics/server";

type AccountRow = TelematicsServerRow & {
  account_id: string;
  login: string;
  server_name: string;
};

/**
 * Ручная блокировка/разблокировка клиента в СМ:
 * body { client_id, action: 'block'|'unblock', unblock_until?, note? }.
 * Автоматика по задолженности — этап 2 (lib/telematics/auto-block.ts).
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "manager", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.client_id || !["block", "unblock"].includes(b?.action)) {
    return Response.json(
      { error: "client_id и action ('block'|'unblock') обязательны" },
      { status: 400 }
    );
  }

  const accounts = await query<AccountRow>(
    `SELECT a.id AS account_id, a.login,
            s.id, s.name AS server_name, s.server_type, s.base_url,
            s.auth_login, s.auth_secret, s.is_active, s.health_status, s.health_checked_at
     FROM telematics_accounts a
     JOIN telematics_servers s ON s.id = a.server_id
     WHERE a.client_id = $1::uuid AND a.is_active AND a.login IS NOT NULL`,
    [b.client_id]
  );
  if (accounts.length === 0) {
    return Response.json(
      { error: "у клиента нет активных учёток телематики с логином" },
      { status: 400 }
    );
  }

  const blocked = b.action === "block";
  const done: string[] = [];
  const errors: { login: string; error: string }[] = [];

  for (const acc of accounts) {
    const start = Date.now();
    try {
      await omnicommClientFor(acc).setUserBlocking({
        login: acc.login,
        blocked,
        comment: b.note ?? "",
      });
    } catch (e) {
      const msg = (e as Error).message;
      errors.push({ login: acc.login, error: msg });
      await writeSyncLog({
        serverId: acc.id,
        operation: blocked ? "block" : "unblock",
        entityType: "telematics_account",
        entityId: acc.account_id,
        status: "error",
        errorMessage: msg,
        payload: { login: acc.login, client_id: b.client_id },
        durationMs: Date.now() - start,
      });
      continue;
    }
    await tx(async (q) => {
      await q(
        `INSERT INTO blocking_events (client_id, action, unblock_until, performed_by, note)
         VALUES ($1::uuid, $2, $3, $4::uuid, $5)`,
        [
          b.client_id,
          blocked ? "block" : "manual_unblock",
          !blocked && b.unblock_until ? b.unblock_until : null,
          userId,
          b.note ?? null,
        ]
      );
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, $2, 'client', $3, $4)`,
        [userId, blocked ? "telematics_block" : "telematics_unblock", b.client_id,
         JSON.stringify({ login: acc.login, server: acc.server_name })]
      );
    });
    await writeSyncLog({
      serverId: acc.id,
      operation: blocked ? "block" : "unblock",
      entityType: "telematics_account",
      entityId: acc.account_id,
      status: "ok",
      payload: { login: acc.login, client_id: b.client_id },
      durationMs: Date.now() - start,
    });
    done.push(acc.login);
  }

  if (done.length === 0) {
    return Response.json(
      { error: `Omnicomm: ${errors[0]?.error ?? "ошибка"}`, errors },
      { status: 502 }
    );
  }
  return Response.json({ ok: true, processed: done, errors });
}
