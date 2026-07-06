import ExcelJS from "exceljs";

export type ExcelColumn = {
  header: string;
  key: string;
  width?: number;
  /** money-колонки получают формат # ##0.00 и попадают в строку «Итого» */
  money?: boolean;
};

export type ExcelMeta = {
  /** Заголовок отчёта (A2, 18pt bold). По умолчанию = filename. */
  title?: string;
  /** Строка периода: «Период: 01.06.2026 – 30.06.2026» */
  period?: string;
  /** Доп. параметры отбора: [['Организация','ТОО …'], ['Клиент','…']] */
  params?: [string, string][];
  /** Ключи колонок для строки «Итого» (по умолчанию — все money-колонки). */
  totals?: string[];
};

/** «YYYY-MM» → «01.06.2026 – 30.06.2026» (для meta.period). */
export function periodRu(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return `01.${mm}.${y} – ${String(last).padStart(2, "0")}.${mm}.${y}`;
}

/** «YYYY-MM-DD» → «DD.MM.YYYY» (для meta.period из дат). */
export function dateRu(iso: string): string {
  return iso.slice(0, 10).split("-").reverse().join(".");
}

const FONT = { name: "Arial", size: 8 } as const;
const BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin" }, bottom: { style: "thin" },
  left: { style: "thin" }, right: { style: "thin" },
};

function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Выгрузка «как в 1С» (образец — отчёты УТ/Аскан, download/ascan_audit/*.xlsx):
 * A2 — заголовок 18pt bold; A4 — «Параметры:» (период, отборы, дата формирования);
 * таблица со сплошной тонкой сеткой, шапка 10pt bold с заливкой, данные 8pt Arial;
 * внизу строка «Итого» (bold) по money-колонкам.
 */
export async function excelResponse(
  filename: string,
  columns: ExcelColumn[],
  rows: Record<string, unknown>[],
  meta: ExcelMeta = {}
): Promise<Response> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(filename.slice(0, 31), {
    views: [{ showGridLines: false }],
  });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width ?? 20 }));

  // Заголовок (A2) как в 1С
  const title = meta.title ?? filename;
  ws.getCell("A2").value = title;
  ws.getCell("A2").font = { ...FONT, size: 18, bold: true };
  if (columns.length > 1) {
    ws.mergeCells(2, 1, 2, Math.min(columns.length, 8));
  }

  // Блок параметров (A4…)
  let r = 4;
  const paramLines: [string, string][] = [];
  if (meta.period) paramLines.push(["Период:", meta.period]);
  paramLines.push(...(meta.params ?? []));
  paramLines.push(["Сформирован:", fmtDate(new Date())]);
  ws.getCell(r, 1).value = "Параметры:";
  ws.getCell(r, 1).font = { ...FONT, size: 10 };
  for (const [label, value] of paramLines) {
    const cell = ws.getCell(r, 2);
    cell.value = `${label} ${value}`;
    cell.font = { ...FONT, size: 10 };
    r++;
  }
  r++; // пустая строка перед таблицей

  // Шапка таблицы
  const headerRow = ws.getRow(r);
  columns.forEach((c, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = c.header;
    cell.font = { ...FONT, size: 10, bold: true };
    cell.border = BORDER;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.alignment = { vertical: "middle", wrapText: true };
  });
  headerRow.height = 24;
  ws.views = [{ showGridLines: false, state: "frozen", ySplit: r }];
  r++;

  // Данные — сплошная сетка, money-формат
  for (const row of rows) {
    const wsRow = ws.getRow(r);
    columns.forEach((c, i) => {
      const cell = wsRow.getCell(i + 1);
      const v = row[c.key];
      cell.value = c.money && v != null && v !== "" ? Number(v) : (v as ExcelJS.CellValue);
      cell.font = FONT;
      cell.border = BORDER;
      if (c.money) cell.numFmt = "# ##0.00";
    });
    r++;
  }

  // Итого по money-колонкам
  const totalKeys = meta.totals ?? columns.filter((c) => c.money).map((c) => c.key);
  if (totalKeys.length > 0 && rows.length > 0) {
    const totalRow = ws.getRow(r);
    const firstTotalIdx = columns.findIndex((c) => totalKeys.includes(c.key));
    const labelSpan = Math.max(1, firstTotalIdx);
    ws.mergeCells(r, 1, r, labelSpan);
    const labelCell = totalRow.getCell(1);
    labelCell.value = "Итого";
    columns.forEach((c, i) => {
      const cell = totalRow.getCell(i + 1);
      cell.font = { ...FONT, bold: true };
      cell.border = BORDER;
      if (totalKeys.includes(c.key)) {
        const sum = rows.reduce((s, row) => s + (Number(row[c.key]) || 0), 0);
        cell.value = Math.round(sum * 100) / 100;
        cell.numFmt = "# ##0.00";
      }
    });
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.xlsx`,
    },
  });
}
