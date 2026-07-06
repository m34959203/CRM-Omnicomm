import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { SERVICE_WRITE_ROLES, REQUEST_STATUSES } from "@/lib/service/common";

/**
 * PATCH заявки: смена статуса и/или назначения исполнителей.
 * Бизнес-правила легаси:
 *  - «Закрыта/Выполнена» — только с result_comment;
 *  - «Выполнена» для photo_required-типов — только при наличии фото.
 * Каждое изменение — строка в request_history.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole(SERVICE_WRITE_ROLES)).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b) return Response.json({ error: "bad body" }, { status: 400 });
  if (b.status && !REQUEST_STATUSES.includes(b.status)) {
    return Response.json({ error: "bad status" }, { status: 400 });
  }

  const [current] = await query<{
    id: string; status: string; photo_required: boolean; result_comment: string | null;
  }>(`SELECT id, status, photo_required, result_comment FROM requests WHERE id = $1::uuid`, [id]);
  if (!current) return Response.json({ error: "not found" }, { status: 404 });

  const resultComment: string | null = b.result_comment?.trim() || null;

  if (b.status && ["closed", "completed"].includes(b.status)) {
    if (!resultComment && !current.result_comment) {
      return Response.json(
        { error: "Нельзя закрыть/выполнить заявку без комментария-результата" },
        { status: 422 }
      );
    }
    if (b.status === "completed" && current.photo_required) {
      const [photo] = await query(
        `SELECT 1 FROM attachments
         WHERE entity_type = 'request' AND entity_id = $1::uuid AND kind = 'photo' LIMIT 1`,
        [id]
      );
      if (!photo) {
        return Response.json(
          { error: "Нельзя выполнить: для этого типа заявки обязателен фотоотчёт" },
          { status: 422 }
        );
      }
    }
  }

  await tx(async (q) => {
    const sets: string[] = ["updated_at = now()"];
    const vals: unknown[] = [id];
    const push = (frag: string, v: unknown) => {
      vals.push(v);
      sets.push(`${frag}$${vals.length}`);
    };

    if (b.status && b.status !== current.status) {
      push("status = ", b.status);
      if (["closed", "completed", "cancelled"].includes(b.status)) {
        sets.push("closed_at = now()");
      }
      await q(
        `INSERT INTO request_history (request_id, action, detail, user_id)
         VALUES ($1::uuid, 'status', $2, $3::uuid)`,
        [id, `${current.status} → ${b.status}${resultComment ? `: ${resultComment}` : ""}`, userId]
      );
    }
    if (resultComment) push("result_comment = ", resultComment);
    if (b.priority) push("priority = ", b.priority);
    if ("due_at" in b) push("due_at = ", b.due_at || null);
    if ("subject" in b) push("subject = ", b.subject?.trim() || null);
    if ("description" in b) push("description = ", b.description?.trim() || null);

    for (const field of ["manager_id", "support_id", "installer_id"] as const) {
      if (field in b) {
        vals.push(b[field] || null);
        sets.push(`${field} = $${vals.length}::uuid`);
        await q(
          `INSERT INTO request_history (request_id, action, detail, user_id)
           VALUES ($1::uuid, 'assign', $2 || ': ' ||
                   COALESCE((SELECT full_name FROM users WHERE id = $3::uuid), '—'), $4::uuid)`,
          [id, field.replace("_id", ""), b[field] || null, userId]
        );
      }
    }

    await q(`UPDATE requests SET ${sets.join(", ")} WHERE id = $1::uuid`, vals);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'update', 'request', $2, $3)`,
      [userId, id, JSON.stringify({ status: b.status ?? undefined })]
    );
  });

  return Response.json({ ok: true });
}
