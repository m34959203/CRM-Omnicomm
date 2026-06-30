// Рабочие модули: оборудование/склад, продажи, наряды, Акт ТО→биллинг, абонплата, SIM, авто-блок.
const { db } = require("./db");
const { authRequired, roleRequired } = require("./auth");

let seq = Date.now() % 100000;
const num = (p) => p + "-" + (++seq);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };
const monthEnd = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); };

function registerModules(app) {
  // ---- Оборудование и склад ----
  app.post("/api/equipment", authRequired, roleRequired("admin", "support", "manager"), (req, res) => {
    const { model, serial, eq_type, warehouse_id } = req.body || {};
    if (!model) return res.status(400).json({ error: "Не указана модель" });
    try {
      const id = db.prepare("INSERT INTO equipment (model, serial, eq_type, warehouse_id) VALUES (?,?,?,?)")
        .run(model, serial || null, eq_type || null, warehouse_id || null).lastInsertRowid;
      res.status(201).json({ id });
    } catch (e) { res.status(409).json({ error: "Дубликат серийного номера" }); }
  });
  app.get("/api/equipment", authRequired, (_req, res) =>
    res.json(db.prepare("SELECT * FROM equipment ORDER BY id DESC LIMIT 500").all()));

  // Единый отчёт по оборудованию (преимущество — у вендора нет)
  app.get("/api/reports/equipment", authRequired, (_req, res) => {
    const byStatus = db.prepare("SELECT status, COUNT(*) n FROM equipment GROUP BY status").all();
    const byLocation = db.prepare(`SELECT CASE
        WHEN client_id IS NOT NULL THEN 'у клиента'
        WHEN holder_id IS NOT NULL THEN 'у техника'
        WHEN status='demo' THEN 'на тестировании'
        ELSE 'на складе' END location, COUNT(*) n FROM equipment GROUP BY location`).all();
    res.json({ total: db.prepare("SELECT COUNT(*) n FROM equipment").get().n, byStatus, byLocation });
  });

  // ---- Заказ клиента ----
  app.post("/api/sales-orders", authRequired, roleRequired("admin", "manager"), (req, res) => {
    const { client_id, shipment_order, items } = req.body || {};
    if (!client_id) return res.status(400).json({ error: "Не указан клиент" });
    const so = ["no_install", "on_install", "before_install"].includes(shipment_order) ? shipment_order : "on_install";
    const list = Array.isArray(items) ? items : [];
    const total = list.reduce((s, i) => s + (i.price || 0) * (i.qty || 1), 0);
    const n = num("SO");
    const tx = db.transaction(() => {
      const id = db.prepare("INSERT INTO sales_orders (number, client_id, shipment_order, manager_id, total, status) VALUES (?,?,?,?,?,?)")
        .run(n, client_id, so, req.user.id, total, so === "no_install" ? "realized" : "new").lastInsertRowid;
      for (const it of list)
        db.prepare("INSERT INTO sales_order_items (order_id, name, is_service, qty, price, object_id) VALUES (?,?,?,?,?,?)")
          .run(id, it.name, it.is_service ? 1 : 0, it.qty || 1, it.price || 0, it.object_id || null);
      return id;
    });
    res.status(201).json({ id: tx(), number: n, shipment_order: so, total });
  });
  app.get("/api/sales-orders", authRequired, (_req, res) =>
    res.json(db.prepare("SELECT s.*, c.name client_name FROM sales_orders s JOIN clients c ON c.id=s.client_id ORDER BY s.id DESC").all()));

  // ---- Заказ-наряд ----
  app.post("/api/work-orders", authRequired, roleRequired("admin", "manager", "support", "head"), (req, res) => {
    const { client_id, object_id, request_id, planned_at } = req.body || {};
    const n = num("WO");
    const id = db.prepare("INSERT INTO work_orders (number, client_id, object_id, request_id, planned_at) VALUES (?,?,?,?,?)")
      .run(n, client_id || null, object_id || null, request_id || null, planned_at || null).lastInsertRowid;
    res.status(201).json({ id, number: n });
  });
  app.get("/api/work-orders", authRequired, (_req, res) =>
    res.json(db.prepare("SELECT * FROM work_orders ORDER BY id DESC").all()));

  // ---- Акт ТО: триггер биллинга ----
  app.post("/api/acts", authRequired, roleRequired("admin", "support", "installer"), (req, res) => {
    const { work_order_id, status, equipment_ids, plan_amount } = req.body || {};
    const wo = db.prepare("SELECT * FROM work_orders WHERE id=?").get(work_order_id);
    if (!wo) return res.status(404).json({ error: "Наряд не найден" });
    const st = status === "needs_rework" ? "needs_rework" : "done";

    if (st === "needs_rework") {
      const actId = db.prepare("INSERT INTO maintenance_acts (work_order_id, status, performed_by) VALUES (?,?,?)")
        .run(wo.id, st, req.user.id).lastInsertRowid;
      db.prepare("UPDATE work_orders SET status='rework' WHERE id=?").run(wo.id);
      return res.status(201).json({ act_id: actId, status: st });
    }

    const runTx = db.transaction(() => {
      const actId = db.prepare("INSERT INTO maintenance_acts (work_order_id, status, equipment_activated, billing_started_at, performed_by) VALUES (?,?,?,?,?)")
        .run(wo.id, "done", 1, new Date().toISOString(), req.user.id).lastInsertRowid;
      // активация оборудования
      const ids = Array.isArray(equipment_ids) ? equipment_ids : [];
      for (const eqId of ids)
        db.prepare("UPDATE equipment SET status='active', client_id=?, object_id=? WHERE id=?").run(wo.client_id, wo.object_id, eqId);
      // абонплата: план + счёт за текущий месяц
      let plan = db.prepare("SELECT * FROM subscription_plans WHERE client_id=? AND active=1").get(wo.client_id);
      if (!plan && plan_amount) {
        const pid = db.prepare("INSERT INTO subscription_plans (client_id, amount) VALUES (?,?)").run(wo.client_id, plan_amount).lastInsertRowid;
        plan = db.prepare("SELECT * FROM subscription_plans WHERE id=?").get(pid);
      }
      let invoiceId = null;
      if (plan) {
        invoiceId = db.prepare("INSERT INTO subscription_invoices (plan_id, client_id, period_start, period_end, amount, status) VALUES (?,?,?,?,?, 'issued')")
          .run(plan.id, wo.client_id, monthStart(), monthEnd(), plan.amount).lastInsertRowid;
      }
      db.prepare("UPDATE work_orders SET status='done' WHERE id=?").run(wo.id);
      return { actId, activated: ids.length, invoiceId };
    });
    const result = runTx();
    res.status(201).json({ act_id: result.actId, equipment_activated: result.activated, invoice_id: result.invoiceId, billing_started: true });
  });

  // ---- Абонплата ----
  app.get("/api/subscriptions/invoices", authRequired, (_req, res) =>
    res.json(db.prepare("SELECT i.*, c.name client_name FROM subscription_invoices i JOIN clients c ON c.id=i.client_id ORDER BY i.id DESC").all()));

  app.post("/api/subscriptions/cron", authRequired, roleRequired("admin", "accounting"), (_req, res) => {
    const ps = monthStart(), pe = monthEnd();
    const plans = db.prepare("SELECT * FROM subscription_plans WHERE active=1").all();
    let accrued = 0;
    for (const p of plans) {
      const exists = db.prepare("SELECT 1 FROM subscription_invoices WHERE plan_id=? AND period_start=?").get(p.id, ps);
      if (!exists) {
        db.prepare("INSERT INTO subscription_invoices (plan_id, client_id, period_start, period_end, amount, status) VALUES (?,?,?,?,?, 'to_accrue')")
          .run(p.id, p.client_id, ps, pe, p.amount);
        accrued++;
      }
    }
    res.json({ accrued });
  });

  // ---- SIM-карты ----
  app.post("/api/sim-cards", authRequired, roleRequired("admin", "support", "manager"), (req, res) => {
    const cards = (req.body && req.body.cards) || [];
    if (!Array.isArray(cards) || !cards.length) return res.status(400).json({ error: "Пустой список" });
    const ins = db.prepare("INSERT OR IGNORE INTO sim_cards (serial, msisdn, operator) VALUES (?,?,?)");
    let n = 0;
    const tx = db.transaction(() => { for (const c of cards) { ins.run(c.serial, c.msisdn || null, c.operator || null); n++; } });
    tx();
    res.status(201).json({ received: n });
  });
  app.get("/api/sim-cards", authRequired, (_req, res) => res.json({
    balance: db.prepare("SELECT status, COUNT(*) n FROM sim_cards GROUP BY status").all(),
    list: db.prepare("SELECT * FROM sim_cards ORDER BY id DESC LIMIT 500").all(),
  }));

  // ---- Авто-блокировка по задолженности (преимущество) ----
  app.post("/api/billing/auto-block", authRequired, roleRequired("admin", "accounting"), (req, res) => {
    const { threshold = 0, dry_run = true } = req.body || {};
    const debtors = db.prepare(`SELECT client_id, SUM(amount - paid_amount) debt FROM subscription_invoices
      WHERE status IN ('overdue','issued') AND paid_amount < amount GROUP BY client_id HAVING debt > ?`).all(threshold);
    let blocked = 0;
    if (!dry_run) {
      for (const d of debtors) {
        const r = db.prepare("UPDATE equipment SET status='disabled' WHERE client_id=? AND status='active'").run(d.client_id);
        blocked += r.changes;
      }
    }
    res.json({ debtors: debtors.length, equipment_blocked: blocked, dry_run });
  });
}

module.exports = { registerModules };
