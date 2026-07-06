/**
 * Биллинговый движок (этап 2). Механика — эталон «Аскан: МТ» (docs/ascan/):
 *  - activity: посуточно из equipment_state_history; начисляются состояния
 *    active И conservation, disabled — нет; день = календарные сутки Asia/Almaty;
 *    сумма = тариф × дни / дни_в_месяце; смена тарифа среди месяца → субпериоды.
 *  - subscription: фикс за период, пропорционально дням при неполном месяце.
 *  - one_time: ручные разовые начисления (draft), подбираются в документ.
 *  - Иерархия тарифов: тарифный план (объект > клиент) приоритетнее произвольных;
 *    произвольные: object > client > category > default; do_not_charge — «нулевой».
 *  - Схемы: advance — счёт в начале месяца по состоянию на начало + акт в конце
 *    (факт − предоплата); credit — только акт в конце.
 *  - НДС: ставка из vat_rates по ДАТЕ ОБОРОТА (конец периода); тарифы vat_included.
 *  - Скидки: фикс-сумма, списывается до исчерпания, в момент формирования документа.
 */
import { tx } from "@/lib/db";
import { almatyDate, dateRange, daysInPeriod, monthBounds } from "./dates";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export type ResolvedTariff = {
  amount: number;
  method: "activity" | "subscription" | "one_time";
  tariffId?: string;
  tariffPlanItemId?: string;
  doNotCharge: boolean;
};

type TariffRow = {
  id: string;
  level: "default" | "category" | "client" | "object";
  method: string;
  amount: string;
  do_not_charge: boolean;
  valid_from: string;
  valid_to: string | null;
  client_id: string | null;
  object_id: string | null;
  category_id: string | null;
};

type PlanItemRow = { id: string; plan_id: string; method: string; amount: string };

/** Контекст тарифов клиента на период — грузится одним махом, резолвится в памяти. */
export async function loadTariffContext(q: Q, clientId: string) {
  const [client] = await q<{
    id: string;
    category_id: string | null;
    tariff_plan_id: string | null;
    billing_scheme: "advance" | "credit";
  }>(
    `SELECT id, category_id, tariff_plan_id, billing_scheme FROM clients WHERE id = $1`,
    [clientId]
  );
  if (!client) throw new Error(`client ${clientId} not found`);

  const objects = await q<{ id: string; tariff_plan_id: string | null; name: string }>(
    `SELECT id, tariff_plan_id, name FROM monitoring_objects WHERE client_id = $1`,
    [clientId]
  );

  const planIds = [
    client.tariff_plan_id,
    ...objects.map((o) => o.tariff_plan_id),
  ].filter(Boolean) as string[];
  const planItems = planIds.length
    ? await q<PlanItemRow>(
        `SELECT id, plan_id, method, amount FROM tariff_plan_items WHERE plan_id = ANY($1::uuid[])`,
        [planIds]
      )
    : [];

  const tariffs = await q<TariffRow>(
    `SELECT id, level, method, amount, do_not_charge, valid_from::text, valid_to::text,
            client_id, object_id, category_id
     FROM tariffs
     WHERE is_active
       AND (level = 'default'
         OR (level = 'category' AND category_id = $2)
         OR (level = 'client'   AND client_id = $1)
         OR (level = 'object'   AND object_id = ANY($3::uuid[])))`,
    [clientId, client.category_id, objects.map((o) => o.id)]
  );

  return { client, objects, planItems, tariffs };
}

type TariffContext = Awaited<ReturnType<typeof loadTariffContext>>;

/** Разрешение тарифа для объекта на конкретную дату (YYYY-MM-DD). */
export function resolveTariff(
  ctx: TariffContext,
  objectId: string | null,
  method: "activity" | "subscription",
  date: string
): ResolvedTariff | null {
  const object = objectId ? ctx.objects.find((o) => o.id === objectId) : null;

  // 1. Тарифный план: объектный приоритетнее клиентского.
  const planId = object?.tariff_plan_id ?? ctx.client.tariff_plan_id;
  if (planId) {
    const item = ctx.planItems.find((i) => i.plan_id === planId && i.method === method);
    if (item) {
      return {
        amount: Number(item.amount),
        method,
        tariffPlanItemId: item.id,
        doNotCharge: false,
      };
    }
  }

  // 2. Произвольные тарифы: object > client > category > default, активные на дату.
  const applicable = ctx.tariffs.filter(
    (t) =>
      t.method === method &&
      t.valid_from <= date &&
      (t.valid_to === null || t.valid_to >= date) &&
      (t.level === "default" ||
        (t.level === "category") ||
        (t.level === "client") ||
        (t.level === "object" && t.object_id === objectId))
  );
  for (const level of ["object", "client", "category", "default"] as const) {
    const t = applicable.find((x) => x.level === level);
    if (t) {
      if (t.do_not_charge) return { amount: 0, method, tariffId: t.id, doNotCharge: true };
      return { amount: Number(t.amount), method, tariffId: t.id, doNotCharge: false };
    }
  }
  return null;
}

export type AccrualDraft = {
  object_id: string | null;
  equipment_id: string | null;
  tariff_id: string | null;
  tariff_plan_item_id: string | null;
  method: "activity" | "subscription" | "one_time";
  date_from: string;
  date_to: string;
  days: number | null;
  amount: number;
  note: string | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Посуточный факт по активному оборудованию за период.
 * Для каждой единицы: множество дат Алматы, в которые действовал billable-интервал
 * (active|conservation), сгруппированное по разрешённому на дату тарифу → субпериоды.
 */
export async function computeActivityAccruals(
  q: Q,
  ctx: TariffContext,
  periodStart: string,
  periodEnd: string
): Promise<AccrualDraft[]> {
  const rows = await q<{
    equipment_id: string;
    object_id: string | null;
    state: string;
    valid_from: string;
    valid_to: string | null;
  }>(
    `SELECT equipment_id, object_id, state, valid_from::text, valid_to::text
     FROM equipment_state_history
     WHERE client_id = $1
       AND state IN ('active','conservation')
       AND valid_from < ($3::date + 1)::timestamptz
       AND (valid_to IS NULL OR valid_to >= $2::date::timestamptz)`,
    [ctx.client.id, periodStart, periodEnd]
  );

  const totalDays = daysInPeriod(periodStart, periodEnd);
  const allDates = dateRange(periodStart, periodEnd);
  const out: AccrualDraft[] = [];

  // Дни по единице оборудования (дубли интервалов схлопываются множеством дат).
  const byEquipment = new Map<string, { object_id: string | null; dates: Set<string> }>();
  for (const r of rows) {
    const entry =
      byEquipment.get(r.equipment_id) ??
      { object_id: r.object_id, dates: new Set<string>() };
    const from = almatyDate(new Date(r.valid_from));
    const to = r.valid_to ? almatyDate(new Date(r.valid_to)) : periodEnd;
    for (const d of allDates) {
      if (d >= from && d <= to) entry.dates.add(d);
    }
    if (r.object_id) entry.object_id = r.object_id;
    byEquipment.set(r.equipment_id, entry);
  }

  for (const [equipmentId, { object_id, dates }] of byEquipment) {
    if (dates.size === 0) continue;
    // Субпериоды: непрерывные куски дат с одинаковым разрешённым тарифом.
    const sorted = [...dates].sort();
    let segStart: string | null = null;
    let prevDate: string | null = null;
    let prevKey: string | null = null;
    let prevTariff: ResolvedTariff | null = null;
    let segDays = 0;

    const flush = () => {
      if (!segStart || !prevDate || !prevTariff) return;
      if (!prevTariff.doNotCharge && prevTariff.amount > 0) {
        out.push({
          object_id,
          equipment_id: equipmentId,
          tariff_id: prevTariff.tariffId ?? null,
          tariff_plan_item_id: prevTariff.tariffPlanItemId ?? null,
          method: "activity",
          date_from: segStart,
          date_to: prevDate,
          days: segDays,
          amount: round2((prevTariff.amount * segDays) / totalDays),
          note: null,
        });
      }
    };

    for (const d of sorted) {
      const tariff = resolveTariff(ctx, object_id, "activity", d);
      const key = tariff
        ? `${tariff.tariffId ?? ""}|${tariff.tariffPlanItemId ?? ""}|${tariff.amount}|${tariff.doNotCharge}`
        : "none";
      const contiguous =
        prevDate !== null &&
        new Date(`${d}T00:00:00Z`).getTime() - new Date(`${prevDate}T00:00:00Z`).getTime() ===
          86400000;
      if (key !== prevKey || !contiguous) {
        flush();
        segStart = d;
        segDays = 0;
      }
      if (tariff === null) {
        segStart = null;
        prevTariff = null;
        prevKey = "none";
        prevDate = d;
        continue;
      }
      segDays++;
      prevDate = d;
      prevKey = key;
      prevTariff = tariff;
    }
    flush();
  }
  return out;
}

/** Подписки: фикс за месяц, пропорционально дням действия тарифа внутри периода. */
export async function computeSubscriptionAccruals(
  q: Q,
  ctx: TariffContext,
  periodStart: string,
  periodEnd: string
): Promise<AccrualDraft[]> {
  const totalDays = daysInPeriod(periodStart, periodEnd);
  const out: AccrualDraft[] = [];
  const targets: (string | null)[] = [null, ...ctx.objects.map((o) => o.id)];

  for (const objectId of targets) {
    // Дни, в которые на цель действует подписочный тариф (учёт valid_from/to внутри месяца).
    let days = 0;
    let first: string | null = null;
    let last: string | null = null;
    let current: ResolvedTariff | null = null;
    for (const d of dateRange(periodStart, periodEnd)) {
      const t = resolveTariff(ctx, objectId, "subscription", d);
      // Подписка уровня клиента резолвится и для objectId=null, и для каждого объекта —
      // объектные цели начисляем только по объектному уровню/плану, чтобы не задвоить.
      const isOwn =
        t &&
        (objectId === null
          ? !t.tariffPlanItemId || !ctx.objects.some((o) => o.tariff_plan_id)
          : t.tariffId
            ? ctx.tariffs.find((x) => x.id === t.tariffId)?.level === "object"
            : ctx.objects.find((o) => o.id === objectId)?.tariff_plan_id != null);
      if (t && isOwn && !t.doNotCharge && t.amount > 0) {
        days++;
        first = first ?? d;
        last = d;
        current = t;
      }
    }
    if (days > 0 && current && first && last) {
      out.push({
        object_id: objectId,
        equipment_id: null,
        tariff_id: current.tariffId ?? null,
        tariff_plan_item_id: current.tariffPlanItemId ?? null,
        method: "subscription",
        date_from: first,
        date_to: last,
        days,
        amount: round2((current.amount * days) / totalDays),
        note: null,
      });
    }
  }
  return out;
}

export type BillingRunResult = {
  clientId: string;
  documentId: string | null;
  kind: string;
  subtotal: number;
  discount: number;
  prepaid: number;
  vat: number;
  total: number;
  accruals: number;
  skipped?: string;
};

/** Ставка НДС по дате оборота. */
export async function vatRateFor(q: Q, date: string): Promise<number> {
  const [row] = await q<{ rate: string }>(
    `SELECT rate FROM vat_rates WHERE valid_from <= $1::date ORDER BY valid_from DESC LIMIT 1`,
    [date]
  );
  return row ? Number(row.rate) : 0;
}

/**
 * Сформировать расчётный документ клиента за месяц (period 'YYYY-MM').
 * kind='advance_invoice' — прогноз на месяц по состоянию на начало (advance-схема);
 * kind='act' — факт за месяц (обе схемы; в advance вычитается предоплата счёта).
 * Идемпотентно: документ того же kind за период не дублируется.
 */
export async function generateClientDocument(
  clientId: string,
  period: string,
  kind: "advance_invoice" | "act",
  userId?: string
): Promise<BillingRunResult> {
  const { start, end } = monthBounds(period);
  return tx(async (q) => {
    const ctx = await loadTariffContext(q, clientId);
    if (kind === "advance_invoice" && ctx.client.billing_scheme !== "advance") {
      return { clientId, documentId: null, kind, subtotal: 0, discount: 0, prepaid: 0, vat: 0, total: 0, accruals: 0, skipped: "credit-схема: авансовый счёт не формируется" };
    }

    const [existing] = await q<{ id: string }>(
      `SELECT id FROM billing_documents
       WHERE client_id = $1 AND kind = $2 AND period_start = $3::date AND status <> 'cancelled'`,
      [clientId, kind, start]
    );
    if (existing) {
      return { clientId, documentId: existing.id, kind, subtotal: 0, discount: 0, prepaid: 0, vat: 0, total: 0, accruals: 0, skipped: "документ за период уже существует" };
    }

    let drafts: AccrualDraft[];
    if (kind === "advance_invoice") {
      // Прогноз: billable-оборудование по состоянию на начало периода × полный месяц.
      const activeAtStart = await q<{ equipment_id: string; object_id: string | null }>(
        `SELECT equipment_id, object_id FROM equipment_state_history
         WHERE client_id = $1 AND state IN ('active','conservation')
           AND valid_from <= $2::date::timestamptz
           AND (valid_to IS NULL OR valid_to > $2::date::timestamptz)`,
        [clientId, start]
      );
      const totalDays = daysInPeriod(start, end);
      drafts = [];
      for (const r of activeAtStart) {
        const t = resolveTariff(ctx, r.object_id, "activity", start);
        if (t && !t.doNotCharge && t.amount > 0) {
          drafts.push({
            object_id: r.object_id,
            equipment_id: r.equipment_id,
            tariff_id: t.tariffId ?? null,
            tariff_plan_item_id: t.tariffPlanItemId ?? null,
            method: "activity",
            date_from: start,
            date_to: end,
            days: totalDays,
            amount: round2(t.amount),
            note: "аванс: прогноз по состоянию на начало периода",
          });
        }
      }
      drafts.push(...(await computeSubscriptionAccruals(q, ctx, start, end)));
    } else {
      drafts = [
        ...(await computeActivityAccruals(q, ctx, start, end)),
        ...(await computeSubscriptionAccruals(q, ctx, start, end)),
      ];
    }

    // Разовые ручные начисления (draft, не привязаны к документу, попадают в акт/счёт).
    const oneTime = await q<{ id: string; amount: string }>(
      `SELECT id, amount FROM accruals
       WHERE client_id = $1 AND method = 'one_time' AND status = 'draft'
         AND billing_document_id IS NULL AND date_from BETWEEN $2::date AND $3::date`,
      [clientId, start, end]
    );

    const subtotal = round2(
      drafts.reduce((s, d) => s + d.amount, 0) + oneTime.reduce((s, o) => s + Number(o.amount), 0)
    );

    // Предоплата: в акте advance-схемы вычитаем сумму авансового счёта периода.
    let prepaid = 0;
    if (kind === "act" && ctx.client.billing_scheme === "advance") {
      const [adv] = await q<{ total: string }>(
        `SELECT total FROM billing_documents
         WHERE client_id = $1 AND kind = 'advance_invoice'
           AND period_start = $2::date AND status <> 'cancelled'`,
        [clientId, start]
      );
      prepaid = adv ? Number(adv.total) : 0;
    }

    // Скидки фикс-суммой до исчерпания (только на положительный остаток).
    let discount = 0;
    const discounts = await q<{ id: string; total_amount: string; used_amount: string }>(
      `SELECT id, total_amount, used_amount FROM discounts
       WHERE client_id = $1 AND is_active AND valid_from <= $2::date
         AND used_amount < total_amount
       ORDER BY valid_from FOR UPDATE`,
      [clientId, end]
    );
    let discountable = Math.max(0, subtotal - prepaid);
    const discountUses: { id: string; amount: number }[] = [];
    for (const d of discounts) {
      if (discountable <= 0) break;
      const remaining = Number(d.total_amount) - Number(d.used_amount);
      const use = round2(Math.min(remaining, discountable));
      if (use > 0) {
        discountUses.push({ id: d.id, amount: use });
        discount = round2(discount + use);
        discountable = round2(discountable - use);
      }
    }

    const total = round2(Math.max(0, subtotal - discount - prepaid));
    const rate = await vatRateFor(q, end);
    const vat = round2((total * rate) / (100 + rate)); // тарифы с НДС внутри

    if (subtotal === 0 && total === 0) {
      return { clientId, documentId: null, kind, subtotal, discount, prepaid, vat, total, accruals: 0, skipped: "нет начислений за период" };
    }

    const [doc] = await q<{ id: string }>(
      `INSERT INTO billing_documents
         (number, kind, scheme, client_id, counterparty_id, period_start, period_end,
          subtotal, discount_amount, prepaid_amount, vat_rate, vat_amount, total,
          status, manager_id)
       SELECT
         CASE WHEN $2 = 'advance_invoice' THEN 'СЧ-' ELSE 'АВР-' END ||
           lpad(nextval('seq_billing_doc_number')::text, 6, '0'),
         $2, $3, $1,
         (SELECT id FROM counterparties WHERE client_id = $1 ORDER BY created_at LIMIT 1),
         $4::date, $5::date, $6, $7, $8, $9, $10, $11, 'prepared', $12
       RETURNING id`,
      [clientId, kind, ctx.client.billing_scheme, start, end,
       subtotal, discount, prepaid, rate, vat, total, userId ?? null]
    );

    for (const d of drafts) {
      await q(
        `INSERT INTO accruals (billing_document_id, client_id, object_id, equipment_id,
           tariff_id, tariff_plan_item_id, method, date_from, date_to, days, amount, status, note)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::date,$9::date,$10,$11,'billed',$12)`,
        [doc.id, clientId, d.object_id, d.equipment_id, d.tariff_id, d.tariff_plan_item_id,
         d.method, d.date_from, d.date_to, d.days, d.amount, d.note]
      );
    }
    if (oneTime.length) {
      await q(
        `UPDATE accruals SET billing_document_id = $1, status = 'billed' WHERE id = ANY($2::uuid[])`,
        [doc.id, oneTime.map((o) => o.id)]
      );
    }
    for (const u of discountUses) {
      await q(
        `INSERT INTO discount_applications (discount_id, billing_document_id, amount) VALUES ($1,$2,$3)`,
        [u.id, doc.id, u.amount]
      );
      await q(`UPDATE discounts SET used_amount = used_amount + $2 WHERE id = $1`, [u.id, u.amount]);
    }

    return {
      clientId, documentId: doc.id, kind, subtotal, discount, prepaid, vat, total,
      accruals: drafts.length + oneTime.length,
    };
  });
}

/** Ведомость расчётов: долг/аванс по клиентам = документы − оплаты. Вход автоблокировки. */
export async function settlementSheet(q: Q): Promise<
  { client_id: string; client_name: string; billed: number; paid: number; debt: number; oldest_unpaid_due: string | null }[]
> {
  const rows = await q<{
    client_id: string; client_name: string; billed: string; paid: string; oldest_unpaid_due: string | null;
  }>(
    `WITH docs AS (
       SELECT client_id, sum(total) AS billed,
              min(CASE WHEN paid_amount < total THEN period_end END)::text AS oldest_unpaid_due
       FROM billing_documents WHERE status NOT IN ('cancelled') GROUP BY client_id
     ), pays AS (
       SELECT client_id, sum(amount) AS paid FROM payments GROUP BY client_id
     )
     SELECT c.id AS client_id, c.name AS client_name,
            COALESCE(d.billed,0)::text AS billed, COALESCE(p.paid,0)::text AS paid,
            d.oldest_unpaid_due
     FROM clients c
     LEFT JOIN docs d ON d.client_id = c.id
     LEFT JOIN pays p ON p.client_id = c.id
     WHERE c.is_active
     ORDER BY c.name`
  );
  return rows.map((r) => ({
    client_id: r.client_id,
    client_name: r.client_name,
    billed: Number(r.billed),
    paid: Number(r.paid),
    debt: round2(Number(r.billed) - Number(r.paid)),
    oldest_unpaid_due: r.oldest_unpaid_due,
  }));
}
