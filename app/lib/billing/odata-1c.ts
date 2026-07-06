/**
 * OData-пул из 1С:Бухгалтерии (вариант Б-1): база опубликована на веб-сервере,
 * стандартный интерфейс OData включён. Тянем «Поступление на расчётный счёт»
 * за последние N дней; БИН контрагента — $expand.
 *
 * env: ODATA_1C_URL (…/odata/standard.odata), ODATA_1C_USER, ODATA_1C_PASSWORD.
 * Имена реквизитов различаются между релизами БП КЗ — маппинг толерантный:
 * берём первое существующее поле из списка кандидатов.
 * fetch — за инъекцией (тестируется против мока).
 */
import type { PaymentRecord } from "./payments-import";

type Json = Record<string, unknown>;
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const pick = (o: Json, keys: string[]): unknown => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};

export async function fetchPaymentsFromOData(opts?: {
  sinceDays?: number;
  fetchImpl?: FetchLike;
  baseUrl?: string;
  user?: string;
  password?: string;
}): Promise<PaymentRecord[]> {
  const base = (opts?.baseUrl ?? process.env.ODATA_1C_URL)?.replace(/\/+$/, "");
  const user = opts?.user ?? process.env.ODATA_1C_USER;
  const password = opts?.password ?? process.env.ODATA_1C_PASSWORD;
  if (!base) throw new Error("ODATA_1C_URL не настроен");
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const sinceDays = opts?.sinceDays ?? 7;

  const since = new Date(Date.now() - sinceDays * 86400000).toISOString().slice(0, 10);
  const url =
    `${base}/Document_ПоступлениеНаРасчетныйСчет?$format=json` +
    `&$filter=${encodeURIComponent(`Date ge datetime'${since}T00:00:00' and Posted eq true`)}` +
    `&$expand=Контрагент&$top=1000`;

  const res = await fetchImpl(url, {
    headers: {
      Accept: "application/json",
      ...(user
        ? { Authorization: `Basic ${Buffer.from(`${user}:${password ?? ""}`).toString("base64")}` }
        : {}),
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`OData 1С: HTTP ${res.status}`);
  const data = (await res.json()) as { value?: Json[] };

  const out: PaymentRecord[] = [];
  for (const d of data.value ?? []) {
    const amount = Number(pick(d, ["СуммаДокумента", "Сумма"]) ?? 0);
    if (!amount) continue;
    const contragent = (d["Контрагент"] ?? {}) as Json;
    const bin = String(
      pick(contragent, ["БИН", "ИИН", "БИНИИН", "ИНН", "РегистрационныйНомер"]) ??
        pick(d, ["КонтрагентБИН"]) ?? ""
    ).replace(/\D/g, "");
    out.push({
      date: String(d["Date"] ?? "").slice(0, 10),
      number: String(pick(d, ["Number", "НомерВходящегоДокумента"]) ?? "").trim(),
      bin,
      amount,
      purpose: String(pick(d, ["НазначениеПлатежа", "Комментарий"]) ?? ""),
      payer_name: (pick(contragent, ["Description", "Наименование"]) as string | undefined),
    });
  }
  return out;
}
