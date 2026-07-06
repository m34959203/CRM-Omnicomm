import path from "node:path";
import { mkdir } from "node:fs/promises";

/**
 * Каталог рантайм-файлов (фото актов/заявок и т.п.) — ВНЕ public:
 * в Next standalone public запекается на билде, файлы отдаём через /api/files/[id].
 */
export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");
}

export async function ensureUploadsDir(): Promise<string> {
  const dir = uploadsDir();
  await mkdir(dir, { recursive: true });
  return dir;
}

const MIME: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".pdf": "application/pdf",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
};

export function contentTypeByExt(filename: string): string {
  return MIME[path.extname(filename).toLowerCase()] ?? "application/octet-stream";
}
