/**
 * Печатные формы РК по расчётному документу (двуязычные RU/KK):
 *  - invoice   — «Счёт на оплату / Төлемге шот» (реквизиты продавца: ИИК/БИК/Кбе/БИН);
 *  - breakdown — «Расшифровка абонентской платы / Абоненттік төлем таратылымы» (по accruals);
 *  - act       — «Акт выполненных работ (Р-1) / Орындалған жұмыстар актісі».
 * Возвращают самодостаточный HTML (print-CSS внутри) — рендерится страницей
 * /print/billing/[id] и конвертируется в PDF через lib/pdf.ts (htmlToPdf).
 */
import { query } from "@/lib/db";
import { amountInWordsRu, amountInWordsKk, money } from "./amount-words";

export type PrintForm = "invoice" | "act" | "breakdown";

export type DocumentPrintData = {
  doc: {
    id: string;
    number: string | null;
    kind: "advance_invoice" | "act" | "one_time_invoice";
    scheme: string;
    period_start: string | null;
    period_end: string | null;
    subtotal: string;
    extra_charge: string;
    discount_amount: string;
    prepaid_amount: string;
    vat_rate: string | null;
    vat_amount: string;
    total: string;
    status: string;
    issued_at: string | null;
    created_at: string;
    client_id: string;
    client_name: string;
  };
  seller: {
    name: string;
    name_kk: string | null;
    bin: string | null;
    iik: string | null;
    bik: string | null;
    bank_name: string | null;
    kbe: string | null;
    is_vat_payer: boolean;
    vat_certificate: string | null;
    legal_address: string | null;
    legal_address_kk: string | null;
    director_name: string | null;
    director_basis: string | null;
    phone: string | null;
  } | null;
  buyer: {
    name: string;
    name_kk: string | null;
    bin_iin: string | null;
    legal_address: string | null;
    iik: string | null;
    bik: string | null;
    bank_name: string | null;
    kbe: string | null;
  } | null;
  contract: { number: string; signed_at: string | null } | null;
  accruals: {
    object_name: string | null;
    method: string;
    date_from: string;
    date_to: string;
    days: number | null;
    amount: string;
    note: string | null;
  }[];
};

export async function loadPrintData(id: string): Promise<DocumentPrintData | null> {
  const [doc] = await query<DocumentPrintData["doc"]>(
    `SELECT d.id, d.number, d.kind, d.scheme,
            d.period_start::text, d.period_end::text,
            d.subtotal::text, d.extra_charge::text, d.discount_amount::text,
            d.prepaid_amount::text, d.vat_rate::text, d.vat_amount::text, d.total::text,
            d.status, d.issued_at::text, d.created_at::text,
            d.client_id, d.own_org_id, c.name AS client_name
     FROM billing_documents d
     JOIN clients c ON c.id = d.client_id
     WHERE d.id = $1::uuid`,
    [id]
  );
  if (!doc) return null;

  const [seller] = await query<NonNullable<DocumentPrintData["seller"]>>(
    `SELECT name, name_kk, bin, iik, bik, bank_name, kbe, is_vat_payer, vat_certificate,
            legal_address, legal_address_kk, director_name, director_basis, phone
     FROM own_organizations
     WHERE CASE WHEN $1::uuid IS NOT NULL THEN id = $1::uuid ELSE is_active END
     ORDER BY created_at LIMIT 1`,
    [(doc as unknown as { own_org_id: string | null }).own_org_id]
  );

  const [buyer] = await query<NonNullable<DocumentPrintData["buyer"]>>(
    `SELECT cp.name, cp.name_kk, cp.bin_iin, cp.legal_address,
            ba.iik, ba.bik, ba.bank_name, cp.kbe
     FROM counterparties cp
     LEFT JOIN counterparty_bank_accounts ba
       ON ba.counterparty_id = cp.id AND ba.is_primary
     WHERE cp.client_id = $1::uuid
     ORDER BY cp.created_at LIMIT 1`,
    [doc.client_id]
  );

  const [contract] = await query<{ number: string; signed_at: string | null }>(
    `SELECT number, signed_at::text FROM contracts
     WHERE client_id = $1::uuid AND status = 'active'
     ORDER BY created_at LIMIT 1`,
    [doc.client_id]
  );

  const accruals = await query<DocumentPrintData["accruals"][number]>(
    `SELECT o.name AS object_name, a.method, a.date_from::text, a.date_to::text,
            a.days, a.amount::text, a.note
     FROM accruals a
     LEFT JOIN monitoring_objects o ON o.id = a.object_id
     WHERE a.billing_document_id = $1::uuid AND a.status <> 'cancelled'
     ORDER BY o.name NULLS LAST, a.date_from`,
    [id]
  );

  return { doc, seller: seller ?? null, buyer: buyer ?? null, contract: contract ?? null, accruals };
}

/* ---------- Хелперы форматирования ---------- */

const RU_MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const KK_MONTHS = ["қаңтар", "ақпан", "наурыз", "сәуір", "мамыр", "маусым", "шілде", "тамыз", "қыркүйек", "қазан", "қараша", "желтоқсан"];

function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}.${m}.${y}`;
}

function periodLabel(d: DocumentPrintData["doc"]): { ru: string; kk: string } {
  if (!d.period_start) return { ru: "—", kk: "—" };
  const [y, m] = d.period_start.split("-").map(Number);
  return { ru: `${RU_MONTHS[m - 1]} ${y} г.`, kk: `${y} ж. ${KK_MONTHS[m - 1]}` };
}

const METHOD_LABEL: Record<string, string> = {
  activity: "Посуточно / Күнделікті",
  subscription: "Подписка / Жазылым",
  one_time: "Разовое / Біржолғы",
};

function docDate(d: DocumentPrintData["doc"]): string {
  return fmtDate(d.issued_at ?? d.created_at);
}

function baseCss(): string {
  return `
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "DejaVu Sans", Arial, sans-serif; font-size: 11px; color: #000; padding: 24px; }
    h1 { font-size: 14px; margin: 12px 0 2px; }
    h2 { font-size: 11px; font-weight: normal; color: #333; margin-bottom: 12px; }
    table.grid { width: 100%; border-collapse: collapse; margin: 8px 0; }
    table.grid th, table.grid td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; }
    table.grid th { background: #f0f0f0; text-align: center; font-weight: bold; }
    table.req { width: 100%; border-collapse: collapse; margin: 8px 0; }
    table.req td { border: 1px solid #000; padding: 4px 6px; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .ctr { text-align: center; }
    .small { font-size: 9.5px; color: #222; }
    .muted { color: #444; }
    .words { margin-top: 8px; }
    .sig { margin-top: 32px; width: 100%; }
    .sig td { padding: 8px 4px; vertical-align: bottom; }
    .sigline { display: inline-block; width: 180px; border-bottom: 1px solid #000; }
    .mp { color: #555; font-size: 9.5px; }
    .totals td { border: none; padding: 2px 6px; }
    .totals { width: auto; margin-left: auto; }
    hr.cut { border: none; border-top: 2px solid #000; margin: 10px 0; }
    @page { size: A4; margin: 0; }
    @media print { body { padding: 0; } }
  </style>`;
}

function wrap(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"><title>${esc(title)}</title>${baseCss()}</head><body>${body}</body></html>`;
}

function sellerRequisites(s: DocumentPrintData["seller"]): string {
  if (!s) return `<p class="muted">Организация-продавец не заполнена / Сатушы ұйым толтырылмаған</p>`;
  return `
  <table class="req">
    <tr>
      <td colspan="2"><span class="small">Бенефициар / Бенефициар</span><br>
        <b>${esc(s.name)}</b>${s.name_kk ? `<br><span class="small">${esc(s.name_kk)}</span>` : ""}<br>
        <span class="small">БИН / БСН:</span> ${esc(s.bin) || "—"}</td>
      <td><span class="small">ИИК / ЖСК</span><br><b>${esc(s.iik) || "—"}</b></td>
      <td><span class="small">Кбе</span><br>${esc(s.kbe) || "—"}</td>
    </tr>
    <tr>
      <td colspan="2"><span class="small">Банк бенефициара / Бенефициар банкі</span><br>${esc(s.bank_name) || "—"}</td>
      <td><span class="small">БИК / БСК</span><br><b>${esc(s.bik) || "—"}</b></td>
      <td><span class="small">Код назначения платежа / Төлем мақсатының коды</span><br>859</td>
    </tr>
  </table>`;
}

function buyerBlock(d: DocumentPrintData): string {
  const b = d.buyer;
  const name = b?.name ?? d.doc.client_name;
  return `
  <p style="margin-top:8px"><span class="small">Покупатель / Сатып алушы:</span>
    <b>${esc(name)}</b>${b?.bin_iin ? `, БИН/ИИН (БСН/ЖСН): ${esc(b.bin_iin)}` : ""}
    ${b?.legal_address ? `<br><span class="small">${esc(b.legal_address)}</span>` : ""}</p>
  ${d.contract ? `<p class="small" style="margin-top:4px">Договор / Шарт: № ${esc(d.contract.number)}${d.contract.signed_at ? ` от / бастап ${fmtDate(d.contract.signed_at)}` : ""}</p>` : ""}`;
}

function serviceName(d: DocumentPrintData["doc"], p: { ru: string; kk: string }): string {
  return `Услуги мониторинга транспорта за ${p.ru} / ${p.kk} көлік мониторингі қызметтері`;
}

function amountsWords(total: number): string {
  return `
  <div class="words">
    <div><b>Всего к оплате / Барлығы төлеуге:</b> ${money(total)} ₸</div>
    <div class="small">Сумма прописью (RU): ${esc(amountInWordsRu(total))}</div>
    <div class="small">Сомасы жазбаша (KK): ${esc(amountInWordsKk(total))}</div>
  </div>`;
}

/* ---------- Формы ---------- */

export function renderInvoiceHtml(d: DocumentPrintData): string {
  const p = periodLabel(d.doc);
  const total = Number(d.doc.total);
  const vat = Number(d.doc.vat_amount);
  const discount = Number(d.doc.discount_amount);
  const prepaid = Number(d.doc.prepaid_amount);
  const vatLabel = d.doc.vat_rate
    ? `В том числе НДС ${Number(d.doc.vat_rate)}% / оның ішінде ҚҚС ${Number(d.doc.vat_rate)}%`
    : "Без НДС / ҚҚС-сыз";

  const body = `
  <p class="small">Внимание! Оплата данного счёта означает согласие с условиями оказания услуг.
  Назар аударыңыз! Осы шотты төлеу қызмет көрсету шарттарымен келісуді білдіреді.</p>
  <hr class="cut">
  ${sellerRequisites(d.seller)}
  <h1>Счёт на оплату № ${esc(d.doc.number) || "б/н"} от ${docDate(d.doc)}</h1>
  <h2>Төлемге шот № ${esc(d.doc.number) || "н/ж"} ${docDate(d.doc)}</h2>
  <p><span class="small">Поставщик / Жеткізуші:</span> <b>${esc(d.seller?.name) || "—"}</b>${d.seller?.bin ? `, БИН ${esc(d.seller.bin)}` : ""}${d.seller?.legal_address ? `, ${esc(d.seller.legal_address)}` : ""}</p>
  ${buyerBlock(d)}
  <table class="grid">
    <thead>
      <tr>
        <th style="width:26px">№</th>
        <th>Наименование товаров (работ, услуг) / Тауарлар (жұмыстар, қызметтер) атауы</th>
        <th style="width:60px">Кол-во / Саны</th>
        <th style="width:50px">Ед. / Өлш.</th>
        <th style="width:100px">Цена / Бағасы, ₸</th>
        <th style="width:110px">Сумма / Сомасы, ₸</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="ctr">1</td>
        <td>${esc(serviceName(d.doc, p))}</td>
        <td class="ctr">1</td>
        <td class="ctr">усл.</td>
        <td class="num">${money(Number(d.doc.subtotal))}</td>
        <td class="num">${money(Number(d.doc.subtotal))}</td>
      </tr>
    </tbody>
  </table>
  <table class="totals">
    ${discount > 0 ? `<tr><td>Скидка / Жеңілдік:</td><td class="num">−${money(discount)} ₸</td></tr>` : ""}
    ${prepaid > 0 ? `<tr><td>Предоплата (аванс) / Алдын ала төлем:</td><td class="num">−${money(prepaid)} ₸</td></tr>` : ""}
    <tr><td><b>Итого / Барлығы:</b></td><td class="num"><b>${money(total)} ₸</b></td></tr>
    <tr><td>${vatLabel}:</td><td class="num">${money(vat)} ₸</td></tr>
  </table>
  ${amountsWords(total)}
  <table class="sig">
    <tr>
      <td>Исполнитель / Орындаушы: ${esc(d.seller?.director_name) || ""} <span class="sigline"></span></td>
      <td class="mp">М.П. / М.О.</td>
    </tr>
  </table>`;
  return wrap(`Счёт ${d.doc.number ?? ""}`, body);
}

export function renderBreakdownHtml(d: DocumentPrintData): string {
  const p = periodLabel(d.doc);
  const rows = d.accruals
    .map(
      (a, i) => `
      <tr>
        <td class="ctr">${i + 1}</td>
        <td>${esc(a.object_name) || "— (клиент / клиент)"}</td>
        <td class="ctr">${METHOD_LABEL[a.method] ?? esc(a.method)}</td>
        <td class="ctr">${fmtDate(a.date_from)} — ${fmtDate(a.date_to)}</td>
        <td class="ctr">${a.days ?? "—"}</td>
        <td class="num">${money(Number(a.amount))}</td>
      </tr>`
    )
    .join("");
  const sum = d.accruals.reduce((s, a) => s + Number(a.amount), 0);

  const body = `
  <h1>Расшифровка абонентской платы к документу № ${esc(d.doc.number) || "б/н"} от ${docDate(d.doc)}</h1>
  <h2>№ ${esc(d.doc.number) || "н/ж"} құжатына абоненттік төлем таратылымы, ${docDate(d.doc)}</h2>
  <p><span class="small">Период / Кезең:</span> <b>${esc(p.ru)}</b> / ${esc(p.kk)}</p>
  <p><span class="small">Клиент / Клиент:</span> <b>${esc(d.doc.client_name)}</b></p>
  <table class="grid">
    <thead>
      <tr>
        <th style="width:26px">№</th>
        <th>Объект мониторинга / Мониторинг нысаны</th>
        <th style="width:140px">Метод / Әдіс</th>
        <th style="width:150px">Период / Кезең</th>
        <th style="width:50px">Дни / Күндер</th>
        <th style="width:110px">Сумма / Сомасы, ₸</th>
      </tr>
    </thead>
    <tbody>${rows || `<tr><td colspan="6" class="ctr muted">Нет начислений / Есептеулер жоқ</td></tr>`}</tbody>
    <tfoot>
      <tr>
        <th colspan="5" style="text-align:right">Итого начислено / Барлығы есептелді:</th>
        <th class="num">${money(Math.round(sum * 100) / 100)}</th>
      </tr>
    </tfoot>
  </table>
  <table class="totals">
    ${Number(d.doc.discount_amount) > 0 ? `<tr><td>Скидка / Жеңілдік:</td><td class="num">−${money(Number(d.doc.discount_amount))} ₸</td></tr>` : ""}
    ${Number(d.doc.prepaid_amount) > 0 ? `<tr><td>Предоплата / Алдын ала төлем:</td><td class="num">−${money(Number(d.doc.prepaid_amount))} ₸</td></tr>` : ""}
    <tr><td><b>К оплате / Төлеуге:</b></td><td class="num"><b>${money(Number(d.doc.total))} ₸</b></td></tr>
  </table>`;
  return wrap(`Расшифровка ${d.doc.number ?? ""}`, body);
}

export function renderActHtml(d: DocumentPrintData): string {
  const p = periodLabel(d.doc);
  const total = Number(d.doc.total);
  const vat = Number(d.doc.vat_amount);
  const vatRate = d.doc.vat_rate ? Number(d.doc.vat_rate) : 0;

  const body = `
  <p class="small" style="text-align:right">Приложение 50 к приказу Министра финансов РК от 20.12.2012 № 562<br>
  Форма Р-1 / Р-1 нысаны</p>
  <h1 style="text-align:center">АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ) № ${esc(d.doc.number) || "б/н"} от ${docDate(d.doc)}</h1>
  <h2 style="text-align:center">ОРЫНДАЛҒАН ЖҰМЫСТАР (КӨРСЕТІЛГЕН ҚЫЗМЕТТЕР) АКТІСІ № ${esc(d.doc.number) || "н/ж"}, ${docDate(d.doc)}</h2>
  <p><span class="small">Исполнитель / Орындаушы:</span> <b>${esc(d.seller?.name) || "—"}</b>${d.seller?.bin ? `, БИН / БСН ${esc(d.seller.bin)}` : ""}${d.seller?.legal_address ? `, ${esc(d.seller.legal_address)}` : ""}</p>
  <p><span class="small">Заказчик / Тапсырыс беруші:</span> <b>${esc(d.buyer?.name ?? d.doc.client_name)}</b>${d.buyer?.bin_iin ? `, БИН/ИИН (БСН/ЖСН) ${esc(d.buyer.bin_iin)}` : ""}${d.buyer?.legal_address ? `, ${esc(d.buyer.legal_address)}` : ""}</p>
  ${d.contract ? `<p class="small">Договор (контракт) / Шарт (келісімшарт): № ${esc(d.contract.number)}${d.contract.signed_at ? ` от / бастап ${fmtDate(d.contract.signed_at)}` : ""}</p>` : ""}
  <table class="grid">
    <thead>
      <tr>
        <th style="width:26px">№</th>
        <th>Наименование работ (услуг)<br><span class="small">Жұмыстардың (қызметтердің) атауы</span></th>
        <th style="width:80px">Дата выполнения<br><span class="small">Орындалған күні</span></th>
        <th style="width:50px">Ед. изм.<br><span class="small">Өлш. бірл.</span></th>
        <th style="width:60px">Кол-во<br><span class="small">Саны</span></th>
        <th style="width:100px">Цена за ед., ₸<br><span class="small">Бірлік бағасы</span></th>
        <th style="width:110px">Стоимость, ₸<br><span class="small">Құны</span></th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="ctr">1</td>
        <td>${esc(serviceName(d.doc, p))}</td>
        <td class="ctr">${fmtDate(d.doc.period_end)}</td>
        <td class="ctr">усл.</td>
        <td class="ctr">1</td>
        <td class="num">${money(total)}</td>
        <td class="num">${money(total)}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr><th colspan="6" style="text-align:right">Итого / Барлығы:</th><th class="num">${money(total)}</th></tr>
      <tr><th colspan="6" style="text-align:right">${vatRate ? `в т.ч. НДС ${vatRate}% / о.і. ҚҚС ${vatRate}%` : "Без НДС / ҚҚС-сыз"}:</th><th class="num">${money(vat)}</th></tr>
    </tfoot>
  </table>
  ${amountsWords(total)}
  <p class="small" style="margin-top:8px">Сведения об использовании запасов, полученных от заказчика / Тапсырыс берушіден алынған қорларды пайдалану туралы мәліметтер: не использовались / пайдаланылмады.</p>
  <table class="sig">
    <tr>
      <td style="width:50%">
        <b>Сдал (Исполнитель) / Тапсырды (Орындаушы)</b><br><br>
        ${esc(d.seller?.director_name) || ""} <span class="sigline"></span><br>
        <span class="small">должность, подпись / лауазымы, қолы</span><br>
        <span class="mp">М.П. / М.О.</span>
      </td>
      <td style="width:50%">
        <b>Принял (Заказчик) / Қабылдады (Тапсырыс беруші)</b><br><br>
        <span class="sigline"></span><br>
        <span class="small">должность, подпись / лауазымы, қолы</span><br>
        <span class="mp">М.П. / М.О.</span>
      </td>
    </tr>
  </table>`;
  return wrap(`АВР ${d.doc.number ?? ""}`, body);
}

export function renderForm(d: DocumentPrintData, form: PrintForm): string {
  if (form === "invoice") return renderInvoiceHtml(d);
  if (form === "breakdown") return renderBreakdownHtml(d);
  return renderActHtml(d);
}
