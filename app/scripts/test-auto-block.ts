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


  // ---------- Кейс 6: авто-отключение парка (disable_objects_after_days) ----------
  const dcCalls: { uuid: string; enabled: boolean }[] = [];
  const dcStub = async (_s: unknown, uuid: string, enabled: boolean) => {
    dcCalls.push({ uuid, enabled });
  };
  const c6d = await makeClient("К6 отключение парка", "credit", "user6");
  await query(
    `INSERT INTO blocking_rules (name, scope, client_id, advance_grace_days, credit_grace_days,
       allowed_debt, warn_days_before, disable_objects_after_days)
     VALUES ('К6 правило', 'client', $1, 5, 5, 1000, 3, 3)`,
    [c6d]
  );
  const nom6 = (await query<{ id: string }>(
    `INSERT INTO nomenclature (kind, name) VALUES ('equipment','Т6') RETURNING id`
  ))[0].id;
  const obj6 = (await query<{ id: string }>(
    `INSERT INTO monitoring_objects (client_id, name, kind) VALUES ($1,'ТС-6','vehicle') RETURNING id`,
    [c6d]
  ))[0].id;
  const eq6 = (await query<{ id: string }>(
    `INSERT INTO equipment_items (nomenclature_id, serial_number, status, client_id, object_id, billing_state)
     VALUES ($1,'SN-К6','installed',$2,$3,'active') RETURNING id`,
    [nom6, c6d, obj6]
  ))[0].id;
  await query(
    `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, source_type)
     VALUES ($1,$2,$3,'active','2026-05-01T00:00:00+05','manual')`,
    [eq6, obj6, c6d]
  );
  // Вручную отключённая единица — восстанавливаться НЕ должна.
  const eq6m = (await query<{ id: string }>(
    `INSERT INTO equipment_items (nomenclature_id, serial_number, status, client_id, object_id, billing_state)
     VALUES ($1,'SN-К6М','installed',$2,$3,'disabled') RETURNING id`,
    [nom6, c6d, obj6]
  ))[0].id;
  await query(
    `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, source_type)
     VALUES ($1,$2,$3,'disabled','2026-05-01T00:00:00+05','manual')`,
    [eq6m, obj6, c6d]
  );
  await makeDebt(c6d, 9000, "2026-06-30"); // к 2026-07-10 просрочка 10 дн.

  // Прогон А: блокировка (просрочка 10 > 5), парк ещё не трогаем (10 ≤ 5+3? нет: 10 > 8 —
  // но отключение только для УЖЕ заблокированных, т.е. со второго прогона).
  const ev6a = await runAutoBlocking({ today: TODAY, setBlocking: stub, setDataCapture: dcStub });
  check("6а. первый прогон: block", ev6a.find((e) => e.client_id === c6d)?.action, "block");
  // Прогон Б: уже заблокирован + просрочка 10 > 5+3 → disable_objects.
  const ev6b = await runAutoBlocking({ today: TODAY, setBlocking: stub, setDataCapture: dcStub });
  check("6б. второй прогон: disable_objects", ev6b.find((e) => e.client_id === c6d)?.action, "disable_objects");
  const [eq6row] = await query<{ billing_state: string }>(
    `SELECT billing_state FROM equipment_items WHERE id = $1`, [eq6]);
  check("6б. единица disabled", eq6row.billing_state, "disabled");
  const [obj6row] = await query<{ status: string }>(
    `SELECT status FROM monitoring_objects WHERE id = $1`, [obj6]);
  check("6б. объект archived", obj6row.status, "archived");
  const [esh6] = await query<{ source_type: string }>(
    `SELECT source_type FROM equipment_state_history WHERE equipment_id = $1 AND valid_to IS NULL`, [eq6]);
  check("6б. открытый интервал auto_block", esh6.source_type, "auto_block");
  // Прогон В: повторно — не дублируется.
  const ev6c = await runAutoBlocking({ today: TODAY, setBlocking: stub, setDataCapture: dcStub });
  check("6в. без дублей", ev6c.filter((e) => e.client_id === c6d).length, 0);
  // Оплата → unblock + restore_objects; ручная единица не восстанавливается.
  await query(`INSERT INTO payments (client_id, amount, method) VALUES ($1, 9000, 'bank')`, [c6d]);
  const ev6d = await runAutoBlocking({ today: TODAY, setBlocking: stub, setDataCapture: dcStub });
  const acts6 = ev6d.filter((e) => e.client_id === c6d).map((e) => e.action).sort();
  check("6г. оплата: unblock + restore_objects", acts6, ["restore_objects", "unblock"]);
  const [eq6after] = await query<{ billing_state: string }>(
    `SELECT billing_state FROM equipment_items WHERE id = $1`, [eq6]);
  check("6г. единица снова active", eq6after.billing_state, "active");
  const [eq6mAfter] = await query<{ billing_state: string }>(
    `SELECT billing_state FROM equipment_items WHERE id = $1`, [eq6m]);
  check("6г. вручную отключённая НЕ восстановлена", eq6mAfter.billing_state, "disabled");
  const [obj6after] = await query<{ status: string }>(
    `SELECT status FROM monitoring_objects WHERE id = $1`, [obj6]);
  check("6г. объект снова active", obj6after.status, "active");

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
