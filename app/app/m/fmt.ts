/** Форматтеры PWA техника: всё время — Asia/Almaty. */

export function fmtDay(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("ru-RU", {
    timeZone: "Asia/Almaty",
    day: "2-digit",
    month: "2-digit",
  });
}

export function fmtTime(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("ru-RU", {
    timeZone: "Asia/Almaty",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtDateTime(iso: string | Date): string {
  return `${fmtDay(iso)} ${fmtTime(iso)}`;
}

export function fmtMoney(v: string | number): string {
  return Number(v).toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

/** Период наряда: «08.07 09:00 – 12:30» / «08.07 09:00 – 09.07 18:00». */
export function fmtPeriod(start: string | null, end: string | null): string | null {
  if (!start) return null;
  if (!end) return fmtDateTime(start);
  return fmtDay(start) === fmtDay(end)
    ? `${fmtDateTime(start)} – ${fmtTime(end)}`
    : `${fmtDateTime(start)} – ${fmtDateTime(end)}`;
}
