/** Сумма прописью для печатных форм РК: тенге/тиын, RU и KK. */

const RU_ONES = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const RU_ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const RU_TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const RU_TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const RU_HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function ruPlural(n: number, forms: [string, string, string]): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return forms[0];
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return forms[1];
  return forms[2];
}

function ruTriple(n: number, feminine: boolean): string {
  const ones = feminine ? RU_ONES_F : RU_ONES;
  const parts: string[] = [];
  parts.push(RU_HUNDREDS[Math.floor(n / 100)]);
  const rest = n % 100;
  if (rest >= 10 && rest < 20) parts.push(RU_TEENS[rest - 10]);
  else {
    parts.push(RU_TENS[Math.floor(rest / 10)]);
    parts.push(ones[rest % 10]);
  }
  return parts.filter(Boolean).join(" ");
}

function ruIntWords(n: number): string {
  if (n === 0) return "ноль";
  const groups: string[] = [];
  const billions = Math.floor(n / 1e9) % 1000;
  const millions = Math.floor(n / 1e6) % 1000;
  const thousands = Math.floor(n / 1e3) % 1000;
  const units = n % 1000;
  if (billions) groups.push(`${ruTriple(billions, false)} ${ruPlural(billions, ["миллиард", "миллиарда", "миллиардов"])}`);
  if (millions) groups.push(`${ruTriple(millions, false)} ${ruPlural(millions, ["миллион", "миллиона", "миллионов"])}`);
  if (thousands) groups.push(`${ruTriple(thousands, true)} ${ruPlural(thousands, ["тысяча", "тысячи", "тысяч"])}`);
  if (units) groups.push(ruTriple(units, false));
  return groups.join(" ");
}

const KK_ONES = ["", "бір", "екі", "үш", "төрт", "бес", "алты", "жеті", "сегіз", "тоғыз"];
const KK_TENS = ["", "он", "жиырма", "отыз", "қырық", "елу", "алпыс", "жетпіс", "сексен", "тоқсан"];

function kkTriple(n: number): string {
  const parts: string[] = [];
  const h = Math.floor(n / 100);
  if (h) parts.push(h === 1 ? "жүз" : `${KK_ONES[h]} жүз`);
  const rest = n % 100;
  if (rest) {
    const t = Math.floor(rest / 10);
    if (t) parts.push(KK_TENS[t]);
    if (rest % 10) parts.push(KK_ONES[rest % 10]);
  }
  return parts.join(" ");
}

function kkIntWords(n: number): string {
  if (n === 0) return "нөл";
  const groups: string[] = [];
  const billions = Math.floor(n / 1e9) % 1000;
  const millions = Math.floor(n / 1e6) % 1000;
  const thousands = Math.floor(n / 1e3) % 1000;
  const units = n % 1000;
  if (billions) groups.push(`${kkTriple(billions)} миллиард`);
  if (millions) groups.push(`${kkTriple(millions)} миллион`);
  if (thousands) groups.push(thousands === 1 ? "бір мың" : `${kkTriple(thousands)} мың`);
  if (units) groups.push(kkTriple(units));
  return groups.join(" ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «12 345,50 ₸» → «Двенадцать тысяч триста сорок пять тенге 50 тиын». */
export function amountInWordsRu(amount: number): string {
  const tenge = Math.floor(amount);
  const tiyn = Math.round((amount - tenge) * 100);
  return `${capitalize(ruIntWords(tenge))} ${ruPlural(tenge, ["тенге", "тенге", "тенге"])} ${String(tiyn).padStart(2, "0")} ${ruPlural(tiyn, ["тиын", "тиына", "тиын"])}`;
}

export function amountInWordsKk(amount: number): string {
  const tenge = Math.floor(amount);
  const tiyn = Math.round((amount - tenge) * 100);
  return `${capitalize(kkIntWords(tenge))} теңге ${String(tiyn).padStart(2, "0")} тиын`;
}

/** Формат числа для форм: 1 234 567,89 (пробел-разряды, запятая-десятичные). */
export function money(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
