/**
 * Табличные тест-кейсы биллингового движка (формулы — эталон Аскан, docs/ascan/).
 * Гоняется на временной БД crm_omnicomm_billing_test; основная БД не затрагивается.
 * Запуск: из app/: DATABASE_URL_TEST_HOST=... npx tsx scripts/test-billing.ts
 */
import { execSync } from "node:child_process";
import { Pool } from "pg";

const ADMIN_URL = "postgres://crm:crm@localhost:5445/crm_omnicomm";
const TEST_DB = "crm_omnicomm_billing_test";
const TEST_URL = `postgres://crm:crm@localhost:5445/${TEST_DB}`;

// Июнь 2026: 30 дней, НДС 16% (НК-2026).
const P = "2026-06";

let passed = 0;
let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) passed++;
  else {
    failed++;
    console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function main() {
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  process.env.DATABASE_URL = TEST_URL;
  execSync("npx tsx db/migrate.ts", { env: process.env, stdio: "pipe" });

  // Импортируем ПОСЛЕ установки DATABASE_URL (пул создаётся при импорте lib/db).
  const { query, db } = await import("../lib/db");
  const { generateClientDocument, settlementSheet } = await import("../lib/billing/engine");

  // ---------- Фикстура ----------
  await query(`INSERT INTO vat_rates (rate, valid_from) VALUES (12,'2009-01-01'),(16,'2026-01-01')`);
  const nom = (await query<{ id: string }>(
    `INSERT INTO nomenclature (kind, name, is_serial_tracked) VALUES ('equipment','Терминал',true) RETURNING id`
  ))[0].id;

  async function makeClient(name: string, scheme: string) {
    return (await query<{ id: string }>(
      `INSERT INTO clients (name, billing_scheme) VALUES ($1,$2) RETURNING id`,
      [name, scheme]
    ))[0].id;
  }
  async function makeObject(clientId: string, name: string) {
    return (await query<{ id: string }>(
      `INSERT INTO monitoring_objects (client_id, name, kind) VALUES ($1,$2,'vehicle') RETURNING id`,
      [clientId, name]
    ))[0].id;
  }
  let serial = 0;
  async function makeEquipment(clientId: string, objectId: string, state: string, from: string, to?: string) {
    const eq = (await query<{ id: string }>(
      `INSERT INTO equipment_items (nomenclature_id, serial_number, status) VALUES ($1,$2,'installed') RETURNING id`,
      [nom, `SN-${++serial}`]
    ))[0].id;
    await query(
      `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, valid_to, source_type)
       VALUES ($1,$2,$3,$4,$5::timestamptz,$6::timestamptz,'manual')`,
      [eq, objectId, clientId, state, from, to ?? null]
    );
    return eq;
  }
  const tariff = (level: string, method: string, amount: number, ids: { client?: string; object?: string }, validFrom = "2026-01-01", extra: Record<string, unknown> = {}) =>
    query(
      `INSERT INTO tariffs (level, method, amount, client_id, object_id, valid_from, do_not_charge)
       VALUES ($1,$2,$3,$4::uuid,$5::uuid,$6::date,$7)`,
      [level, method, amount, ids.client ?? null, ids.object ?? null, validFrom, extra.do_not_charge ?? false]
    );

  // ---------- Кейс 1: полный месяц, клиентский тариф 5000 ----------
  const c1 = await makeClient("К1 полный месяц", "credit");
  const o1 = await makeObject(c1, "ТС-1");
  await makeEquipment(c1, o1, "active", "2026-05-01T00:00:00+05:00");
  await tariff("client", "activity", 5000, { client: c1 });
  const r1 = await generateClientDocument(c1, P, "act");
  check("1. полный месяц subtotal", r1.subtotal, 5000);
  check("1. полный месяц total", r1.total, 5000);
  check("1. НДС 16% в сумме", r1.vat, Math.round((5000 * 16) / 116 * 100) / 100);
  const a1 = await query<{ days: number }>(`SELECT days FROM accruals WHERE client_id = $1`, [c1]);
  check("1. дней 30/30", a1[0].days, 30);

  // ---------- Кейс 2: активация 16-го → 15/30 дней ----------
  const c2 = await makeClient("К2 середина", "credit");
  const o2 = await makeObject(c2, "ТС-2");
  await makeEquipment(c2, o2, "active", "2026-06-16T00:00:00+05:00");
  await tariff("client", "activity", 5000, { client: c2 });
  const r2 = await generateClientDocument(c2, P, "act");
  check("2. активация 16-го", r2.subtotal, 2500);

  // ---------- Кейс 3: смена тарифа среди месяца → субпериоды ----------
  const c3 = await makeClient("К3 смена тарифа", "credit");
  const o3 = await makeObject(c3, "ТС-3");
  await makeEquipment(c3, o3, "active", "2026-05-01T00:00:00+05:00");
  await tariff("client", "activity", 3000, { client: c3 });
  await tariff("object", "activity", 6000, { object: o3 }, "2026-06-16");
  const r3 = await generateClientDocument(c3, P, "act");
  // 15 дней × 3000/30 + 15 дней × 6000/30 = 1500 + 3000
  check("3. субпериоды", r3.subtotal, 4500);
  const a3 = await query<{ amount: string }>(
    `SELECT amount FROM accruals WHERE client_id = $1 ORDER BY date_from`, [c3]
  );
  check("3. две строки расшифровки", a3.length, 2);

  // ---------- Кейс 4: do_not_charge на объекте ----------
  const c4 = await makeClient("К4 не начислять", "credit");
  const o4 = await makeObject(c4, "ТС-4");
  await makeEquipment(c4, o4, "active", "2026-05-01T00:00:00+05:00");
  await tariff("client", "activity", 5000, { client: c4 });
  await tariff("object", "activity", 0, { object: o4 }, "2026-01-01", { do_not_charge: true });
  const r4 = await generateClientDocument(c4, P, "act");
  check("4. do_not_charge", r4.skipped, "нет начислений за период");

  // ---------- Кейс 5: консервация начисляется, disabled — нет ----------
  const c5 = await makeClient("К5 консервация", "credit");
  const o5a = await makeObject(c5, "ТС-5к");
  const o5b = await makeObject(c5, "ТС-5о");
  await makeEquipment(c5, o5a, "conservation", "2026-05-01T00:00:00+05:00");
  await makeEquipment(c5, o5b, "disabled", "2026-05-01T00:00:00+05:00");
  await tariff("client", "activity", 4000, { client: c5 });
  const r5 = await generateClientDocument(c5, P, "act");
  check("5. консервация да / отключен нет", r5.subtotal, 4000);

  // ---------- Кейс 6: подписка клиента, с 16-го ----------
  const c6 = await makeClient("К6 подписка", "credit");
  await tariff("client", "subscription", 10000, { client: c6 }, "2026-06-16");
  const r6 = await generateClientDocument(c6, P, "act");
  check("6. подписка 15/30", r6.subtotal, 5000);

  // ---------- Кейс 7: advance-схема — счёт + акт с prepaid ----------
  const c7 = await makeClient("К7 аванс", "advance");
  const o7 = await makeObject(c7, "ТС-7");
  await makeEquipment(c7, o7, "active", "2026-05-01T00:00:00+05:00");
  await tariff("client", "activity", 6000, { client: c7 });
  const r7inv = await generateClientDocument(c7, P, "advance_invoice");
  check("7. авансовый счёт", r7inv.total, 6000);
  // Доначисление: второй объект активирован 16-го (в счёте его не было).
  const o7b = await makeObject(c7, "ТС-7б");
  await makeEquipment(c7, o7b, "active", "2026-06-16T00:00:00+05:00");
  const r7act = await generateClientDocument(c7, P, "act");
  check("7. акт: факт", r7act.subtotal, 9000);
  check("7. акт: prepaid вычтен", r7act.prepaid, 6000);
  check("7. акт: к доплате", r7act.total, 3000);

  // ---------- Кейс 8: скидка суммой до исчерпания ----------
  const c8 = await makeClient("К8 скидка", "credit");
  const o8 = await makeObject(c8, "ТС-8");
  await makeEquipment(c8, o8, "active", "2026-05-01T00:00:00+05:00");
  await tariff("client", "activity", 5000, { client: c8 });
  await query(
    `INSERT INTO discounts (client_id, name, total_amount, valid_from) VALUES ($1,'Скидка',7000,'2026-01-01')`,
    [c8]
  );
  const r8 = await generateClientDocument(c8, P, "act");
  check("8. скидка списана", r8.discount, 5000);
  check("8. к оплате 0", r8.total, 0);
  const [d8] = await query<{ used_amount: string }>(`SELECT used_amount FROM discounts WHERE client_id=$1`, [c8]);
  check("8. used_amount", Number(d8.used_amount), 5000);
  // Июль: остаток скидки 2000
  const r8b = await generateClientDocument(c8, "2026-07", "act");
  check("8. июль: остаток скидки", r8b.discount, 2000);
  check("8. июль: к оплате", r8b.total, 3000);

  // ---------- Кейс 9: идемпотентность ----------
  const r9 = await generateClientDocument(c1, P, "act");
  check("9. повторный прогон", r9.skipped, "документ за период уже существует");

  // ---------- Кейс 10: тарифный план приоритетнее произвольного ----------
  const c10 = await makeClient("К10 план", "credit");
  const o10 = await makeObject(c10, "ТС-10");
  await makeEquipment(c10, o10, "active", "2026-05-01T00:00:00+05:00");
  await tariff("client", "activity", 9999, { client: c10 });
  const plan = (await query<{ id: string }>(
    `INSERT INTO tariff_plans (name) VALUES ('План') RETURNING id`
  ))[0].id;
  await query(`INSERT INTO tariff_plan_items (plan_id, method, amount) VALUES ($1,'activity',7000)`, [plan]);
  await query(`UPDATE clients SET tariff_plan_id = $1 WHERE id = $2`, [plan, c10]);
  const r10 = await generateClientDocument(c10, P, "act");
  check("10. план приоритетнее", r10.subtotal, 7000);

  // ---------- Кейс 11: ведомость расчётов ----------
  await query(`INSERT INTO payments (client_id, amount, method) VALUES ($1, 2000, 'bank')`, [c1]);
  const sheet = await settlementSheet(query);
  const row1 = sheet.find((s) => s.client_id === c1)!;
  check("11. ведомость: долг", row1.debt, 3000);

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();

  const admin2 = new Pool({ connectionString: ADMIN_URL });
  await admin2.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin2.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
