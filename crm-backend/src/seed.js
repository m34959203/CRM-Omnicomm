// Наполнение демо-данными. Запуск: npm run seed
const bcrypt = require("bcryptjs");
const { db, init } = require("./db");

init();

const wipe = db.transaction(() => {
  for (const t of ["sim_cards","subscription_invoices","subscription_plans","maintenance_acts","work_orders","sales_order_items","sales_orders","equipment","warehouses","visit_steps", "visits", "request_history", "attachments", "requests", "objects", "clients", "users", "roles"]) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
});
wipe();

const roles = [
  ["management", "Руководство"], ["head", "Руководитель направления"], ["manager", "Менеджер"],
  ["support", "Техническая поддержка"], ["installer", "Монтажный специалист"],
  ["accounting", "Бухгалтерия"], ["admin", "Администратор системы"]
];
const insRole = db.prepare("INSERT INTO roles (code, name) VALUES (?, ?)");
const roleId = {};
for (const [code, name] of roles) roleId[code] = insRole.run(code, name).lastInsertRowid;

const pass = bcrypt.hashSync("demo1234", 10);
const insUser = db.prepare("INSERT INTO users (full_name, email, phone, role_id, password_hash, region) VALUES (?,?,?,?,?,?)");
const u = {};
u.admin = insUser.run("Админ Системы", "admin@omnicomm.kz", "+77010000001", roleId.admin, pass, null).lastInsertRowid;
u.manager = insUser.run("Жаркова А.А.", "manager@omnicomm.kz", "+77010000002", roleId.manager, pass, null).lastInsertRowid;
u.support = insUser.run("Иванов И.И.", "support@omnicomm.kz", "+77010000003", roleId.support, pass, null).lastInsertRowid;
u.installer = insUser.run("Петров П.П.", "installer@omnicomm.kz", "+77010000004", roleId.installer, pass, "Алматы").lastInsertRowid;
u.boss = insUser.run("Директор", "boss@omnicomm.kz", "+77010000005", roleId.management, pass, null).lastInsertRowid;

const insClient = db.prepare("INSERT INTO clients (name, bin_iin, phone, email, manager_id) VALUES (?,?,?,?,?)");
const c1 = insClient.run("ТОО «АвтоПарк KZ»", "123456789012", "+77011112233", "info@avtopark.kz", u.manager).lastInsertRowid;
const c2 = insClient.run("ИП Логистика", "987654321098", "+77017778899", "ip@logistika.kz", u.manager).lastInsertRowid;

const insObj = db.prepare("INSERT INTO objects (client_id, name, address, lat, lng, contact_person, contact_phone) VALUES (?,?,?,?,?,?,?)");
const o1 = insObj.run(c1, "Гараж №1", "г. Алматы, ул. Райымбека 100", 43.27, 76.92, "Сергей", "+77011112200").lastInsertRowid;
const o2 = insObj.run(c2, "Склад", "г. Астана, пр. Кабанбай 50", 51.13, 71.43, "Марат", "+77017778800").lastInsertRowid;

let counter = 1;
const num = () => "Z-" + String(2026000 + counter++);
const insReq = db.prepare(`INSERT INTO requests (number, client_id, object_id, type, priority, source, subject, status, manager_id, support_id, installer_id, due_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
const insHist = db.prepare("INSERT INTO request_history (request_id, action, detail, user_id) VALUES (?,?,?,?)");

function makeReq(client, obj, type, priority, status, installer, dueOffsetH) {
  const due = new Date(Date.now() + dueOffsetH * 3600000).toISOString().slice(0, 19).replace("T", " ");
  const id = insReq.run(num(), client, obj, type, priority, "Телефон", type, status, u.manager, u.support, installer, due).lastInsertRowid;
  insHist.run(id, "Создана", "Заявка создана из звонка", u.manager);
  if (status !== "Новая") insHist.run(id, "Статус", "→ " + status, u.support);
  return id;
}
makeReq(c1, o1, "Подключение оборудования", "Высокий", "Запланирован выезд", u.installer, 6);
makeReq(c1, o1, "Неисправность GPS-оборудования", "Критичный", "Монтажник на объекте", u.installer, 2);
makeReq(c2, o2, "Диагностика оборудования", "Обычный", "Новая", null, 24);
makeReq(c2, o2, "Консультация клиента", "Обычный", "В работе", null, 48);
makeReq(c1, o1, "Замена оборудования", "Высокий", "Просрочена", u.installer, -3);
const doneReq = makeReq(c2, o2, "Настройка мониторинга", "Обычный", "Выполнена", u.installer, 5);

// ---- Этап 2: демо-выезд с полным циклом этапов ----
const insVisit = db.prepare("INSERT INTO visits (request_id, installer_id, planned_at, status, repeat_of) VALUES (?,?,?,?,?)");
const insStep = db.prepare("INSERT INTO visit_steps (visit_id, step, lat, lng, user_id, created_at) VALUES (?,?,?,?,?,?)");
const insAtt = db.prepare("INSERT INTO attachments (request_id, kind, filename, url, user_id) VALUES (?,?,?,?,?)");
const today = new Date().toISOString().slice(0, 10);
const at = (h, m) => `${today} ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

const v1 = insVisit.run(doneReq, u.installer, at(9, 0), "завершил работы", null).lastInsertRowid;
insStep.run(v1, "depart", 51.10, 71.40, u.installer, at(9, 5));
insStep.run(v1, "arrive", 51.13, 71.43, u.installer, at(9, 35));
insStep.run(v1, "start", 51.13, 71.43, u.installer, at(9, 45));
insStep.run(v1, "finish", 51.13, 71.43, u.installer, at(11, 15));
insAtt.run(doneReq, "фото результата работ", "after.jpg", "/uploads/demo-after.jpg", u.installer);

insVisit.run(2, u.installer, at(16, 0), "назначен на заявку", null);


// ---- Доменные модули: склад и оборудование ----
const w1 = db.prepare("INSERT INTO warehouses (name, type) VALUES (?,?)").run("Центральный склад", "physical").lastInsertRowid;
const insEq = db.prepare("INSERT INTO equipment (model, serial, eq_type, status, warehouse_id) VALUES (?,?,?,?,?)");
insEq.run("Omnicomm Profi", "SN-1001", "gps", "new", w1);
insEq.run("Omnicomm LLS", "SN-1002", "fuel_sensor", "new", w1);
insEq.run("Omnicomm Optim", "SN-1003", "gps", "used", w1);

console.log("Сид завершён. Пользователи: admin@/manager@/support@/installer@/boss@omnicomm.kz, пароль demo1234");
