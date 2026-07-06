import { ru, type Dict } from "./dict/ru";
import { kk } from "./dict/kk";

export type Locale = "ru" | "kk";

const dicts: Record<Locale, Dict> = { ru, kk };

export function t(locale: Locale): Dict {
  return dicts[locale] ?? ru;
}
