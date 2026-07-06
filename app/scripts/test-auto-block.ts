/**
 * Тест автоблокировки должников (lib/telematics/auto-block.ts).
 * Гоняется на временной БД crm_omnicomm_autoblock_test; Omnicomm не нужен —
 * setUserBlocking подменяется записывающей заглушкой (инъекция setBlocking).
 * Запуск: из app/: npx tsx scripts/test-auto-block.ts
 */
import { execSync } from "node:child_process";
import { Pool } from "pg";

const ADMIN_URL = "postgres://crm:crm@localhost:5445/crm_omnicomm";
const TEST_DB = "crm_omnicomm_autoblock_test";
const TEST_URL = `postgres://crm:crm@localhost:5445/${TEST_DB}`;

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
  const { runAutoBlocking } = await import("../lib/telematics/auto-block");

  // Записывающая заглушка вместо Omnicomm.
  const calls: { login: string; blocked: boolean }[] = [];
  const stub = async (
    _server: unknown,
    p: { login: string; blocked: boolean; comment: string }
  ) => {
    calls.push({ login: p.login, blocked: p.blocked });
  };

  // ---------- Фикстура ----------
  const TODAY = "2026-07-10";

  const server = (await query<{ id: string }>(
    `INSERT INTO telematics_servers (name, base_url, auth_login, auth_secret)
     VALUES ('Тест-СМ', 'https://example.invalid', 'l', 'p') RETURNING id`
  ))[0].id;

  async function makeClient(name: string, scheme: string, login: string) {
    const id = (await query<{ id: string }>(
      `INSERT INTO clients (name, billing_scheme, email) VALUES ($1,$2,$3) RETURNING id`,
      [name, scheme, `${login}@test.kz`]
    ))[0].id;
    await query(
      `INSERT INTO telematics_accounts (server_id, client_id, login, auto_block_debtors)
       VALUES ($1,$2,$3,true)`,
      [server, id, login]
    );
    return id;
  }

  let docSeq = 0;
  async function makeDebt(clientId: string, total: number, periodEnd: string) {
    await query(
      `INSERT INTO billing_documents (number, kind, scheme, client_id, period_start, period_end, subtotal, total, status)
       VALUES ($1, 'act', 'credit', $2, ($3::date - 29), $3::date, $4, $4, 'issued')`,
      [`T-${++docSeq}`, clientId, periodEnd, total]
    );
  }

  // Правило по умолчанию: отсрочка 5 дн. (обе схемы), допустимый долг 1000, предупреждение за 3 дн.
  const rule = (await query<{ id: string }>(
    `INSERT INTO blocking_rules (name, scope, advance_grace_days, credit_grace_days, allowed_debt, warn_days_before)
     VALUES ('Default', 'default', 5, 5, 1000, 3) RETURNING id`
  ))[0].id;

  // К1: долг 500 ≤ allowed_debt 1000 → ничего.
  const c1 = await makeClient("К1 в пределах", "credit", "user1");
  await makeDebt(c1, 500, "2026-06-30"); // просрочка 10 дн., но долг мал

  // К2: долг 5000, просрочка 10 дн. > отсрочки 5 → block.
  const c2 = await makeClient("К2 должник", "credit", "user2");
  await makeDebt(c2, 5000, "2026-06-30");

  // К3: долг и просрочка как у К2, но manual_unblock до завтра → skip.
  const c3 = await makeClient("К3 ручная разблокировка", "credit", "user3");
  await makeDebt(c3, 5000, "2026-06-30");
  await query(
    `INSERT INTO blocking_events (client_id, action, unblock_until) VALUES ($1, 'manual_unblock', $2::date)`,
    [c3, "2026-07-11"]
  );

  // К5: просрочка 4 дн. ≤ отсрочки 5, в окне предупреждения (5−3=2 < 4) → warning.
  const c5 = await makeClient("К5 предупреждение", "credit", "user5");
  await makeDebt(c5, 3000, "2026-07-06");

  // ---------- Прогон 1 ----------
  const ev1 = await runAutoBlocking({ today: TODAY, setBlocking: stub });

  check("1. К1 (долг < allowed_debt): событий нет", ev1.some((e) => e.client_id === c1), false);

  const e2 = ev1.find((e) => e.client_id === c2);
  check("2. К2: block", e2?.action, "block");
  check("2. К2: rule_id", e2?.rule_id, rule);
  check("2. К2: заглушка вызвана blocked=true", calls.some((x) => x.login === "user2" && x.blocked), true);
  const [e2db] = await query<{ action: string; performed_by: string | null }>(
    `SELECT action, performed_by FROM blocking_events WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [c2]
  );
  check("2. К2: событие в БД, performed_by NULL", [e2db.action, e2db.performed_by], ["block", null]);
  const [sl2] = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM sync_log WHERE operation = 'block' AND status = 'ok'`
  );
  check("2. sync_log ok записан", Number(sl2.n) >= 1, true);

  check("3. К3 (manual_unblock до завтра): skip", ev1.some((e) => e.client_id === c3), false);
  check("3. К3: заглушка не вызывалась", calls.some((x) => x.login === "user3"), false);

  const e5 = ev1.find((e) => e.client_id === c5);
  check("5. К5: warning", e5?.action, "warning");

  // ---------- Прогон 2 (тот же день): warning не дублируется, block не повторяется ----------
  // NB: дедупликация warning считает календарные сутки по created_at (сейчас), поэтому
  // повторный прогон в тех же сутках использует реальную дату; событие прогона 1 убираем.
  const realToday = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 10);
  await query(`DELETE FROM blocking_events WHERE client_id = $1`, [c5]);
  // Переносим фикстуру К5 под реальное «сегодня»: просрочка 4 дн.
  await query(`UPDATE billing_documents SET period_end = ($1::date - 4) WHERE client_id = $2`, [realToday, c5]);
  await query(`UPDATE billing_documents SET period_end = ($1::date - 10) WHERE client_id = $2`, [realToday, c2]);
  const evA = await runAutoBlocking({ today: realToday, setBlocking: stub });
  check("5а. warning создан в реальные сутки", evA.filter((e) => e.client_id === c5).length, 1);
  const evB = await runAutoBlocking({ today: realToday, setBlocking: stub });
  check("5б. warning не дублируется в сутки", evB.filter((e) => e.client_id === c5).length, 0);
  check("2б. повторный block не создаётся", evB.filter((e) => e.client_id === c2).length, 0);

  // ---------- Кейс 4: погашение долга → unblock ----------
  await query(`INSERT INTO payments (client_id, amount, method) VALUES ($1, 5000, 'bank')`, [c2]);
  calls.length = 0;
  const ev4 = await runAutoBlocking({ today: realToday, setBlocking: stub });
  const e4 = ev4.find((e) => e.client_id === c2);
  check("4. К2 после оплаты: unblock", e4?.action, "unblock");
  check("4. заглушка вызвана blocked=false", calls.some((x) => x.login === "user2" && !x.blocked), true);
  const [e4db] = await query<{ action: string; performed_by: string | null }>(
    `SELECT action, performed_by FROM blocking_events WHERE client_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [c2]
  );
  check("4. событие unblock, performed_by NULL", [e4db.action, e4db.performed_by], ["unblock", null]);
  // Повторный прогон: разблокированного не трогаем.
  const ev4b = await runAutoBlocking({ today: realToday, setBlocking: stub });
  check("4б. повторный unblock не создаётся", ev4b.filter((e) => e.client_id === c2).length, 0);

  // ---------- Кейс 6: ошибка Omnicomm → sync_log error, событие не пишется ----------
  const c6 = await makeClient("К6 ошибка СМ", "credit", "user6");
  await makeDebt(c6, 9000, "2026-06-01");
  const failing = async () => {
    throw new Error("Omnicomm down");
  };
  const ev6 = await runAutoBlocking({ today: realToday, setBlocking: failing });
  check("6. событие block не создано", ev6.filter((e) => e.client_id === c6).length, 0);
  const [sl6] = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM sync_log WHERE status = 'error' AND error_message = 'Omnicomm down'`
  );
  check("6. sync_log error записан", Number(sl6.n) >= 1, true);
  const [be6] = await query<{ n: string }>(
    `SELECT count(*)::text AS n FROM blocking_events WHERE client_id = $1`,
    [c6]
  );
  check("6. blocking_events пуст для К6", Number(be6.n), 0);

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
