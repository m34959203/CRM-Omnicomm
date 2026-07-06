import ExcelJS from "exceljs";
import { tx, query } from "@/lib/db";
import { requireRole, authErrorResponse } from "@/lib/auth";

/**
 * Импорт SIM из Excel-файла оператора (как «Оприходование от оператора связи»
 * в эталоне Аскан). multipart: file (xlsx), operator_id, warehouse_id.
 * Колонки ищутся по заголовкам первой строки: ICCID/ICC/Серийный, MSISDN/Номер, Тариф.
 * Дубли по ICCID пропускаются. Всё в одной транзакции + sim_movements receipt.
 */
export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireRole(["admin", "manager", "head"])).userId;
  } catch (e) {
    return authErrorResponse(e) ?? Response.json({ error: "server" }, { status: 500 });
  }

  const fd = await req.formData().catch(() => null);
  const file = fd?.get("file");
  const operatorId = fd?.get("operator_id") as string | null;
  const warehouseId = fd?.get("warehouse_id") as string | null;
  if (!(file instanceof File) || !operatorId || !warehouseId) {
    return Response.json({ error: "file, operator_id, warehouse_id required" }, { status: 400 });
  }

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "не удалось прочитать xlsx" }, { status: 422 });
  }
  const ws = wb.worksheets[0];
  if (!ws) return Response.json({ error: "пустая книга" }, { status: 422 });

  // Поиск колонок по заголовкам (регистронезависимо, RU/EN варианты).
  const headerRow = ws.getRow(1);
  let iccCol = 0, msisdnCol = 0, planCol = 0;
  headerRow.eachCell((cell, col) => {
    const v = String(cell.value ?? "").toLowerCase();
    if (!iccCol && /icc|серийн|сериял/.test(v)) iccCol = col;
    else if (!msisdnCol && /msisdn|номер|абонент|нөмір/.test(v)) msisdnCol = col;
    else if (!planCol && /тариф/.test(v)) planCol = col;
  });
  if (!iccCol) {
    return Response.json(
      { error: "не найдена колонка ICCID (заголовки: ICCID / ICC / Серийный)" },
      { status: 422 }
    );
  }

  // Тарифные планы оператора для сопоставления по имени.
  const plans = await query<{ id: string; name: string }>(
    `SELECT id, name FROM sim_operator_plans WHERE operator_id = $1 AND is_active`,
    [operatorId]
  );

  const items: { icc: string; msisdn: string | null; planId: string | null }[] = [];
  const errors: string[] = [];
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const rawIcc = String(row.getCell(iccCol).value ?? "").replace(/\s/g, "");
    if (!rawIcc) return;
    if (!/^\d{18,22}$/.test(rawIcc)) {
      errors.push(`строка ${n}: ICCID «${rawIcc.slice(0, 30)}» не похож на серийный номер`);
      return;
    }
    const rawMsisdn = msisdnCol ? String(row.getCell(msisdnCol).value ?? "").replace(/[^\d+]/g, "") : "";
    const planName = planCol ? String(row.getCell(planCol).value ?? "").trim() : "";
    const plan = planName
      ? plans.find((p) => p.name.toLowerCase() === planName.toLowerCase()) ?? null
      : null;
    items.push({ icc: rawIcc, msisdn: rawMsisdn || null, planId: plan?.id ?? null });
  });
  if (items.length === 0) {
    return Response.json({ created: 0, skipped: 0, errors }, { status: errors.length ? 422 : 200 });
  }

  const result = await tx(async (q) => {
    let created = 0, skipped = 0;
    for (const it of items) {
      const [row] = await q<{ id: string }>(
        `INSERT INTO sim_cards (icc, msisdn, operator_id, plan_id, location_type, warehouse_id, status)
         VALUES ($1, $2, $3::uuid, $4::uuid, 'warehouse', $5::uuid, 'in_stock')
         ON CONFLICT (icc) DO NOTHING RETURNING id`,
        [it.icc, it.msisdn, operatorId, it.planId, warehouseId]
      );
      if (!row) { skipped++; continue; }
      await q(
        `INSERT INTO sim_movements (sim_id, from_type, to_type, warehouse_id, source_type, performed_by)
         VALUES ($1, NULL, 'warehouse', $2::uuid, 'import', $3::uuid)`,
        [row.id, warehouseId, userId]
      );
      created++;
    }
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, detail)
       VALUES ($1, 'import', 'sim_cards', jsonb_build_object('created', $2::int, 'skipped', $3::int, 'file', $4::text))`,
      [userId, created, skipped, file.name]
    );
    return { created, skipped };
  });

  return Response.json({ ...result, errors });
}
