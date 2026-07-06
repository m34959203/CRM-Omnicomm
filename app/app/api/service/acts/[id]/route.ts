import { tx } from "@/lib/db";
import { requireRole, authErrorResponse, type SessionUser } from "@/lib/auth";
import { ACT_EDIT_ROLES, editableActFor } from "@/lib/service/common";

/**
 * PATCH акта (этап 4, PWA техника):
 *  - { client_signer_name } — подписант от клиента;
 *  - { signed: true } — фиксация подписи клиента (signed_by_client_at = now);
 *  - { note } — комментарий;
 *  - { submitted: true } — «Отправить в офис»: акт остаётся in_preparation
 *    (закрывает офис — норма процесса), пишется только audit_log.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: SessionUser;
  try {
    user = await requireRole(ACT_EDIT_ROLES);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const blocked = await editableActFor(id, user);
  if (blocked) return blocked;
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });

  await tx(async (q) => {
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [id];
    const push = (frag: string, v: unknown) => {
      vals.push(v);
      sets.push(`${frag}$${vals.length}`);
    };
    if ("client_signer_name" in b) push("client_signer_name = ", b.client_signer_name?.trim() || null);
    if (b.signed === true) sets.push("signed_by_client_at = now()");
    if ("note" in b) push("note = ", b.note?.trim() || null);
    await q(`UPDATE maintenance_acts SET ${sets.join(", ")} WHERE id = $1::uuid`, vals);

    if (b.submitted === true) {
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'submit_to_office', 'maintenance_act', $2, '{}')`,
        [user.userId, id]
      );
    } else {
      await q(
        `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
         VALUES ($1, 'update', 'maintenance_act', $2,
                 jsonb_build_object('signed', $3::boolean, 'signer', $4::text))`,
        [user.userId, id, b.signed === true, b.client_signer_name ?? null]
      );
    }
  });
  return Response.json({ ok: true });
}
