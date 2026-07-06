import { query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";
import { excelResponse } from "@/lib/excel";
import { t } from "@/lib/i18n";
import { PAYROLL_READ_ROLES } from "@/lib/payroll/common";

export async function GET(req: Request) {
  let locale: "ru" | "kk";
  try {
    locale = (await requireRole(PAYROLL_READ_ROLES)).locale;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }
  const p = t(locale).payroll;
  const sp = new URL(req.url).searchParams;
  const userId = sp.get("user_id") ?? "";
  const kind = sp.get("kind") ?? "";
  const dateFrom = sp.get("date_from") ?? "";
  const dateTo = sp.get("date_to") ?? "";
  const unsheeted = sp.get("unsheeted") === "1";

  const rows = await query<Record<string, unknown>>(
    `SELECT to_char(e.entry_date, 'DD.MM.YYYY') AS entry_date, u.full_name AS performer,
            e.kind, wt.name AS work_type, e.reason, e.amount,
            CASE WHEN e.sheet_line_id IS NULL THEN $6 ELSE $7 END AS in_sheet
     FROM payroll_entries e
     JOIN users u ON u.id = e.user_id
     LEFT JOIN act_works aw ON aw.id = e.act_work_id
     LEFT JOIN work_types wt ON wt.id = aw.work_type_id
     WHERE ($1 = '' OR e.user_id = $1::uuid)
       AND ($2 = '' OR e.kind = $2)
       AND ($3 = '' OR e.entry_date >= $3::date)
       AND ($4 = '' OR e.entry_date <= $4::date)
       AND (NOT $5::boolean OR e.sheet_line_id IS NULL)
     ORDER BY e.entry_date DESC, e.created_at DESC`,
    [userId, kind, dateFrom, dateTo, unsheeted, p.no, p.yes]
  );
  const mapped = rows.map((r) => ({
    ...r,
    kind: (p.kinds as Record<string, string>)[String(r.kind)] ?? r.kind,
    amount: Number(r.amount),
  }));
  return excelResponse(
    p.entriesTitle,
    [
      { header: p.date, key: "entry_date", width: 12 },
      { header: p.performer, key: "performer", width: 28 },
      { header: p.kind, key: "kind", width: 16 },
      { header: p.workType, key: "work_type", width: 30 },
      { header: p.reason, key: "reason", width: 30 },
      { header: p.amount, key: "amount", width: 14 },
      { header: p.inSheet, key: "in_sheet", width: 14 },
    ],
    mapped
  );
}
