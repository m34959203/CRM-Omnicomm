import { requireRole, authErrorResponse } from "@/lib/auth";
import { fetchPaymentsFromOData } from "@/lib/billing/odata-1c";
import { matchRecords, commitPayments } from "@/lib/billing/payments-import";

/**
 * Джоб OData-синхронизации оплат из 1С (вариант Б-1). Cron (X-Cron-Key) или
 * вручную [admin,accounting,head]. Требует ODATA_1C_URL в env; без него — 501.
 * Рекомендуемый интервал — раз в час; окно 7 дней, дубли отсеиваются по bank_reference.
 */
export async function POST(req: Request) {
  const cronKey = process.env.CRON_KEY;
  if (!cronKey || req.headers.get("x-cron-key") !== cronKey) {
    try {
      await requireRole(["admin", "accounting", "head"]);
    } catch (e) {
      return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
    }
  }
  if (!process.env.ODATA_1C_URL) {
    return Response.json(
      { error: "ODATA_1C_URL не настроен (нужна публикация базы 1С с OData)" },
      { status: 501 }
    );
  }
  try {
    const records = await fetchPaymentsFromOData();
    if (records.length === 0) return Response.json({ total: 0, created: 0, skipped: 0 });
    const report = await matchRecords(records);
    const result = await commitPayments(report, null, "OData 1С");
    return Response.json({ total: report.total, ...result });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 502 });
  }
}
