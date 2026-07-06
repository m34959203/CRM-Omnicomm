import { tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const WRITE_ROLES = ["admin", "accounting", "head"] as const;

/**
 * Статусные действия по документу:
 *  { action: 'issue' }  — prepared → issued (issued_at);
 *  { action: 'send' }   — issued → sent (sent_at);
 *  { action: 'cancel' } — → cancelled: accruals → cancelled,
 *                         discount_applications откатываются (used_amount −).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  const action = b?.action;
  if (!["issue", "send", "cancel"].includes(action)) {
    return Response.json({ error: "action: issue | send | cancel" }, { status: 400 });
  }

  const result = await tx(async (q) => {
    const [doc] = await q<{ id: string; status: string; kind: string }>(
      `SELECT id, status, kind FROM billing_documents WHERE id = $1::uuid FOR UPDATE`,
      [id]
    );
    if (!doc) return { error: "not found", status: 404 };

    if (action === "issue") {
      if (!["to_accrue", "prepared"].includes(doc.status)) {
        return { error: `нельзя выставить документ в статусе ${doc.status}`, status: 409 };
      }
      await q(
        `UPDATE billing_documents SET status = 'issued', issued_at = now(), accountant_id = $2, updated_at = now()
         WHERE id = $1::uuid`,
        [id, userId]
      );
    } else if (action === "send") {
      if (doc.status !== "issued") {
        return { error: `нельзя отметить отправку в статусе ${doc.status}`, status: 409 };
      }
      await q(
        `UPDATE billing_documents SET status = 'sent', sent_at = now(), updated_at = now()
         WHERE id = $1::uuid`,
        [id]
      );
    } else {
      if (doc.status === "cancelled") {
        return { error: "документ уже отменён", status: 409 };
      }
      await q(
        `UPDATE billing_documents SET status = 'cancelled', updated_at = now() WHERE id = $1::uuid`,
        [id]
      );
      // Начисления аннулируются; разовые (one_time) возвращаются в draft для повторного подбора.
      await q(
        `UPDATE accruals SET status = 'cancelled', updated_at = now()
         WHERE billing_document_id = $1::uuid AND method <> 'one_time'`,
        [id]
      );
      await q(
        `UPDATE accruals SET status = 'draft', billing_document_id = NULL, updated_at = now()
         WHERE billing_document_id = $1::uuid AND method = 'one_time'`,
        [id]
      );
      // Откат скидок.
      const apps = await q<{ id: string; discount_id: string; amount: string }>(
        `SELECT id, discount_id, amount::text FROM discount_applications
         WHERE billing_document_id = $1::uuid`,
        [id]
      );
      for (const a of apps) {
        await q(
          `UPDATE discounts SET used_amount = greatest(used_amount - $2, 0), updated_at = now()
           WHERE id = $1::uuid`,
          [a.discount_id, Number(a.amount)]
        );
      }
      if (apps.length) {
        await q(`DELETE FROM discount_applications WHERE billing_document_id = $1::uuid`, [id]);
      }
    }

    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, $2, 'billing_document', $3, $4)`,
      [userId, `billing_${action}`, id, JSON.stringify({ from: doc.status })]
    );
    return { ok: true };
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result);
}
