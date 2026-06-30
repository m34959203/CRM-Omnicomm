// Смоук-тест API. Запуск: npm run seed && npm run smoke
const app = require("./server");
const assert = require("assert");

const server = app.listen(0, async () => {
  const base = `http://localhost:${server.address().port}`;
  const J = (r) => r.json();
  let pass = 0;
  const ok = (c, m) => { assert(c, m); console.log("  ✓ " + m); pass++; };

  try {
    ok((await fetch(base + "/api/health").then(J)).ok, "health отвечает");

    const login = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "support@omnicomm.kz", password: "demo1234" }) }).then(J);
    ok(login.token, "логин выдаёт токен");
    const H = { "Content-Type": "application/json", Authorization: "Bearer " + login.token };

    const bad = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "support@omnicomm.kz", password: "wrong" }) });
    ok(bad.status === 401, "неверный пароль → 401");

    const dash = await fetch(base + "/api/dashboard", { headers: H }).then(J);
    ok(typeof dash.total === "number" && dash.total > 0, "дашборд возвращает показатели");

    const list = await fetch(base + "/api/requests", { headers: H }).then(J);
    ok(Array.isArray(list) && list.length > 0, "список заявок не пуст");

    const created = await fetch(base + "/api/requests", { method: "POST", headers: H, body: JSON.stringify({ client_id: list[0].client_id, type: "Подключение оборудования", priority: "Высокий" }) }).then(J);
    ok(created.id && created.number, "заявка создаётся (№ " + created.number + ")");

    const r1 = await fetch(base + `/api/requests/${created.id}/status`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "Выполнена", result_comment: "Готово" }) });
    ok(r1.status === 422, "блокировка «Выполнена» без фото (правило фотоотчёта)");

    await fetch(base + `/api/requests/${created.id}/photos`, { method: "POST", headers: H, body: JSON.stringify({ kind: "фото результата", filename: "after.jpg" }) });
    const r2 = await fetch(base + `/api/requests/${created.id}/status`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "Выполнена", result_comment: "Оборудование подключено" }) });
    ok(r2.status === 200, "после фото статус «Выполнена» проходит");

    const created2 = await fetch(base + "/api/requests", { method: "POST", headers: H, body: JSON.stringify({ client_id: list[0].client_id, type: "Консультация клиента" }) }).then(J);
    const r3 = await fetch(base + `/api/requests/${created2.id}/status`, { method: "PATCH", headers: H, body: JSON.stringify({ status: "Закрыта" }) });
    ok(r3.status === 422, "блокировка закрытия без результата");

    const card = await fetch(base + `/api/requests/${created.id}`, { headers: H }).then(J);
    ok(card.history.length >= 2, "история действий фиксируется (" + card.history.length + " событий)");

    // ===== Этап 2: выезды монтажников =====
    const fr = await fetch(base + "/api/requests", { method: "POST", headers: H, body: JSON.stringify({ client_id: list[0].client_id, type: "Замена оборудования", priority: "Высокий" }) }).then(J);
    const instLogin = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "installer@omnicomm.kz", password: "demo1234" }) }).then(J);
    const HI = { "Content-Type": "application/json", Authorization: "Bearer " + instLogin.token };

    const rep0 = await fetch(base + "/api/reports/installers", { headers: H }).then(J);
    ok(Array.isArray(rep0) && rep0.length > 0, "отчёт по монтажникам доступен");

    const visit = await fetch(base + `/api/requests/${fr.id}/visit`, { method: "POST", headers: H, body: JSON.stringify({ installer_id: 4, planned_at: new Date().toISOString().slice(0,10) + " 14:00:00" }) }).then(J);
    ok(visit.visit_id, "выезд создаётся, заявка → «Запланирован выезд»");

    const s1 = await fetch(base + `/api/visits/${visit.visit_id}/step`, { method: "POST", headers: HI, body: JSON.stringify({ step: "depart", lat: 43.2, lng: 76.9 }) }).then(J);
    ok(s1.request_status === "Монтажник выехал", "этап «Выехал» → статус заявки и гео");
    const s2 = await fetch(base + `/api/visits/${visit.visit_id}/step`, { method: "POST", headers: HI, body: JSON.stringify({ step: "arrive", lat: 43.27, lng: 76.92 }) }).then(J);
    ok(s2.request_status === "Монтажник на объекте", "этап «Прибыл» → статус заявки");
    await fetch(base + `/api/visits/${visit.visit_id}/step`, { method: "POST", headers: HI, body: JSON.stringify({ step: "start" }) });

    const fbad = await fetch(base + `/api/visits/${visit.visit_id}/step`, { method: "POST", headers: HI, body: JSON.stringify({ step: "finish" }) });
    ok(fbad.status === 422, "завершение выезда без фото блокируется");

    await fetch(base + `/api/visits/${visit.visit_id}/photo`, { method: "POST", headers: HI, body: JSON.stringify({ kind: "фото результата", filename: "r.jpg" }) });
    const fok = await fetch(base + `/api/visits/${visit.visit_id}/step`, { method: "POST", headers: HI, body: JSON.stringify({ step: "finish" }) });
    ok(fok.status === 200, "после фото этап «Завершил» проходит, заявка → «Выполнена»");

    const cal = await fetch(base + "/api/visits", { headers: H }).then(J);
    ok(Array.isArray(cal) && cal.length > 0, "календарь выездов возвращает данные (" + cal.length + ")");

    const rep = await fetch(base + "/api/reports/installers", { headers: H }).then(J);
    const me = rep.find(x => x.assigned > 0);
    ok(me && me.avgArrivalMin != null, "отчёт считает среднее время прибытия (" + (me && me.avgArrivalMin) + " мин)");


    // ===== Доменные модули: продажа → наряд → Акт ТО → биллинг =====
    const adminLogin = await fetch(base + "/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "admin@omnicomm.kz", password: "demo1234" }) }).then(J);
    const HA = { "Content-Type": "application/json", Authorization: "Bearer " + adminLogin.token };

    const eq = await fetch(base + "/api/equipment", { method: "POST", headers: HA, body: JSON.stringify({ model: "Omnicomm Profi", serial: "SN-TEST-" + Date.now(), eq_type: "gps" }) }).then(J);
    ok(eq.id, "оборудование создаётся");

    const sale = await fetch(base + "/api/sales-orders", { method: "POST", headers: HA, body: JSON.stringify({ client_id: list[0].client_id, shipment_order: "on_install", items: [{ name: "Терминал", price: 50000 }, { name: "Установка", is_service: true, price: 15000 }] }) }).then(J);
    ok(sale.id && sale.total === 65000, "заказ клиента (при установке), сумма " + sale.total);

    const noInstall = await fetch(base + "/api/sales-orders", { method: "POST", headers: HA, body: JSON.stringify({ client_id: list[0].client_id, shipment_order: "no_install", items: [{ name: "Карта тахографа", price: 8000 }] }) }).then(J);
    ok(noInstall.shipment_order === "no_install", "заказ без установки — реализация сразу");

    const wo = await fetch(base + "/api/work-orders", { method: "POST", headers: HA, body: JSON.stringify({ client_id: list[0].client_id, object_id: null }) }).then(J);
    ok(wo.id && wo.number, "заказ-наряд создаётся (" + wo.number + ")");

    const act = await fetch(base + "/api/acts", { method: "POST", headers: HA, body: JSON.stringify({ work_order_id: wo.id, status: "done", equipment_ids: [eq.id], plan_amount: 45000 }) }).then(J);
    ok(act.equipment_activated === 1 && act.billing_started && act.invoice_id, "Акт ТО: оборуд. активно + старт биллинга + счёт");

    const repEq = await fetch(base + "/api/reports/equipment", { headers: HA }).then(J);
    const active = (repEq.byStatus.find(x => x.status === "active") || {}).n || 0;
    ok(active >= 1, "единый отчёт: активного оборуд. " + active);

    const cron = await fetch(base + "/api/subscriptions/cron", { method: "POST", headers: HA, body: "{}" }).then(J);
    ok(typeof cron.accrued === "number", "cron начисления абонплаты (accrued=" + cron.accrued + ")");

    const inv = await fetch(base + "/api/subscriptions/invoices", { headers: HA }).then(J);
    ok(Array.isArray(inv) && inv.length >= 1, "счета абонплаты есть (" + inv.length + ")");

    const sims = await fetch(base + "/api/sim-cards", { method: "POST", headers: HA, body: JSON.stringify({ cards: [{ serial: "SIM-" + Date.now() + "-1" }, { serial: "SIM-" + Date.now() + "-2" }] }) }).then(J);
    ok(sims.received === 2, "SIM-карты: пакетный ввод (" + sims.received + ")");

    const block = await fetch(base + "/api/billing/auto-block", { method: "POST", headers: HA, body: JSON.stringify({ threshold: 0, dry_run: true }) }).then(J);
    ok(typeof block.debtors === "number", "авто-блокировка по долгу (должников=" + block.debtors + ", dry-run)");

    console.log(`\nВсе проверки пройдены: ${pass}/${pass}`);
    server.close(); process.exit(0);
  } catch (e) {
    console.error("✗ Ошибка:", e.message);
    server.close(); process.exit(1);
  }
});
