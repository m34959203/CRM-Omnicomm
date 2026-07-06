/** Календарь биллинга: все «дни» считаются по Asia/Almaty (UTC+5, единый пояс РК с 2024). */

const ALMATY_OFFSET_MS = 5 * 3600 * 1000;

/** Календарная дата Алматы (YYYY-MM-DD) для момента времени. */
export function almatyDate(ts: Date): string {
  return new Date(ts.getTime() + ALMATY_OFFSET_MS).toISOString().slice(0, 10);
}

/** Момент начала суток Алматы для даты YYYY-MM-DD. */
export function almatyDayStart(date: string): Date {
  return new Date(new Date(`${date}T00:00:00Z`).getTime() - ALMATY_OFFSET_MS);
}

/** Последовательность дат YYYY-MM-DD включительно. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = [];
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = new Date(`${from}T00:00:00Z`).getTime(); t <= end; t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

export function daysInPeriod(from: string, to: string): number {
  return (
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86400000 + 1
  );
}

/** Текущий период YYYY-MM по календарю Алматы (для дефолтов форм). */
export function currentAlmatyPeriod(): string {
  return almatyDate(new Date()).slice(0, 7);
}

/** Границы календарного месяца YYYY-MM → [первое, последнее] число. */
export function monthBounds(period: string): { start: string; end: string } {
  const [y, m] = period.split("-").map(Number);
  const start = `${period}-01`;
  const end = `${period}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
  return { start, end };
}
