/** Тесты обратной синхронизации оплат из 1С (временная БД). Запуск из app/. */
import { execSync } from "node:child_process";
import { Pool } from "pg";
import ExcelJS from "exceljs";

const ADMIN_URL = "postgres://crm:crm@localhost:5445/crm_omnicomm";
const TEST_DB = "crm_omnicomm_pay_import_test";

let passed = 0, failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed++;
  else { failed++; console.error(`FAIL ${name}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

async function main() {
  const admin = new Pool({ connectionString: ADMIN_URL });
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();
  process.env.DATABASE_URL = `postgres://crm:crm@localhost:5445/${TEST_DB}`;
  execSync("npx tsx db/migrate.ts", { env: process.env, stdio: "pipe" });

  const { query, db } = await import("../lib/db");
  const { parseXlsx, parseClientBank, matchRecords, commitPayments } =
    await import("../lib/billing/payments-import");
  const { fetchPaymentsFromOData } = await import("../lib/billing/odata-1c");

  // Фикстура: клиент с БИН + выставленный счёт СЧ-000042 на 40000.
  const client = (await query<{ id: string }>(
    `INSERT INTO clients (name) VALUES ('ТОО Плательщик') RETURNING id`
  ))[0].id;
  await query(
    `INSERT INTO counterparties (client_id, name, bin_iin) VALUES ($1, 'ТОО Плательщик', '111222333444')`,
    [client]
  );
  const doc = (await query<{ id: string }>(
    `INSERT INTO billing_documents (number, kind, scheme, client_id, subtotal, total, status)
     VALUES ('СЧ-000042', 'advance_invoice', 'advance', $1, 40000, 40000, 'issued') RETURNING id`,
    [client]
  ))[0].id;

  // ---------- 1. xlsx: шапка отчёта + заголовки не с первой строки ----------
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Поступления");
  ws.addRow(["Поступления на расчётный счёт за период"]);
  ws.addRow([]);
  ws.addRow(["Дата", "Номер", "Контрагент", "БИН", "Сумма", "Назначение платежа"]);
  ws.addRow(["05.07.2026", "125", "ТОО Плательщик", "111222333444", "25 000,00", "Оплата по счёту СЧ-000042 за мониторинг"]);
  ws.addRow(["05.07.2026", "126", "ТОО Неизвестный", "999888777666", "5000", "Оплата услуг"]);
  const buf = await wb.xlsx.writeBuffer();
  const recs1 = await parseXlsx(buf as ArrayBuffer);
  check("1. xlsx: распарсено", recs1.length, 2);
  check("1. xlsx: дата DD.MM.YYYY → ISO", recs1[0].date, "2026-07-05");
  check("1. xlsx: сумма с пробелом и запятой", recs1[0].amount, 25000);

  const rep1 = await matchRecords(recs1);
  check("1. матчинг: клиент по БИН", rep1.records[0].client_name, "ТОО Плательщик");
  check("1. матчинг: документ из назначения", rep1.records[0].document_number, "СЧ-000042");
  check("1. матчинг: неизвестный БИН помечен", rep1.records[1].problem?.includes("не найден"), true);

  const res1 = await commitPayments(rep1, null, "тест xlsx");
  check("1. проведение: 1 создана, 1 пропущена", [res1.created, res1.skipped], [1, 1]);
  const [d1] = await query<{ paid_amount: string; status: string }>(
    `SELECT paid_amount, status FROM billing_documents WHERE id = $1`, [doc]);
  check("1. документ: частичная оплата", [Number(d1.paid_amount), d1.status], [25000, "partial"]);

  // ---------- 2. Идемпотентность: тот же файл повторно ----------
  const rep2 = await matchRecords(recs1);
  check("2. дубль помечен", rep2.records[0].duplicate, true);
  const res2 = await commitPayments(rep2, null, "тест xlsx повтор");
  check("2. повтор: 0 создано", res2.created, 0);

  // ---------- 3. Клиент-банк (1CClientBankExchange, cp1251-семантика) ----------
  const kl = `1CClientBankExchange
ВерсияФормата=1.02
СекцияДокумент=Платежное поручение
Номер=127
Дата=06.07.2026
ДатаПоступило=06.07.2026
Сумма=15000.00
ПлательщикБИН=111222333444
Плательщик1=ТОО Плательщик
НазначениеПлатежа=Доплата по счёту СЧ-000042
КонецДокумента
`;
  const recs3 = parseClientBank(kl);
  check("3. клиент-банк: распарсено", recs3.length, 1);
  check("3. клиент-банк: дата", recs3[0].date, "2026-07-06");
  const rep3 = await matchRecords(recs3);
  const res3 = await commitPayments(rep3, null, "тест клиент-банк");
  check("3. проведение", res3.created, 1);
  const [d3] = await query<{ paid_amount: string; status: string }>(
    `SELECT paid_amount, status FROM billing_documents WHERE id = $1`, [doc]);
  check("3. документ полностью оплачен", [Number(d3.paid_amount), d3.status], [40000, "paid"]);

  // ---------- 4. OData-мок (формат стандартного интерфейса 1С) ----------
  const odataPayload = {
    value: [
      {
        Date: "2026-07-06T10:00:00",
        Number: "128",
        СуммаДокумента: 7000,
        НазначениеПлатежа: "Аванс за июль",
        Контрагент: { Description: "ТОО Плательщик", БИН: "111222333444" },
      },
      { Date: "2026-07-06T11:00:00", Number: "129", СуммаДокумента: 0 },
    ],
  };
  let odataUrl = "";
  const recs4 = await fetchPaymentsFromOData({
    baseUrl: "http://mock-1c/odata/standard.odata",
    fetchImpl: async (url) => {
      odataUrl = url;
      return new Response(JSON.stringify(odataPayload), {
        status: 200, headers: { "Content-Type": "application/json" },
      });
    },
  });
  check("4. OData: url с фильтром Posted", odataUrl.includes("Posted"), true);
  check("4. OData: нулевые суммы отсечены", recs4.length, 1);
  check("4. OData: БИН из $expand", recs4[0].bin, "111222333444");
  const rep4 = await matchRecords(recs4);
  const res4 = await commitPayments(rep4, null, "тест OData");
  check("4. проведение (без документа — на клиента)", res4.created, 1);
  const [bal] = await query<{ paid: string }>(
    `SELECT sum(amount)::text AS paid FROM payments WHERE client_id = $1`, [client]);
  check("4. суммарно оплат по клиенту", Number(bal.paid), 47000);

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();
  const admin2 = new Pool({ connectionString: ADMIN_URL });
  await admin2.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin2.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
