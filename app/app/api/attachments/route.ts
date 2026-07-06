import { randomUUID } from "node:crypto";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { ensureUploadsDir } from "@/lib/uploads";

const ENTITY_TYPES = [
  "request", "ticket", "work_order", "maintenance_act",
  "billing_document", "equipment_repair_doc", "client", "monitoring_object",
];
const KINDS = ["photo", "document", "signature", "audio"];
const MAX_SIZE = 20 * 1024 * 1024; // 20 МБ

/**
 * Загрузка вложения (formData: file, entity_type, entity_id, kind?, place?).
 * Файл — в UPLOADS_DIR под uuid-именем (вне public: Next standalone запекает
 * public на билде); отдача — GET /api/files/[id].
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    // техник тоже грузит фото (PWA этап 4)
    userId = (await requireRole(["admin", "manager", "support", "installer", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const fd = await req.formData().catch(() => null);
  if (!fd) return Response.json({ error: "formData expected" }, { status: 400 });
  const file = fd.get("file");
  const entityType = String(fd.get("entity_type") ?? "");
  const entityId = String(fd.get("entity_id") ?? "");
  const kind = String(fd.get("kind") || "photo");
  const place = String(fd.get("place") || "") || null;

  if (!(file instanceof File)) return Response.json({ error: "file required" }, { status: 400 });
  if (!ENTITY_TYPES.includes(entityType)) return Response.json({ error: "bad entity_type" }, { status: 400 });
  if (!/^[0-9a-f-]{36}$/i.test(entityId)) return Response.json({ error: "bad entity_id" }, { status: 400 });
  if (!KINDS.includes(kind)) return Response.json({ error: "bad kind" }, { status: 400 });
  if (file.size > MAX_SIZE) return Response.json({ error: "файл больше 20 МБ" }, { status: 413 });

  const ext = path.extname(file.name).toLowerCase().slice(0, 10) || ".bin";
  const storedName = `${randomUUID()}${/^\.[a-z0-9]+$/.test(ext) ? ext : ".bin"}`;
  const dir = await ensureUploadsDir();
  await writeFile(path.join(dir, storedName), Buffer.from(await file.arrayBuffer()));

  const [row] = await query<{ id: string }>(
    `INSERT INTO attachments (entity_type, entity_id, kind, place, filename, url, uploaded_by)
     VALUES ($1, $2::uuid, $3, $4, $5, $6, $7::uuid) RETURNING id`,
    [entityType, entityId, kind, place, file.name, storedName, userId]
  );
  return Response.json({ id: row.id, url: `/api/files/${row.id}` }, { status: 201 });
}
