import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";
import { testingDays, fromClientDays, atSupplierDays } from "@/lib/reports/days";
import { REPORT_READ_ROLES } from "@/lib/reports/common";
import { t } from "@/lib/i18n";

const fmtDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("ru-RU", { timeZone: "Asia/Almaty" }) : "";

/** Excel отчётов «с днями»: ?tab=testing|from_client|supplier. */
export async function GET(req: Request) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(REPORT_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const d = t(locale);
  const r = d.reports;
  const tab = new URL(req.url).searchParams.get("tab") ?? "testing";

  if (tab === "from_client") {
    const rows = await fromClientDays(query);
    return excelResponse(
      r.tabFromClients,
      [
        { header: r.doc, key: "number", width: 14 },
        { header: r.client, key: "client_name", width: 34 },
        { header: d.equipment.nomenclature, key: "nomenclature", width: 30 },
        { header: d.equipment.serial, key: "serial_number", width: 18 },
        { header: r.defect, key: "defect_note", width: 30 },
        { header: r.sinceDate, key: "received_at", width: 14 },
        { header: r.days, key: "days", width: 10 },
      ],
      rows.map((x) => ({ ...x, received_at: fmtDate(x.received_at) }))
    );
  }
  if (tab === "supplier") {
    const rows = await atSupplierDays(query);
    return excelResponse(
      r.tabAtSupplier,
      [
        { header: d.warehouses.supplier, key: "supplier_name", width: 30 },
        { header: d.equipment.nomenclature, key: "nomenclature", width: 30 },
        { header: d.equipment.serial, key: "serial_number", width: 18 },
        { header: r.sinceDate, key: "since", width: 14 },
        { header: r.days, key: "days", width: 10 },
      ],
      rows.map((x) => ({ ...x, since: fmtDate(x.since) }))
    );
  }
  const rows = await testingDays(query);
  return excelResponse(
    r.tabTesting,
    [
      { header: r.doc, key: "number", width: 14 },
      { header: r.client, key: "client_name", width: 34 },
      { header: d.clientCard.object, key: "object_name", width: 26 },
      { header: d.equipment.nomenclature, key: "nomenclature", width: 30 },
      { header: d.equipment.serial, key: "serial_number", width: 18 },
      { header: r.sinceDate, key: "started_at", width: 14 },
      { header: r.days, key: "days", width: 10 },
    ],
    rows.map((x) => ({ ...x, started_at: fmtDate(x.started_at) }))
  );
}
