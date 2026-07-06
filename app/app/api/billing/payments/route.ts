import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

const READ_ROLES = ["admin", "manager", "accounting", "head", "boss"] as const;
const WRITE_ROLES = ["admin", "accounting", "head"] as const;

export async function GET(req: Request) {
  try {
    await requireRole([...READ_ROLES]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const clientId = new URL(req.url).searchParams.get("client_id");
  const rows = await query(
    `SELECT p.id, p.amount, p.paid_at::text, p.method, p.bank_reference, p.note,
            c.name AS client_name, d.number AS document_number, u.full_name AS created_by_name
     FROM payments p
     JOIN clients c ON c.id = p.client_id
     LEFT JOIN billing_documents d ON d.id = p.billing_document_id
     LEFT JOIN users u ON u.id = p.created_by
     WHERE ($1::uuid IS NULL OR p.client_id = $1::uuid)
     ORDER BY p.paid_at DESC
     LIMIT 300`,
    [clientId || null]
  );
  return Response.json(rows);
}

/**
 * Ввод оплаты: payments + при привязке к документу — paid_amount и статус
 * paid / partial (в одной транзакции).
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole([...WRITE_ROLES])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const b = await req.json().catch(() => null);
  if (!b?.client_id || !(Number(b.amount) > 0)) {
    return Response.json({ error: "client_id и amount > 0 обязательны" }, { status: 400 });
  }
  if (b.method && !["bank", "cash", "card", "offset"].includes(b.method)) {
    return Response.json({ error: "method invalid" }, { status: 400 });
  }

  const result = await tx(async (q) => {
    if (b.billing_document_id) {
      const [doc] = await q<{ id: string; client_id: string; total: string; paid_amount: string; status: string }>(
        `SELECT id, client_id, total::text, paid_amount::text, status
         FROM billing_documents WHERE id = $1::uuid FOR UPDATE`,
        [b.billing_document_id]
      );
      if (!doc) return { error: "документ не найден", status: 404 };
      if (doc.client_id !== b.client_id) return { error: "документ принадлежит другому клиенту", status: 400 };
      if (doc.status === "cancelled") return { error: "документ отменён", status: 409 };
    }
    const [payment] = await q<{ id: string }>(
      `INSERT INTO payments (client_id, billing_document_id, amount, paid_at, method, bank_reference, note, created_by)
       VALUES ($1::uuid, $2::uuid, $3, COALESCE($4::timestamptz, now()), $5, $6, $7, $8::uuid)
       RETURNING id`,
      [b.client_id, b.billing_document_id || null, Number(b.amount), b.paid_at || null,
       b.method || "bank", b.bank_reference || null, b.note || null, userId]
    );
    if (b.billing_document_id) {
      await q(
        `UPDATE billing_documents SET
           paid_amount = paid_amount + $2,
           status = CASE WHEN paid_amount + $2 >= total THEN 'paid' ELSE 'partial' END,
           updated_at = now()
         WHERE id = $1::uuid`,
        [b.billing_document_id, Number(b.amount)]
      );
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'create', 'payment', $2, $3)`,
      [userId, payment.id, JSON.stringify({ client_id: b.client_id, amount: b.amount, document: b.billing_document_id ?? null })]
    );
    return { id: payment.id };
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: result.status });
  }
  return Response.json(result, { status: 201 });
}
