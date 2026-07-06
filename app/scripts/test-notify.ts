/** Тесты очереди уведомлений (временная БД, транспорты — заглушки). */
import { execSync } from "node:child_process";
import { Pool } from "pg";

const ADMIN_URL = "postgres://crm:crm@localhost:5445/crm_omnicomm";
const TEST_DB = "crm_omnicomm_notify_test";

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
  const { enqueueNotification, processNotificationQueue } = await import("../lib/notify/worker");

  await query(
    `INSERT INTO notification_templates (code, channel, subject_ru, subject_kk, body_ru, body_kk)
     VALUES ('block_warning','email','Предупреждение: {{client}}','Ескерту: {{client}}',
             'Долг {{debt}} ₸','Қарыз {{debt}} ₸')`
  );

  // 1. Шаблон + подстановка + локаль
  await enqueueNotification({
    channel: "email", recipient: "a@b.kz", templateCode: "block_warning",
    params: { client: "ТОО Тест", debt: "5000" }, locale: "kk",
  });
  const [q1] = await query<{ subject: string; body: string }>(`SELECT subject, body FROM notification_queue`);
  check("1. шаблон KK + params", [q1.subject, q1.body], ["Ескерту: ТОО Тест", "Қарыз 5000 ₸"]);

  // 2. Успешная отправка через заглушку
  const sent: string[] = [];
  const r2 = await processNotificationQueue(10, { email: async (i) => { sent.push(i.recipient); } });
  check("2. отправлено", [r2.sent, sent], [1, ["a@b.kz"]]);
  const [st2] = await query<{ status: string }>(`SELECT status FROM notification_queue`);
  check("2. статус sent", st2.status, "sent");

  // 3. Падающий транспорт → failed + attempts + backoff
  await enqueueNotification({ channel: "email", recipient: "x@y.kz", subject: "s", body: "b" });
  const r3 = await processNotificationQueue(10, { email: async () => { throw new Error("SMTP down"); } });
  check("3. failed", r3.failed, 1);
  const [st3] = await query<{ status: string; attempts: number; next_attempt_at: string | null; last_error: string }>(
    `SELECT status, attempts, next_attempt_at::text, last_error FROM notification_queue WHERE recipient='x@y.kz'`);
  check("3. attempts=1, ошибка записана", [st3.status, st3.attempts, st3.last_error], ["failed", 1, "SMTP down"]);
  check("3. next_attempt в будущем", st3.next_attempt_at !== null, true);

  // 4. Ретрай не берётся раньше next_attempt_at
  const r4 = await processNotificationQueue(10, { email: async (i) => { sent.push(i.recipient); } });
  check("4. до срока не ретраится", r4.sent + r4.failed, 0);
  await query(`UPDATE notification_queue SET next_attempt_at = now() - interval '1 minute' WHERE recipient='x@y.kz'`);
  const r4b = await processNotificationQueue(10, { email: async (i) => { sent.push(i.recipient); } });
  check("4. после срока ретраится и уходит", r4b.sent, 1);

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();
  const admin2 = new Pool({ connectionString: ADMIN_URL });
  await admin2.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin2.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
