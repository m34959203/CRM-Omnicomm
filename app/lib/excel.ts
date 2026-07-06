import ExcelJS from "exceljs";

export type ExcelColumn = { header: string; key: string; width?: number };

/** Единый паттерн «любой список → Excel»: возвращает Response с xlsx-вложением. */
export async function excelResponse(
  filename: string,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[]
): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Данные");
  ws.columns = columns.map((c) => ({ ...c, width: c.width ?? 20 }));
  ws.getRow(1).font = { bold: true };
  ws.addRows(rows);
  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.xlsx`,
    },
  });
}
