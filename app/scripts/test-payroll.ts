/** Табличные тесты расчёта ведомости (временная БД). Запуск из app/: npx tsx scripts/test-payroll.ts */
import { execSync } from "node:child_process";
import { Pool } from "pg";

const ADMIN_URL = "postgres://crm:crm@localhost:5445/crm_omnicomm";
const TEST_DB = "crm_omnicomm_payroll_test";

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
  const { buildPayrollSheet, cancelPayrollSheet } = await import("../lib/payroll/calc");

  const one = async (sql: string, params?: unknown[]) => (await query<{ id: string }>(sql, params))[0].id;
  const roleId = await one(`INSERT INTO roles (code, name) VALUES ('installer','Техник') RETURNING id`);
  const mkUser = (email: string, name: string) =>
    one(`INSERT INTO users (full_name, email, role_id, password_hash) VALUES ($1,$2,$3,'x') RETURNING id`, [name, email, roleId]);
  const admin1 = await mkUser("a@a.kz", "Админ");
  const tPiece = await mkUser("p@a.kz", "Сдельщик");
  const tNorm = await mkUser("n@a.kz", "Нормовик");
  const tUnder = await mkUser("u@a.kz", "Недобор");

  // Работы: сдельщик 3×5000; нормовик 5 работ по 4000 при норме 3 (оклад 100к, сделка сверх);
  // недобор 2 работы по 4000 при той же норме.
  const work = (u: string, amount: number, day: string) =>
    query(`INSERT INTO payroll_entries (user_id, kind, amount, entry_date) VALUES ($1,'work',$2,$3::date)`, [u, amount, day]);
  for (const d of ["2026-06-05", "2026-06-10", "2026-06-15"]) await work(tPiece, 5000, d);
  for (const d of ["2026-06-02", "2026-06-06", "2026-06-11", "2026-06-18", "2026-06-25"]) await work(tNorm, 4000, d);
  for (const d of ["2026-06-07", "2026-06-09"]) await work(tUnder, 4000, d);
  // Компенсация и удержание сдельщику.
  await query(`INSERT INTO payroll_entries (user_id, kind, amount, reason, entry_date) VALUES ($1,'compensation',3000,'ГСМ','2026-06-20')`, [tPiece]);
  await query(`INSERT INTO payroll_entries (user_id, kind, amount, reason, entry_date) VALUES ($1,'deduction',1000,'штраф','2026-06-21')`, [tPiece]);
  // Правило «оклад за норму»: категория «Штатный», норма 3, оклад 100000, сделка сверх.
  const cat = await one(`INSERT INTO performer_categories (name) VALUES ('Штатный') RETURNING id`);
  await query(`INSERT INTO performer_category_assignments (user_id, category_id) VALUES ($1,$2),($3,$2)`, [tNorm, cat, tUnder]);
  await query(
    `INSERT INTO payroll_rules (name, scope, category_id, salary, norm_count, piece_over_norm)
     VALUES ('Штатные: оклад за 3 + сделка','category',$1,100000,3,true)`, [cat]);

  const r = await buildPayrollSheet("2026-06-01", "2026-06-30", admin1);
  check("строк в ведомости", r.lines.length, 3);

  const piece = r.lines.find((l) => l.user_id === tPiece)!;
  check("сдельщик: работы", piece.work_amount, 15000);
  check("сдельщик: итог = работы + комп − удерж", piece.total, 17000);
  check("сдельщик: без оклада", piece.salary_amount, 0);

  const norm = r.lines.find((l) => l.user_id === tNorm)!;
  check("нормовик: оклад", norm.salary_amount, 100000);
  check("нормовик: бонус за 2 сверх нормы", norm.bonus_amount, 8000);
  check("нормовик: итог", norm.total, 108000);
  check("нормовик: норма выполнена", norm.threshold_met, true);

  const under = r.lines.find((l) => l.user_id === tUnder)!;
  check("недобор: оклад платится", under.salary_amount, 100000);
  check("недобор: бонуса нет", under.bonus_amount, 0);
  check("недобор: норма не выполнена", under.threshold_met, false);

  // Идемпотентность и открепление при отмене.
  const r2 = await buildPayrollSheet("2026-06-01", "2026-06-30", admin1);
  check("повтор: skipped", r2.skipped, "ведомость за период уже существует");
  await cancelPayrollSheet(r.sheetId, admin1);
  const [unlinked] = await query<{ cnt: string }>(`SELECT count(*) AS cnt FROM payroll_entries WHERE sheet_line_id IS NULL`);
  check("отмена: записи откреплены", Number(unlinked.cnt), 12);
  const r3 = await buildPayrollSheet("2026-06-01", "2026-06-30", admin1);
  check("пересчёт после отмены", r3.lines.length, 3);

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();
  const admin2 = new Pool({ connectionString: ADMIN_URL });
  await admin2.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin2.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
