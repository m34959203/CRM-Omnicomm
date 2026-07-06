/**
 * Нагрузочный тест биллинга на масштабе заказчика (~10 000 ТС, голос от 04.07.2026).
 * Временная БД: 200 клиентов × 50 единиц = 10 000 активных единиц с историей
 * состояний; замер: advance_invoice по всем + act по всем + ведомость расчётов.
 * Запуск из app/: npx tsx scripts/bench-billing.ts [клиентов] [единиц_на_клиента]
 */
import { execSync } from "node:child_process";
import { Pool } from "pg";

const ADMIN_URL = "postgres://crm:crm@localhost:5445/crm_omnicomm";
const TEST_DB = "crm_omnicomm_bench";
const CLIENTS = Number(process.argv[2] ?? 200);
const UNITS = Number(process.argv[3] ?? 50);
const P = "2026-06";

async function main() {
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  process.env.DATABASE_URL = `postgres://crm:crm@localhost:5445/${TEST_DB}`;
  execSync("npx tsx db/migrate.ts", { env: process.env, stdio: "pipe" });

  const { query, db } = await import("../lib/db");
  const { generateClientDocument, settlementSheet } = await import("../lib/billing/engine");

  console.log(`Фикстура: ${CLIENTS} клиентов × ${UNITS} ед. = ${CLIENTS * UNITS} ТС…`);
  const t0 = Date.now();
  await query(`INSERT INTO vat_rates (rate, valid_from) VALUES (16,'2026-01-01')`);
  const [nom] = await query<{ id: string }>(
    `INSERT INTO nomenclature (kind, name, is_serial_tracked) VALUES ('equipment','Терминал',true) RETURNING id`
  );
  // Дефолтный тариф + части клиентов индивидуальные (реалистичное разрешение иерархии).
  await query(`INSERT INTO tariffs (level, method, amount, valid_from) VALUES ('default','activity',5000,'2026-01-01')`);

  // Массовая генерация одним SQL на клиента — цикл только по клиентам.
  for (let c = 0; c < CLIENTS; c++) {
    const scheme = c % 3 === 0 ? "advance" : "credit";
    const [client] = await query<{ id: string }>(
      `INSERT INTO clients (name, billing_scheme) VALUES ($1,$2) RETURNING id`,
      [`Клиент ${String(c + 1).padStart(3, "0")}`, scheme]
    );
    if (c % 10 === 0) {
      await query(
        `INSERT INTO tariffs (level, method, amount, client_id, valid_from) VALUES ('client','activity',4800,$1,'2026-01-01')`,
        [client.id]
      );
    }
    await query(
      `WITH objs AS (
         INSERT INTO monitoring_objects (client_id, name, kind)
         SELECT $1, 'ТС-' || $4 || '-' || g, 'vehicle' FROM generate_series(1,$2::int) g
         RETURNING id
       ), eq AS (
         INSERT INTO equipment_items (nomenclature_id, serial_number, status, client_id, object_id, billing_state)
         SELECT $3, 'SN-' || $4 || '-' || row_number() OVER (), 'installed', $1, id, 'active' FROM objs
         RETURNING id, object_id
       )
       INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, source_type)
       SELECT id, object_id, $1, 'active',
              -- четверть парка активирована среди июня (частичный месяц)
              CASE WHEN random() < 0.25 THEN '2026-06-11T00:00:00+05'::timestamptz
                   ELSE '2026-05-01T00:00:00+05'::timestamptz END,
              'import'
       FROM eq`,
      [client.id, UNITS, nom.id, c + 1]
    );
  }
  console.log(`фикстура: ${((Date.now() - t0) / 1000).toFixed(1)}с`);

  const clients = await query<{ id: string; billing_scheme: string }>(
    `SELECT id, billing_scheme FROM clients ORDER BY name`
  );

  // Аванс: счета начала месяца
  let t = Date.now();
  let advCount = 0;
  for (const c of clients) {
    if (c.billing_scheme !== "advance") continue;
    await generateClientDocument(c.id, P, "advance_invoice");
    advCount++;
  }
  const advMs = Date.now() - t;

  // Акты конца месяца — ВСЕ клиенты (основной массовый прогон)
  t = Date.now();
  for (const c of clients) await generateClientDocument(c.id, P, "act");
  const actMs = Date.now() - t;

  // Ведомость расчётов по всем
  t = Date.now();
  const sheet = await settlementSheet(query);
  const sheetMs = Date.now() - t;

  const [stats] = await query<{ docs: string; accr: string; total: string }>(
    `SELECT (SELECT count(*) FROM billing_documents) AS docs,
            (SELECT count(*) FROM accruals) AS accr,
            (SELECT sum(total) FROM billing_documents WHERE kind='act') AS total`
  );

  console.log(`\n=== РЕЗУЛЬТАТЫ (${CLIENTS * UNITS} ТС) ===`);
  console.log(`Авансовые счета: ${advCount} док. за ${(advMs / 1000).toFixed(1)}с (${(advMs / Math.max(advCount, 1)).toFixed(0)} мс/клиент)`);
  console.log(`Акты (все ${clients.length} клиентов): ${(actMs / 1000).toFixed(1)}с (${(actMs / clients.length).toFixed(0)} мс/клиент)`);
  console.log(`Ведомость расчётов (${sheet.length} строк): ${(sheetMs / 1000).toFixed(1)}с`);
  console.log(`Документов: ${stats.docs}, строк расшифровки: ${stats.accr}, актов на сумму: ${Number(stats.total).toLocaleString("ru-RU")} ₸`);

  await db.end();
  const admin2 = new Pool({ connectionString: ADMIN_URL });
  await admin2.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin2.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
