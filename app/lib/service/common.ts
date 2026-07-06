/** Общие константы и хелперы сервисного контура. */
import type { Role, SessionUser } from "@/lib/auth";
import { query } from "@/lib/db";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

/** RBAC сервисного контура: техник видит, офис мутирует, закрытие акта — офис без support. */
export const SERVICE_READ_ROLES: Role[] = ["admin", "manager", "support", "installer", "head", "boss"];
export const SERVICE_WRITE_ROLES: Role[] = ["admin", "manager", "support", "head"];
export const ACT_CLOSE_ROLES: Role[] = ["admin", "manager", "head"];
/** Редактирование акта: офис + техник (техник — только СВОЙ акт in_preparation, см. editableActFor). */
export const ACT_EDIT_ROLES: Role[] = [...SERVICE_WRITE_ROLES, "installer"];

/**
 * Гард редактирования акта (этап 4, PWA техника): акт существует, статус in_preparation;
 * installer может редактировать только акт, где он performed_by.
 * Возвращает Response с ошибкой или null, если редактирование разрешено.
 */
export async function editableActFor(actId: string, user: SessionUser): Promise<Response | null> {
  const [act] = await query<{ status: string; performed_by: string | null }>(
    `SELECT status, performed_by FROM maintenance_acts WHERE id = $1::uuid`,
    [actId]
  );
  if (!act) return Response.json({ error: "not found" }, { status: 404 });
  if (act.status !== "in_preparation") {
    return Response.json({ error: "Акт уже не редактируется" }, { status: 422 });
  }
  if (user.role === "installer" && act.performed_by !== user.userId) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/** Типы заявок с обязательным фотоотчётом (бизнес-правило легаси). */
export const PHOTO_REQUIRED_TYPES = [
  "connect",
  "dismantle",
  "replace",
  "diagnostics",
  "gps_fault",
  "fuel_sensor_fault",
  "cctv_fault",
  "monitoring_setup",
];

export const REQUEST_TYPES = [
  "connect", "dismantle", "replace", "diagnostics", "gps_fault",
  "fuel_sensor_fault", "cctv_fault", "monitoring_setup", "consultation",
  "training", "integration", "bi_reporting", "commercial",
  "payment_question", "docs_question", "other",
];

export const REQUEST_STATUSES = [
  "new", "assigned", "in_progress", "visit_planned", "installer_departed",
  "installer_on_site", "working", "wait_client", "wait_parts", "completed",
  "in_review", "closed", "overdue", "cancelled",
];

/** Склад техника (type='technician', holder_id) — создаётся при первом использовании. */
export async function ensureTechnicianWarehouse(q: Q, userId: string): Promise<string> {
  const [existing] = await q<{ id: string }>(
    `SELECT id FROM warehouses WHERE type = 'technician' AND holder_id = $1::uuid AND is_active LIMIT 1`,
    [userId]
  );
  if (existing) return existing.id;
  const [created] = await q<{ id: string }>(
    `INSERT INTO warehouses (name, type, holder_id)
     SELECT 'Техник: ' || full_name, 'technician', id FROM users WHERE id = $1::uuid
     RETURNING id`,
    [userId]
  );
  return created.id;
}

/** Виртуальный склад тестирования — создаётся при первом использовании. */
export async function ensureTestingWarehouse(q: Q): Promise<string> {
  const [existing] = await q<{ id: string }>(
    `SELECT id FROM warehouses WHERE type = 'testing' AND is_active LIMIT 1`
  );
  if (existing) return existing.id;
  const [created] = await q<{ id: string }>(
    `INSERT INTO warehouses (name, type) VALUES ('Тестирование', 'testing') RETURNING id`
  );
  return created.id;
}
