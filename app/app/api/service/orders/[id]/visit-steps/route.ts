import { query, tx } from "@/lib/db";
import { requireRole, authErrorResponse, type SessionUser } from "@/lib/auth";
import { SERVICE_WRITE_ROLES } from "@/lib/service/common";

/**
 * Статусный шаг выезда из PWA техника (этап 4).
 * body: { step: depart|arrive|start|finish|cant_do, lat?, lng?, note? }
 * Визит (visits) создаётся при первом шаге; статус визита двигается по шагу,
 * координаты navigator.geolocation — nullable (техник мог запретить доступ).
 * Наряд planned → in_progress на первом шаге; заявка наряда двигается по цепочке
 * installer_departed → installer_on_site → working.
 */
const STEPS = ["depart", "arrive", "start", "finish", "cant_do"] as const;
const VISIT_STATUS: Record<string, string> = {
  depart: "en_route",
  arrive: "on_site",
  start: "working",
  finish: "done",
  cant_do: "cancelled",
};
const REQUEST_STATUS: Record<string, string> = {
  depart: "installer_departed",
  arrive: "installer_on_site",
  start: "working",
};

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  let user: SessionUser;
  try {
    user = await requireRole([...SERVICE_WRITE_ROLES, "installer"]);
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  const b = await req.json().catch(() => null);
  if (!b?.step || !STEPS.includes(b.step)) {
    return Response.json({ error: "bad step" }, { status: 400 });
  }
  if (b.step === "cant_do" && !b.note?.trim()) {
    return Response.json({ error: "Для «Не могу выполнить» укажите причину" }, { status: 400 });
  }

  const [wo] = await query<{ id: string; status: string; request_id: string | null; scheduled_start: string | null }>(
    `SELECT id, status, request_id, scheduled_start FROM work_orders WHERE id = $1::uuid`,
    [id]
  );
  if (!wo) return Response.json({ error: "not found" }, { status: 404 });
  if (["done", "cancelled"].includes(wo.status)) {
    return Response.json({ error: "Наряд уже завершён" }, { status: 422 });
  }
  if (user.role === "installer") {
    const [perf] = await query(
      `SELECT 1 AS ok FROM work_order_performers WHERE work_order_id = $1::uuid AND user_id = $2::uuid`,
      [id, user.userId]
    );
    if (!perf) return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const lat = Number.isFinite(Number(b.lat)) ? Number(b.lat) : null;
  const lng = Number.isFinite(Number(b.lng)) ? Number(b.lng) : null;

  const result = await tx(async (q) => {
    // визит текущего техника по наряду; создаётся при первом шаге
    let [visit] = await q<{ id: string }>(
      `SELECT id FROM visits
       WHERE work_order_id = $1::uuid AND installer_id = $2::uuid
         AND status NOT IN ('done','cancelled')
       ORDER BY created_at DESC LIMIT 1`,
      [id, user.userId]
    );
    if (!visit) {
      [visit] = await q<{ id: string }>(
        `INSERT INTO visits (work_order_id, installer_id, planned_at, status)
         VALUES ($1::uuid, $2::uuid, $3, 'assigned') RETURNING id`,
        [id, user.userId, wo.scheduled_start]
      );
    }
    await q(
      `INSERT INTO visit_steps (visit_id, step, lat, lng, user_id, note)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, $6)`,
      [visit.id, b.step, lat, lng, user.userId, b.note?.trim() || null]
    );
    await q(
      `UPDATE visits SET status = $2, updated_at = now() WHERE id = $1::uuid`,
      [visit.id, VISIT_STATUS[b.step]]
    );
    // наряд стартует с первого шага
    await q(
      `UPDATE work_orders SET status = 'in_progress', updated_at = now()
       WHERE id = $1::uuid AND status = 'planned'`,
      [id]
    );
    // заявка наряда двигается по полевой цепочке
    const reqStatus = REQUEST_STATUS[b.step];
    if (wo.request_id && reqStatus) {
      await q(
        `UPDATE requests SET status = $2, updated_at = now()
         WHERE id = $1::uuid
           AND status IN ('new','assigned','in_progress','visit_planned',
                          'installer_departed','installer_on_site','working')`,
        [wo.request_id, reqStatus]
      );
      await q(
        `INSERT INTO request_history (request_id, action, detail, user_id)
         VALUES ($1::uuid, 'visit_step', $2, $3::uuid)`,
        [wo.request_id, b.step, user.userId]
      );
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id, detail)
       VALUES ($1, 'visit_step', 'work_order', $2,
               jsonb_build_object('step', $3::text, 'lat', $4::float8, 'lng', $5::float8))`,
      [user.userId, id, b.step, lat, lng]
    );
    return { visitId: visit.id, status: VISIT_STATUS[b.step] };
  });

  return Response.json(result, { status: 201 });
}
