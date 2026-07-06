import { query } from "@/lib/db";
import { requireUser, authErrorResponse } from "@/lib/auth";

/**
 * Подписка web-push из PWA техника.
 * POST { subscription: { endpoint, keys: { p256dh, auth } } } — upsert по endpoint
 * (endpoint глобально уникален; при пере-логине привязывается к новому пользователю).
 * DELETE { endpoint } — отписка своего устройства.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  const sub = b?.subscription;
  if (
    typeof sub?.endpoint !== "string" ||
    !sub.endpoint.startsWith("http") ||
    typeof sub?.keys?.p256dh !== "string" ||
    typeof sub?.keys?.auth !== "string"
  ) {
    return Response.json({ error: "bad subscription" }, { status: 400 });
  }
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys, user_agent)
     VALUES ($1::uuid, $2, $3::jsonb, $4)
     ON CONFLICT (endpoint) DO UPDATE
       SET user_id = EXCLUDED.user_id, keys = EXCLUDED.keys, user_agent = EXCLUDED.user_agent`,
    [
      userId,
      sub.endpoint,
      JSON.stringify({ p256dh: sub.keys.p256dh, auth: sub.keys.auth }),
      req.headers.get("user-agent")?.slice(0, 300) ?? null,
    ]
  );
  return Response.json({ ok: true }, { status: 201 });
}

export async function DELETE(req: Request) {
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (typeof b?.endpoint !== "string") {
    return Response.json({ error: "endpoint required" }, { status: 400 });
  }
  await query(
    `DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2::uuid`,
    [b.endpoint, userId]
  );
  return Response.json({ ok: true });
}
