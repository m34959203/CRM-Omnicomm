import { requireRole, authErrorResponse } from "@/lib/auth";
import {
  parseXlsx,
  parseClientBank,
  matchRecords,
  commitPayments,
} from "@/lib/billing/payments-import";

/**
 * Импорт оплат из 1С (вариант А): multipart file (xlsx | kl_to_1c.txt).
 * ?dry=1 — только предпросмотр (parse+match), без dry — проведение.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "accounting", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "file required" }, { status: 400 });
  }

  let records;
  try {
    if (/\.(txt|kl)$/i.test(file.name)) {
      const raw = Buffer.from(await file.arrayBuffer());
      // 1С выгружает клиент-банк в cp1251; пробуем utf8, при «кракозябрах» — cp1251.
      let text = raw.toString("utf8");
      if (!/СекцияДокумент/iu.test(text)) {
        const { TextDecoder } = await import("node:util");
        text = new TextDecoder("windows-1251").decode(raw);
      }
      records = parseClientBank(text);
    } else {
      records = await parseXlsx(await file.arrayBuffer());
    }
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 422 });
  }
  if (records.length === 0) {
    return Response.json({ error: "в файле не найдено ни одной оплаты" }, { status: 422 });
  }

  const report = await matchRecords(records);
  if (dry) return Response.json(report);

  const result = await commitPayments(report, userId, `файл ${file.name}`);
  return Response.json({ ...report, ...result });
}
