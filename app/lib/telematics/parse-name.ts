/**
 * Парсинг имени объекта из Omnicomm: «марка + госномер» → поля monitoring_objects.
 * Госномер-паттерны РК: «A123BC09» (частный) и «123ABC09» (юрлица).
 * Кириллические двойники (АВЕКМНОРСТУХ) нормализуются в латиницу.
 */

export type ParsedVehicleName = {
  brand: string | null;
  model: string | null;
  regNumber: string | null;
};

const CYR_TO_LAT: Record<string, string> = {
  А: "A", В: "B", Е: "E", К: "K", М: "M", Н: "H",
  О: "O", Р: "P", С: "C", Т: "T", У: "Y", Х: "X",
};

function normalizePlateChars(s: string): string {
  return s
    .toUpperCase()
    .replace(/[АВЕКМНОРСТУХ]/g, (ch) => CYR_TO_LAT[ch] ?? ch);
}

// A123BC09 | 123ABC09 (допускаем пробелы/дефисы внутри исходника — сравниваем по свёртке)
const KZ_PRIVATE = /^[A-Z]\d{3}[A-Z]{2}\d{2}$/;
const KZ_LEGAL = /^\d{3}[A-Z]{2,3}\d{2}$/;

function isKzPlate(token: string): boolean {
  const t = normalizePlateChars(token).replace(/[\s-]/g, "");
  return KZ_PRIVATE.test(t) || KZ_LEGAL.test(t);
}

/**
 * «КАМАЗ 65115 А123ВС09» → { brand: "КАМАЗ", model: "65115", regNumber: "A123BC09" }.
 * Не распарсилось → все поля null (объект получит name как есть).
 */
export function parseVehicleName(name: string): ParsedVehicleName {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const plateIdx = tokens.findIndex(isKzPlate);
  if (plateIdx === -1) return { brand: null, model: null, regNumber: null };

  const regNumber = normalizePlateChars(tokens[plateIdx]).replace(/[\s-]/g, "");
  const before = tokens.slice(0, plateIdx);
  const brand = before[0] ?? null;
  const model = before.length > 1 ? before.slice(1).join(" ") : null;
  return { brand, model, regNumber };
}
