/**
 * Табличные тесты закрытия акта ТО (временная БД crm_omnicomm_act_test).
 * Запуск из app/: npx tsx scripts/test-act-close.ts
 */
import { execSync } from "node:child_process";
import { Pool } from "pg";

const ADMIN_URL = "postgres://crm:crm@localhost:5445/crm_omnicomm";
const TEST_DB = "crm_omnicomm_act_test";

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
  const { closeMaintenanceAct, reworkMaintenanceAct, ActCloseError } = await import("../lib/service/act-close");

  // ---------- Фикстура ----------
  const one = async (sql: string, params?: unknown[]) =>
    (await query<{ id: string }>(sql, params))[0].id;

  const roleId = await one(`INSERT INTO roles (code, name) VALUES ('installer','Техник') RETURNING id`);
  const tech = await one(
    `INSERT INTO users (full_name, email, role_id, password_hash) VALUES ('Техник','t@t.kz',$1,'x') RETURNING id`, [roleId]);
  const office = await one(
    `INSERT INTO users (full_name, email, role_id, password_hash) VALUES ('Офис','o@t.kz',$1,'x') RETURNING id`, [roleId]);
  const client = await one(`INSERT INTO clients (name) VALUES ('ТОО Тест') RETURNING id`);
  const object = await one(
    `INSERT INTO monitoring_objects (client_id, name, kind) VALUES ($1,'КАМАЗ A123BC09','vehicle') RETURNING id`, [client]);
  const wh = await one(`INSERT INTO warehouses (name, type) VALUES ('Основной','physical') RETURNING id`);
  const nomTerm = await one(
    `INSERT INTO nomenclature (kind, name, is_serial_tracked, max_sim_slots, device_type)
     VALUES ('equipment','Терминал',true,1,'gps_terminal') RETURNING id`);
  const workType = await one(
    `INSERT INTO work_types (name, action, default_rate) VALUES ('Монтаж терминала','install',2000) RETURNING id`);

  async function makeEq(serial: string, status = "in_stock") {
    return one(
      `INSERT INTO equipment_items (nomenclature_id, serial_number, status, warehouse_id)
       VALUES ($1,$2,$3,$4) RETURNING id`, [nomTerm, serial, status, wh]);
  }
  async function makeActFixture(opts: { photoRequired?: boolean } = {}) {
    const req = await one(
      `INSERT INTO requests (number, client_id, object_id, type, photo_required)
       VALUES ('Z-' || floor(random()*1e9)::text, $1, $2, 'connect', $3) RETURNING id`,
      [client, object, opts.photoRequired ?? false]);
    const wo = await one(
      `INSERT INTO work_orders (number, client_id, object_id, request_id, status)
       VALUES ('ЗН-' || floor(random()*1e9)::text, $1, $2, $3, 'in_progress') RETURNING id`,
      [client, object, req]);
    const act = await one(
      `INSERT INTO maintenance_acts (work_order_id, status, performed_by)
       VALUES ($1,'in_preparation',$2) RETURNING id`, [wo, tech]);
    return { req, wo, act };
  }

  // ---------- 1. Установка: движение, ESH active, номер, статусы, ЗП ----------
  const eq1 = await makeEq("SN-1");
  const f1 = await makeActFixture();
  await query(
    `INSERT INTO maintenance_act_lines (act_id, action, basis, object_id, installed_equipment_id)
     VALUES ($1,'install','sales_order',$2,$3)`, [f1.act, object, eq1]);
  await query(
    `INSERT INTO act_works (act_id, work_type_id, performer_id, quantity, rate, amount)
     VALUES ($1,$2,$3,1,0,0)`, [f1.act, workType, tech]);
  const r1 = await closeMaintenanceAct(f1.act, office);
  check("1. номер присвоен", r1.number.startsWith("АТО-"), true);
  check("1. активаций", r1.activations.map(a => a.kind), ["activated"]);
  const [eq1row] = await query<{ status: string; billing_state: string; client_id: string }>(
    `SELECT status, billing_state, client_id FROM equipment_items WHERE id=$1`, [eq1]);
  check("1. оборудование installed/active", [eq1row.status, eq1row.billing_state], ["installed", "active"]);
  const esh1 = await query(`SELECT state FROM equipment_state_history WHERE equipment_id=$1 AND valid_to IS NULL`, [eq1]);
  check("1. открытый интервал active", esh1.length, 1);
  const [pe1] = await query<{ amount: string }>(`SELECT amount FROM payroll_entries WHERE user_id=$1`, [tech]);
  check("1. ЗП по default_rate вида работ", Number(pe1.amount), 2000);
  const [req1] = await query<{ status: string }>(`SELECT status FROM requests WHERE id=$1`, [f1.req]);
  check("1. заявка completed", req1.status, "completed");

  // ---------- 2. Замена: обе серии, снятое → БУ на склад ----------
  const eq2new = await makeEq("SN-2N");
  const f2 = await makeActFixture();
  await query(
    `INSERT INTO maintenance_act_lines (act_id, action, basis, object_id, installed_equipment_id, removed_equipment_id)
     VALUES ($1,'replace','warranty',$2,$3,$4)`, [f2.act, object, eq2new, eq1]);
  const r2 = await closeMaintenanceAct(f2.act, office);
  check("2. активация + деактивация", r2.activations.map(a => a.kind).sort(), ["activated", "deactivated"]);
  const [old2] = await query<{ status: string; condition: string; warehouse_id: string }>(
    `SELECT status, condition, warehouse_id FROM equipment_items WHERE id=$1`, [eq1]);
  check("2. снятое: БУ на складе", [old2.status, old2.condition, old2.warehouse_id], ["in_stock", "used", wh]);
  const eshOld = await query(`SELECT 1 FROM equipment_state_history WHERE equipment_id=$1 AND valid_to IS NULL`, [eq1]);
  check("2. интервал снятого закрыт", eshOld.length, 0);

  // ---------- 3. Фотоотчёт обязателен ----------
  const eq3 = await makeEq("SN-3");
  const f3 = await makeActFixture({ photoRequired: true });
  await query(
    `INSERT INTO maintenance_act_lines (act_id, action, object_id, installed_equipment_id)
     VALUES ($1,'install',$2,$3)`, [f3.act, object, eq3]);
  let err3 = "";
  try { await closeMaintenanceAct(f3.act, office); } catch (e) { err3 = (e as Error).message; }
  check("3. блок без фото", err3.includes("фотоотчёт"), true);
  await query(
    `INSERT INTO attachments (entity_type, entity_id, kind, url) VALUES ('maintenance_act',$1,'photo','file://x.jpg')`,
    [f3.act]);
  const r3 = await closeMaintenanceAct(f3.act, office);
  check("3. с фото закрывается", r3.requestClosed, true);

  // ---------- 4. SIM: лимит слотов ----------
  const op = await one(`INSERT INTO sim_operators (name, code) VALUES ('Beeline','b') RETURNING id`);
  const sim1 = await one(`INSERT INTO sim_cards (icc, operator_id, warehouse_id) VALUES ('ICC-1',$1,$2) RETURNING id`, [op, wh]);
  const sim2 = await one(`INSERT INTO sim_cards (icc, operator_id, warehouse_id) VALUES ('ICC-2',$1,$2) RETURNING id`, [op, wh]);
  const eq4 = await makeEq("SN-4");
  const f4 = await makeActFixture();
  await query(
    `INSERT INTO maintenance_act_lines (act_id, action, object_id, installed_equipment_id)
     VALUES ($1,'install',$2,$3)`, [f4.act, object, eq4]);
  await query(`INSERT INTO act_sim_ops (act_id, sim_id, op, equipment_id) VALUES ($1,$2,'install',$3)`, [f4.act, sim1, eq4]);
  const r4 = await closeMaintenanceAct(f4.act, office);
  check("4. SIM установлена", r4.actId, f4.act);
  const [sim1row] = await query<{ location_type: string; equipment_id: string }>(
    `SELECT location_type, equipment_id FROM sim_cards WHERE id=$1`, [sim1]);
  check("4. SIM в оборудовании", [sim1row.location_type, sim1row.equipment_id], ["equipment", eq4]);
  // второй акт: вторая SIM в то же устройство (лимит 1) → ошибка
  const f4b = await makeActFixture();
  await query(
    `INSERT INTO maintenance_act_lines (act_id, action, basis, object_id, removed_equipment_id)
     VALUES ($1,'dismantle','warranty',$2,$3)`, [f4b.act, object, eq3]); // строка нужна любая
  await query(`INSERT INTO act_sim_ops (act_id, sim_id, op, equipment_id) VALUES ($1,$2,'install',$3)`, [f4b.act, sim2, eq4]);
  let err4 = "";
  try { await closeMaintenanceAct(f4b.act, office); } catch (e) { err4 = (e as Error).message; }
  check("4. лимит SIM-слотов", err4.includes("лимит SIM"), true);

  // ---------- 5. Тестирование: без активации абонплаты ----------
  const eq5 = await makeEq("SN-5");
  await query(`INSERT INTO warehouses (name, type) VALUES ('Тестирование','testing')`);
  const f5 = await makeActFixture();
  await query(
    `INSERT INTO maintenance_act_lines (act_id, action, basis, object_id, installed_equipment_id)
     VALUES ($1,'install','testing',$2,$3)`, [f5.act, object, eq5]);
  const r5 = await closeMaintenanceAct(f5.act, office);
  check("5. тест: активаций нет", r5.activations.length, 0);
  const [eq5row] = await query<{ status: string; billing_state: string | null }>(
    `SELECT status, billing_state FROM equipment_items WHERE id=$1`, [eq5]);
  check("5. тест: on_testing без биллинга", [eq5row.status, eq5row.billing_state], ["on_testing", null]);

  // ---------- 6. Повторное закрытие ----------
  let err6 = "";
  try { await closeMaintenanceAct(f1.act, office); } catch (e) { err6 = (e as Error).message; }
  check("6. повторное закрытие блокировано", err6.includes("уже закрыт"), true);

  // ---------- 7. Доработка: новый наряд ----------
  const f7 = await makeActFixture();
  const r7 = await reworkMaintenanceAct(f7.act, office, "не хватило крепежа");
  const [wo7] = await query<{ status: string }>(`SELECT status FROM work_orders WHERE id=$1`, [r7.newWorkOrderId]);
  check("7. новый наряд planned", wo7.status, "planned");
  const [act7] = await query<{ status: string }>(`SELECT status FROM maintenance_acts WHERE id=$1`, [f7.act]);
  check("7. акт needs_rework", act7.status, "needs_rework");
  void ActCloseError;

  console.log(`\n${passed} passed, ${failed} failed`);
  await db.end();
  const admin2 = new Pool({ connectionString: ADMIN_URL });
  await admin2.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin2.end();
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
