import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";
import { equipmentSummary, equipmentSummaryDetails } from "@/lib/reports/equipment-summary";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { t } from "@/lib/i18n";

/** Excel сводного отчёта по размещениям; с ?bucket=&key= — расшифровка группы. */
export async function GET(req: Request) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(REPORT_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const d = t(locale);
  const sp = new URL(req.url).searchParams;
  const bucket = sp.get("bucket");
  const key = sp.get("key");

  if (bucket && key) {
    const rows = await equipmentSummaryDetails(query, bucket, key);
    return excelResponse(
      `${d.reports.equipmentTitle} — ${d.reports.details}`,
      [
        { header: d.equipment.nomenclature, key: "nomenclature", width: 34 },
        { header: d.equipment.serial, key: "serial_number", width: 18 },
        { header: "IMEI", key: "imei", width: 18 },
        { header: d.equipment.condition, key: "condition", width: 12 },
        { header: d.equipment.status, key: "status", width: 16 },
        { header: d.equipment.billingState, key: "billing_state", width: 14 },
        { header: d.reports.daysHere, key: "days_here", width: 12 },
      ],
      rows as Record<string, unknown>[],
      {
        title: `${d.reports.equipmentTitle} — ${d.reports.details}`,
        params: [
          [`${d.reports.bucket}:`, (d.reports.buckets as Record<string, string>)[bucket] ?? bucket],
          [`${d.reports.group}:`, key],
        ],
      }
    );
  }

  const rows = await equipmentSummary(query);
  return excelResponse(
    d.reports.equipmentTitle,
    [
      { header: d.reports.bucket, key: "bucket_name", width: 16 },
      { header: d.reports.group, key: "group_name", width: 36 },
      { header: d.reports.newCount, key: "new_count", width: 10 },
      { header: d.reports.usedCount, key: "used_count", width: 10 },
      { header: d.reports.total, key: "total", width: 10 },
    ],
    rows.map((r) => ({ ...r, bucket_name: d.reports.buckets[r.bucket] })),
    { title: d.reports.equipmentTitle }
  );
}
