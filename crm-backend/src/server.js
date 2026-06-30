const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const path = require("path");
const { db, init, REQUEST_STATUSES, REQUEST_TYPES, PHOTO_REQUIRED_TYPES } = require("./db");
const { sign, authRequired, roleRequired } = require("./auth");
const { registerVisits } = require("./visits");
const { registerModules } = require("./modules2");

init();
const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "..", "uploads")));
// Раздача статичных UI-прототипов (демо) тем же сервером — один порт для туннеля
app.use(express.static(path.join(__dirname, "..", "..", "ui")));

const log = (reqId, action, detail, userId) =>
  db.prepare("INSERT INTO request_history (request_id, action, detail, user_id) VALUES (?,?,?,?)").run(reqId, action, detail, userId);

// ---- Справочники ----
app.get("/api/meta", (_req, res) => res.json({ statuses: REQUEST_STATUSES, types: REQUEST_TYPES, photoRequiredTypes: PHOTO_REQUIRED_TYPES }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---- Аутентификация ----
app.post("/api/auth/login", (req, res) => {
  const { email, password } = req.body || {};
  const row = db.prepare(`SELECT u.*, r.code AS role_code FROM users u JOIN roles r ON r.id=u.role_id WHERE u.email=? AND u.active=1`).get(email);
  if (!row || !bcrypt.compareSync(password || "", row.password_hash))
    return res.status(401).json({ error: "Неверный email или пароль" });
  res.json({ token: sign(row), user: { id: row.id, name: row.full_name, role: row.role_code } });
});

// ---- Рабочий стол ----
app.get("/api/dashboard", authRequired, (_req, res) => {
  const byStatus = db.prepare("SELECT status, COUNT(*) n FROM requests GROUP BY status").all();
  const count = s => db.prepare("SELECT COUNT(*) n FROM requests WHERE status=?").get(s).n;
  res.json({
    total: db.prepare("SELECT COUNT(*) n FROM requests").get().n,
    new: count("Новая"),
    inWork: count("В работе"),
    overdue: count("Просрочена"),
    done: count("Выполнена") + count("Закрыта"),
    noResponsible: db.prepare("SELECT COUNT(*) n FROM requests WHERE manager_id IS NULL AND status NOT IN ('Закрыта','Отменена')").get().n,
    byStatus
  });
});

// ---- Клиенты ----
app.get("/api/clients", authRequired, (_req, res) =>
  res.json(db.prepare("SELECT * FROM clients ORDER BY id DESC").all()));
app.post("/api/clients", authRequired, roleRequired("manager", "admin", "support"), (req, res) => {
  const { name, bin_iin, phone, email } = req.body || {};
  if (!name) return res.status(400).json({ error: "Не указано наименование" });
  const id = db.prepare("INSERT INTO clients (name, bin_iin, phone, email, manager_id) VALUES (?,?,?,?,?)")
    .run(name, bin_iin, phone, email, req.user.id).lastInsertRowid;
  res.status(201).json({ id });
});

// ---- Заявки ----
app.get("/api/requests", authRequired, (req, res) => {
  const { status, type, q } = req.query;
  let sql = "SELECT r.*, c.name AS client_name FROM requests r JOIN clients c ON c.id=r.client_id WHERE 1=1";
  const p = [];
  if (status) { sql += " AND r.status=?"; p.push(status); }
  if (type) { sql += " AND r.type=?"; p.push(type); }
  if (q) { sql += " AND (r.number LIKE ? OR c.name LIKE ?)"; p.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY r.id DESC";
  res.json(db.prepare(sql).all(...p));
});

app.get("/api/requests/:id", authRequired, (req, res) => {
  const r = db.prepare("SELECT * FROM requests WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Заявка не найдена" });
  r.history = db.prepare("SELECT * FROM request_history WHERE request_id=? ORDER BY id").all(r.id);
  r.attachments = db.prepare("SELECT * FROM attachments WHERE request_id=?").all(r.id);
  res.json(r);
});

app.post("/api/requests", authRequired, roleRequired("manager", "support", "admin"), (req, res) => {
  const { client_id, object_id, type, priority, source, subject, description, due_at } = req.body || {};
  if (!client_id || !type) return res.status(400).json({ error: "Нужны client_id и type" });
  if (!REQUEST_TYPES.includes(type)) return res.status(400).json({ error: "Недопустимый тип заявки" });
  const number = "Z-" + Date.now().toString().slice(-7);
  const id = db.prepare(`INSERT INTO requests (number, client_id, object_id, type, priority, source, subject, description, status, manager_id, due_at)
    VALUES (?,?,?,?,?,?,?,?,'Новая',?,?)`).run(number, client_id, object_id, type, priority || "Обычный", source, subject, description, req.user.id, due_at).lastInsertRowid;
  log(id, "Создана", "Заявка создана", req.user.id);
  res.status(201).json({ id, number });
});

// Назначение ответственных
app.post("/api/requests/:id/assign", authRequired, roleRequired("manager", "head", "support", "admin"), (req, res) => {
  const { manager_id, support_id, installer_id } = req.body || {};
  const r = db.prepare("SELECT * FROM requests WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Заявка не найдена" });
  db.prepare("UPDATE requests SET manager_id=COALESCE(?,manager_id), support_id=COALESCE(?,support_id), installer_id=COALESCE(?,installer_id), status=CASE WHEN status='Новая' THEN 'Назначена' ELSE status END WHERE id=?")
    .run(manager_id, support_id, installer_id, r.id);
  log(r.id, "Назначение", "Назначены ответственные", req.user.id);
  res.json({ ok: true });
});

// Смена статуса с проверкой бизнес-правил (раздел 20 ТЗ)
app.patch("/api/requests/:id/status", authRequired, (req, res) => {
  const { status, result_comment } = req.body || {};
  if (!REQUEST_STATUSES.includes(status)) return res.status(400).json({ error: "Недопустимый статус" });
  const r = db.prepare("SELECT * FROM requests WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Заявка не найдена" });

  // Правило 1: закрытие без результата запрещено
  if ((status === "Закрыта" || status === "Выполнена") && !(result_comment || r.result_comment))
    return res.status(422).json({ error: "Нельзя завершить заявку без указания результата выполнения" });

  // Правило 3: фотоотчёт обязателен для монтажных типов
  if (status === "Выполнена" && PHOTO_REQUIRED_TYPES.includes(r.type)) {
    const photos = db.prepare("SELECT COUNT(*) n FROM attachments WHERE request_id=? AND kind LIKE 'фото%'").get(r.id).n;
    if (photos === 0) return res.status(422).json({ error: "Нельзя перевести в «Выполнена» без обязательного фотоотчёта" });
  }

  const closed_at = (status === "Закрыта") ? new Date().toISOString() : r.closed_at;
  db.prepare("UPDATE requests SET status=?, result_comment=COALESCE(?,result_comment), closed_at=? WHERE id=?")
    .run(status, result_comment, closed_at, r.id);
  log(r.id, "Статус", "→ " + status, req.user.id);
  res.json({ ok: true });
});

// Фотоотчёт (метаданные; файл — в MinIO/S3 в проде)
app.post("/api/requests/:id/photos", authRequired, roleRequired("installer", "support", "admin"), (req, res) => {
  const { kind, filename, url } = req.body || {};
  const r = db.prepare("SELECT id FROM requests WHERE id=?").get(req.params.id);
  if (!r) return res.status(404).json({ error: "Заявка не найдена" });
  db.prepare("INSERT INTO attachments (request_id, kind, filename, url, user_id) VALUES (?,?,?,?,?)")
    .run(r.id, kind || "фото", filename, url, req.user.id);
  log(r.id, "Фото", "Загружен фотоотчёт: " + (kind || "фото"), req.user.id);
  res.status(201).json({ ok: true });
});

// Этап 2: маршруты выездов монтажников, календарь, отчёт
registerVisits(app);
// Доменные модули: оборудование, продажи, наряды, Акт ТО, абонплата, SIM
registerModules(app);

const PORT = process.env.PORT || 3000;
if (require.main === module) app.listen(PORT, () => console.log("CRM API на http://localhost:" + PORT));
module.exports = app;
