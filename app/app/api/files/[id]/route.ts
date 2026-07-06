import path from "node:path";
import { readFile } from "node:fs/promises";
import { query } from "@/lib/db";
import { requireUser, authErrorResponse } from "@/lib/auth";
import { uploadsDir, contentTypeByExt } from "@/lib/uploads";

/** Отдача рантайм-файла по attachments.id — только авторизованным. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireUser();
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "bad id" }, { status: 400 });

  const [att] = await query<{ url: string; filename: string | null }>(
    `SELECT url, filename FROM attachments WHERE id = $1::uuid`,
    [id]
  );
  if (!att) return Response.json({ error: "not found" }, { status: 404 });
  // защита от traversal: только basename хранимого имени
  const stored = path.basename(att.url);
  let buf: Buffer;
  try {
    buf = await readFile(path.join(uploadsDir(), stored));
  } catch {
    return Response.json({ error: "file missing" }, { status: 404 });
  }
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": contentTypeByExt(stored),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.filename ?? stored)}`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
