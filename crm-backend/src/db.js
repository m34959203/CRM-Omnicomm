// Подключение к SQLite (dev). В проде заменяется на PostgreSQL — см. README.
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "crm.db");
const db = new Database(DB_PATH);
try { db.pragma("journal_mode = WAL"); } catch { /* некоторые ФС не поддерживают WAL */ }
db.pragma("foreign_keys = ON");

// ---- Справочники (из ТЗ) ----
const REQUEST_STATUSES = [
  "Новая", "Назначена", "В работе", "Запланирован выезд", "Монтажник выехал",
  "Монтажник на объекте", "Работы выполняются", "Ожидает клиента", "Ожидает оборудование",
  "Выполнена", "На проверке", "Закрыта", "Просрочена", "Отменена"
];
const REQUEST_TYPES = [
  "Подключение оборудования", "Демонтаж оборудования", "Замена оборудования",
  "Диагностика оборудования", "Неисправность GPS-оборудования", "Неисправность датчика топлива",
  "Неисправность видеонаблюдения", "Настройка мониторинга", "Консультация клиента",
  "Обучение клиента", "Интеграция", "Power BI / отчётность", "Коммерческий запрос",
  "Вопрос по оплате", "Вопрос по документам", "Прочее"
];
const PHOTO_REQUIRED_TYPES = [
  "Подключение оборудования", "Демонтаж оборудования", "Замена оборудования",
  "Диагностика оборудования", "Неисправность GPS-оборудования", "Неисправность датчика топлива",
  "Неисправность видеонаблюдения", "Настройка мониторинга"
];
const INSTALLER_STATUSES = [
  "свободен", "назначен на заявку", "в пути", "на объекте", "выполняет работы",
  "ожидает клиента", "ожидает оборудование", "завершил работы", "недоступен", "выходной"
];
const VISIT_STEPS = {
  accept:  { label: "Принял заявку",    req: "Назначена",            inst: "назначен на заявку" },
  depart:  { label: "Выехал",           req: "Монтажник выехал",     inst: "в пути" },
  arrive:  { label: "Прибыл на объект", req: "Монтажник на объекте", inst: "на объекте" },
  start:   { label: "Начал работы",     req: "Работы выполняются",   inst: "выполняет работы" },
  finish:  { label: "Завершил работы",  req: "Выполнена",            inst: "завершил работы" }
};

function init() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, full_name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
    phone TEXT, role_id INTEGER NOT NULL, password_hash TEXT NOT NULL,
    active INTEGER DEFAULT 1, region TEXT, installer_status TEXT DEFAULT 'свободен',
    FOREIGN KEY(role_id) REFERENCES roles(id)
  );
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, bin_iin TEXT, phone TEXT, email TEXT,
    manager_id INTEGER, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(manager_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS objects (
    id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL, name TEXT, address TEXT,
    lat REAL, lng REAL, contact_person TEXT, contact_phone TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL,
    client_id INTEGER NOT NULL, object_id INTEGER,
    type TEXT NOT NULL, priority TEXT DEFAULT 'Обычный',
    source TEXT, subject TEXT, description TEXT,
    status TEXT NOT NULL DEFAULT 'Новая',
    manager_id INTEGER, support_id INTEGER, installer_id INTEGER,
    due_at TEXT, result_comment TEXT,
    created_at TEXT DEFAULT (datetime('now')), closed_at TEXT,
    FOREIGN KEY(client_id) REFERENCES clients(id),
    FOREIGN KEY(object_id) REFERENCES objects(id)
  );
  CREATE TABLE IF NOT EXISTS request_history (
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL,
    action TEXT NOT NULL, detail TEXT, user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(request_id) REFERENCES requests(id)
  );
  CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL,
    kind TEXT, filename TEXT, url TEXT, user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(request_id) REFERENCES requests(id)
  );
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL, installer_id INTEGER NOT NULL,
    planned_at TEXT, status TEXT DEFAULT 'назначен на заявку',
    repeat_of INTEGER, created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(request_id) REFERENCES requests(id),
    FOREIGN KEY(installer_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS visit_steps (
    id INTEGER PRIMARY KEY, visit_id INTEGER NOT NULL,
    step TEXT NOT NULL, lat REAL, lng REAL, user_id INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(visit_id) REFERENCES visits(id)
  );
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY, direction TEXT, phone TEXT, client_id INTEGER, request_id INTEGER,
    user_id INTEGER, duration_sec INTEGER, recording_url TEXT, result TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY, channel TEXT, direction TEXT DEFAULT 'in', contact TEXT,
    client_id INTEGER, request_id INTEGER, text TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY(client_id) REFERENCES clients(id)
  );
  CREATE TABLE IF NOT EXISTS warehouses (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'physical', holder_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS equipment (
    id INTEGER PRIMARY KEY, model TEXT NOT NULL, serial TEXT UNIQUE, eq_type TEXT,
    status TEXT NOT NULL DEFAULT 'new', warehouse_id INTEGER, holder_id INTEGER,
    client_id INTEGER, object_id INTEGER, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sales_orders (
    id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id INTEGER NOT NULL,
    shipment_order TEXT NOT NULL DEFAULT 'on_install', status TEXT NOT NULL DEFAULT 'new',
    manager_id INTEGER, total REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sales_order_items (
    id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL, name TEXT NOT NULL,
    is_service INTEGER DEFAULT 0, qty REAL DEFAULT 1, price REAL DEFAULT 0, object_id INTEGER
  );
  CREATE TABLE IF NOT EXISTS work_orders (
    id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL, client_id INTEGER, object_id INTEGER,
    request_id INTEGER, status TEXT NOT NULL DEFAULT 'planned', planned_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS maintenance_acts (
    id INTEGER PRIMARY KEY, work_order_id INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'done',
    equipment_activated INTEGER DEFAULT 0, billing_started_at TEXT, performed_by INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS subscription_plans (
    id INTEGER PRIMARY KEY, client_id INTEGER NOT NULL, amount REAL NOT NULL,
    period TEXT DEFAULT 'month', active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS subscription_invoices (
    id INTEGER PRIMARY KEY, plan_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
    period_start TEXT, period_end TEXT, amount REAL NOT NULL, paid_amount REAL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'issued', created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sim_cards (
    id INTEGER PRIMARY KEY, serial TEXT UNIQUE NOT NULL, msisdn TEXT, operator TEXT,
    status TEXT NOT NULL DEFAULT 'in_stock', created_at TEXT DEFAULT (datetime('now'))
  );
  `);
}

module.exports = { db, init, REQUEST_STATUSES, REQUEST_TYPES, PHOTO_REQUIRED_TYPES, INSTALLER_STATUSES, VISIT_STEPS };
