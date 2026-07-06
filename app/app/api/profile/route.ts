import { query } from "@/lib/db";
import { requireUser, createSession, authErrorResponse } from "@/lib/auth";

/** Настройки своего профиля: PATCH { locale: 'ru'|'kk' } — язык интерфейса.
 *  Кука-сессия пересоздаётся с новым locale (тот же JWT-механизм). */
export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const b = await req.json().catch(() => null);
    const locale = b?.locale as "ru" | "kk";
    if (locale !== "ru" && locale !== "kk") {
      return Response.json({ error: "locale: ru|kk" }, { status: 400 });
    }
    await query(`UPDATE users SET locale = $2, updated_at = now() WHERE id = $1::uuid`, [
      user.userId,
      locale,
    ]);
    await createSession({
      userId: user.userId,
      fullName: user.fullName,
      role: user.role,
      locale,
    });
    return Response.json({ ok: true, locale });
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
}
