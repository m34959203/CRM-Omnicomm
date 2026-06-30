// Этап 2: контроль монтажных специалистов — выезды, этапы, календарь, отчёт.
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { db, PHOTO_REQUIRED_TYPES, VISIT_STEPS } = require("./db");
const { authRequired, roleRequired } = require("./auth");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ dest: UPLOAD_DIR });

const log = (reqId, action, detail, userId) =>
  db.prepare("INSERT INTO request_history (request_id, action, detail, user_id) VALUES (?,?,?,?)").run(reqId, action, detail, userId);

function registerVisits(app) {
  // Назначить/запланировать выезд
  app.post("/api/requests/:id/visit", authRequired, roleRequired("manager", "head", "support", "admin"), (req, res) => {
    const { installer_id, planned_at, repeat_of } = req.body || {};
    const r = db.prepare("SELECT * FROM requests WHERE id=?").get(req.params.id);
    if (!r) return res.status(404).json({ error: "Заявка не найдена" });
    if (!installer_id) return res.status(400).json({ error: "Не указан монтажник (installer_id)" });
    const vid = db.prepare("INSERT INTO visits (request_id, installer_id, planned_at, repeat_of) VALUES (?,?,?,?)")
      .run(r.id, installer_id, planned_at, repeat_of || null).lastInsertRowid;
    db.prepare("UPDATE requests SET installer_id=?, status='Запланирован выезд' WHERE id=?").run(installer_id, r.id);
    db.prepare("UPDATE users SET installer_status='назначен на заявку' WHERE id=?").run(installer_id);
    log(r.id, "Выезд", "Запланирован выезд монтажника" + (repeat_of ? " (повторный)" : ""), req.user.id);
    res.status(201).json({ visit_id: vid });
  });

  // Отметка этапа выезда (с геолокацией)
  app.post("/api/visits/:id/step", authRequired, roleRequired("installer", "admin"), (req, res) => {
    const { step, lat, lng } = req.body || {};
    const map = VISIT_STEPS[step];
    if (!map) return res.status(400).json({ error: "Недопустимый этап. Допустимо: " + Object.keys(VISIT_STEPS).join(", ") });
    const v = db.prepare("SELECT * FROM visits WHERE id=?").get(req.params.id);
    if (!v) return res.status(404).json({ error: "Выезд не найден" });
    const r = db.prepare("SELECT * FROM requests WHERE id=?").get(v.request_id);

    // Правило ТЗ: завершение монтажной заявки без фотоотчёта запрещено
    if (step === "finish" && PHOTO_REQUIRED_TYPES.includes(r.type)) {
      const photos = db.prepare("SELECT COUNT(*) n FROM attachments WHERE request_id=? AND kind LIKE 'фото%'").get(r.id).n;
      if (photos === 0) return res.status(422).json({ error: "Нельзя завершить выезд без обязательного фотоотчёта" });
    }

    db.prepare("INSERT INTO visit_steps (visit_id, step, lat, lng, user_id) VALUES (?,?,?,?,?)")
      .run(v.id, step, lat ?? null, lng ?? null, req.user.id);
    db.prepare("UPDATE visits SET status=? WHERE id=?").run(map.inst, v.id);
    db.prepare("UPDATE requests SET status=? WHERE id=?").run(map.req, r.id);
    db.prepare("UPDATE users SET installer_status=? WHERE id=?").run(map.inst, v.installer_id);
    const geo = (lat != null && lng != null) ? ` @ ${lat},${lng}` : "";
    log(r.id, "Этап выезда", map.label + geo, req.user.id);
    res.json({ ok: true, request_status: map.req, installer_status: map.inst });
  });

  // Загрузка фото выезда (multipart: поле "file"; или metadata-only)
  app.post("/api/visits/:id/photo", authRequired, roleRequired("installer", "support", "admin"), upload.single("file"), (req, res) => {
    const v = db.prepare("SELECT * FROM visits WHERE id=?").get(req.params.id);
    if (!v) return res.status(404).json({ error: "Выезд не найден" });
    const kind = (req.body && req.body.kind) || "фото";
    const filename = req.file ? req.file.originalname : (req.body && req.body.filename) || null;
    const url = req.file ? `/uploads/${req.file.filename}` : (req.body && req.body.url) || null;
    db.prepare("INSERT INTO attachments (request_id, kind, filename, url, user_id) VALUES (?,?,?,?,?)")
      .run(v.request_id, kind, filename, url, req.user.id);
    log(v.request_id, "Фото", "Фотоотчёт выезда: " + kind, req.user.id);
    res.status(201).json({ ok: true });
  });

  // Календарь выездов (фильтры: ?date=YYYY-MM-DD &installer= &status=)
  app.get("/api/visits", authRequired, (req, res) => {
    const { date, installer, status } = req.query;
    let sql = `SELECT v.*, r.number, r.type, r.due_at, c.name AS client, o.address, o.name AS object, u.full_name AS installer
               FROM visits v
               JOIN requests r ON r.id=v.request_id
               JOIN clients c ON c.id=r.client_id
               LEFT JOIN objects o ON o.id=r.object_id
               JOIN users u ON u.id=v.installer_id WHERE 1=1`;
    const p = [];
    if (date) { sql += " AND date(v.planned_at)=?"; p.push(date); }
    if (installer) { sql += " AND v.installer_id=?"; p.push(installer); }
    if (status) { sql += " AND v.status=?"; p.push(status); }
    sql += " ORDER BY v.planned_at";
    res.json(db.prepare(sql).all(...p));
  });

  // Отчёт по монтажным специалистам (раздел 17 ТЗ)
  app.get("/api/reports/installers", authRequired, (_req, res) => {
    const installers = db.prepare(`SELECT u.id, u.full_name, u.installer_status FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='installer' AND u.active=1`).all();
    const minutes = (a, b) => `(julianday(${b})-julianday(${a}))*1440`;
    const report = installers.map(u => {
      const cnt = (sql, ...p) => db.prepare(sql).get(u.id, ...p).n;
      const assigned = cnt("SELECT COUNT(*) n FROM requests WHERE installer_id=?");
      const done = cnt("SELECT COUNT(*) n FROM requests WHERE installer_id=? AND status IN ('Выполнена','Закрыта')");
      const overdue = cnt("SELECT COUNT(*) n FROM requests WHERE installer_id=? AND status='Просрочена'");
      const repeats = cnt("SELECT COUNT(*) n FROM visits WHERE installer_id=? AND repeat_of IS NOT NULL");
      const noPhoto = cnt(`SELECT COUNT(*) n FROM requests r WHERE r.installer_id=? AND r.status IN ('Выполнена','Закрыта')
        AND NOT EXISTS (SELECT 1 FROM attachments a WHERE a.request_id=r.id AND a.kind LIKE 'фото%')`);
      // среднее время прибытия (выезд→прибытие) и выполнения (начало→завершение) по visit_steps
      const avg = (s1, s2) => {
        const row = db.prepare(`SELECT AVG(${minutes("d.created_at", "ar.created_at")}) m FROM visits v
          JOIN visit_steps d ON d.visit_id=v.id AND d.step=?
          JOIN visit_steps ar ON ar.visit_id=v.id AND ar.step=?
          WHERE v.installer_id=?`).get(s1, s2, u.id);
        return row.m != null ? Math.round(row.m) : null;
      };
      return {
        installer: u.full_name, status: u.installer_status,
        assigned, done, overdue, repeats, withoutPhoto: noPhoto,
        avgArrivalMin: avg("depart", "arrive"), avgWorkMin: avg("start", "finish")
      };
    });
    res.json(report);
  });
}

module.exports = { registerVisits };
