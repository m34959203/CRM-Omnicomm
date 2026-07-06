/**
 * Миграция данных легаси-прода crm-backend (SQLite) → PostgreSQL (схема app/db/migrations).
 *
 * Запуск:
 *   npm run db:migrate-legacy                       # источник ../crm-backend/crm.db
 *   npm run db:migrate-legacy -- /path/to/crm.db    # явный путь к SQLite
 *   npm run db:migrate-legacy -- --wipe             # TRUNCATE мигрируемых таблиц перед заливкой
 *
 * Целевая БД — env DATABASE_URL (подхватывается из app/.env, если не задан).
 *
 * Идемпотентность:
 *  - crosswalk старых INTEGER PK → UUID хранится в служебной таблице legacy_map
 *    (entity, legacy_key → new_id); повторный прогон пропускает уже перенесённые строки;
 *  - для таблиц с натуральными ключами (roles.code, users.email, requests.number,
 *    sales_orders.number, work_orders.number, sim_cards.icc) существующие строки
 *    «усыновляются» (adopt) в crosswalk без вставки;
 *  - --wipe: TRUNCATE ... CASCADE мигрируемых таблиц (кроме users/roles) + очистка legacy_map.
 *
 * Русские статусы/типы перекодируются в англ. коды (карты из docs/DATA-MODEL.md,
 * порядок соответствует справочникам crm-backend/src/db.js и migration-020 liftplatform).
 * Неизвестное значение не роняет скрипт: берётся ближайший разумный код, факт пишется
 * в отчёт и (где есть текстовое поле) дописывается пометкой «[миграция] ...».
 */

import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(__dirname, "..");
const require_ = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// CLI / env
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const WIPE = args.includes("--wipe");
const sqlitePath = resolve(
  args.find((a) => !a.startsWith("--")) ?? join(APP_ROOT, "..", "crm-backend", "crm.db")
);

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(join(APP_ROOT, ".env"));
  } catch {
    /* .env отсутствует — ниже упадём с понятной ошибкой */
  }
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL не задан (env или app/.env)");
  process.exit(1);
}
if (!existsSync(sqlitePath)) {
  console.error(`SQLite-файл не найден: ${sqlitePath}`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Чтение SQLite: node:sqlite (Node 24), фолбэк — better-sqlite3 из crm-backend
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
interface LegacyDb {
  all(sql: string, ...params: unknown[]): Row[];
  close(): void;
}

function openLegacy(path: string): LegacyDb {
  try {
    const { DatabaseSync } = require_("node:sqlite");
    const db = new DatabaseSync(path, { readOnly: true });
    // проверочный запрос — если файл не читается, уйдём в фолбэк
    db.prepare("SELECT 1 FROM sqlite_master LIMIT 1").get();
    console.log("SQLite-ридер: node:sqlite");
    return {
      all: (sql, ...params) => db.prepare(sql).all(...params) as Row[],
      close: () => db.close(),
    };
  } catch (e) {
    console.warn(`node:sqlite недоступен (${(e as Error).message}), пробую better-sqlite3`);
    const Database = require_(join(APP_ROOT, "..", "crm-backend", "node_modules", "better-sqlite3"));
    const db = new Database(path, { readonly: true });
    console.log("SQLite-ридер: better-sqlite3 (crm-backend/node_modules)");
    return {
      all: (sql, ...params) => db.prepare(sql).all(...params) as Row[],
      close: () => db.close(),
    };
  }
}

// ---------------------------------------------------------------------------
// Карты перекодировки RU → EN (docs/DATA-MODEL.md, migration-020)
// ---------------------------------------------------------------------------

const REQUEST_TYPE_MAP: Record<string, string> = {
  "Подключение оборудования": "connect",
  "Демонтаж оборудования": "dismantle",
  "Замена оборудования": "replace",
  "Диагностика оборудования": "diagnostics",
  "Неисправность GPS-оборудования": "gps_fault",
  "Неисправность датчика топлива": "fuel_sensor_fault",
  "Неисправность видеонаблюдения": "cctv_fault",
  "Настройка мониторинга": "monitoring_setup",
  "Консультация клиента": "consultation",
  "Обучение клиента": "training",
  "Интеграция": "integration",
  "Power BI / отчётность": "bi_reporting",
  "Коммерческий запрос": "commercial",
  "Вопрос по оплате": "payment_question",
  "Вопрос по документам": "docs_question",
  "Прочее": "other",
};
const REQUEST_TYPES = new Set(Object.values(REQUEST_TYPE_MAP));
// типы с обязательным фотоотчётом (PHOTO_REQUIRED_TYPES из crm-backend/src/db.js)
const PHOTO_REQUIRED = new Set([
  "connect", "dismantle", "replace", "diagnostics",
  "gps_fault", "fuel_sensor_fault", "cctv_fault", "monitoring_setup",
]);

const REQUEST_STATUS_MAP: Record<string, string> = {
  "Новая": "new",
  "Назначена": "assigned",
  "В работе": "in_progress",
  "Запланирован выезд": "visit_planned",
  "Монтажник выехал": "installer_departed",
  "Монтажник на объекте": "installer_on_site",
  "Работы выполняются": "working",
  "Ожидает клиента": "wait_client",
  "Ожидает оборудование": "wait_parts",
  "Выполнена": "completed",
  "На проверке": "in_review",
  "Закрыта": "closed",
  "Просрочена": "overdue",
  "Отменена": "cancelled",
};
const REQUEST_STATUSES = new Set(Object.values(REQUEST_STATUS_MAP));

const PRIORITY_MAP: Record<string, string> = {
  "Низкий": "low",
  "Обычный": "normal",
  "Высокий": "high",
  "Критичный": "critical",
  "Критический": "critical",
};
const PRIORITIES = new Set(["low", "normal", "high", "critical"]);

const SOURCE_MAP: Record<string, string> = {
  "Телефон": "phone",
  "Звонок": "phone",
  "WhatsApp": "whatsapp",
  "Telegram": "telegram",
  "Email": "email",
  "Почта": "email",
  "Сайт": "site",
  "Чат": "chat",
  "Вручную": "manual",
};
const SOURCES = new Set(["phone", "whatsapp", "telegram", "email", "site", "chat", "manual"]);

const INSTALLER_STATUS_MAP: Record<string, string> = {
  "свободен": "free",
  "назначен на заявку": "assigned",
  "в пути": "en_route",
  "на объекте": "on_site",
  "выполняет работы": "working",
  "ожидает клиента": "wait_client",
  "ожидает оборудование": "wait_parts",
  "завершил работы": "done",
  "недоступен": "unavailable",
  "выходной": "day_off",
};
const INSTALLER_STATUSES = new Set(Object.values(INSTALLER_STATUS_MAP));

// visits.status в новой схеме — подмножество (нет free/unavailable/day_off, есть cancelled)
const VISIT_STATUSES = new Set([
  "assigned", "en_route", "on_site", "working", "wait_client", "wait_parts", "done", "cancelled",
]);

const VISIT_STEPS = new Set(["accept", "depart", "arrive", "start", "finish", "cant_do", "repeat"]);

// роли: легаси-код management («Руководство») → boss; остальные совпадают
const ROLE_CODE_MAP: Record<string, string> = { management: "boss" };
const ROLE_CODES = new Set(["admin", "manager", "support", "installer", "head", "accounting", "boss"]);

const CALL_DIRECTION_MAP: Record<string, string> = {
  "входящий": "incoming", "Входящий": "incoming", "in": "incoming", "inbound": "incoming",
  "исходящий": "outgoing", "Исходящий": "outgoing", "out": "outgoing", "outbound": "outgoing",
  "пропущенный": "missed", "Пропущенный": "missed",
};
const CALL_DIRECTIONS = new Set(["incoming", "outgoing", "missed"]);

const MESSAGE_CHANNELS = new Set(["whatsapp", "telegram", "email", "site", "chat", "sms"]);
const MESSAGE_CHANNEL_MAP: Record<string, string> = {
  "WhatsApp": "whatsapp", "Telegram": "telegram", "Email": "email", "Почта": "email",
  "Сайт": "site", "Чат": "chat", "SMS": "sms",
};

const WAREHOUSE_TYPES = new Set(["physical", "technician", "contractor", "testing", "supplier", "virtual"]);

// equipment.status (легаси смешивает состояние и размещение)
//   new/used  → на складе, condition new/used
//   active    → установлено у клиента, биллинг активен
const EQUIPMENT_STATUSES = new Set([
  "in_stock", "with_technician", "on_testing", "at_supplier", "installed", "reserved", "written_off",
]);

const DEVICE_TYPE_MAP: Record<string, string> = {
  gps: "gps_terminal",
  fuel_sensor: "fuel_sensor",
  cctv: "cctv",
};

const SIM_STATUSES = new Set(["in_stock", "assigned", "installed", "suspended", "written_off"]);
const SIM_OPERATOR_CODE: [RegExp, string][] = [
  [/beeline|билайн/i, "beeline_kz"],
  [/kcell|activ|кселл/i, "kcell"],
  [/tele2|altel|алтел/i, "tele2_altel"],
  [/izi/i, "izi"],
];

const SO_SHIPMENT = new Set(["no_install", "on_install", "before_install"]);
const SO_STATUSES = new Set(["new", "invoiced", "paid", "in_service", "realized", "cancelled"]);
const WO_STATUSES = new Set(["draft", "planned", "in_progress", "done", "rework", "cancelled"]);
const ACT_STATUSES = new Set(["in_preparation", "done", "needs_rework", "cancelled"]);
const INVOICE_STATUSES = new Set([
  "to_accrue", "prepared", "issued", "sent", "partial", "paid", "overdue", "cancelled",
]);
const ATTACHMENT_KINDS = new Set(["photo", "document", "signature", "audio"]);

// ---------------------------------------------------------------------------
// Утилиты
// ---------------------------------------------------------------------------

/** SQLite datetime('now') хранит наивный UTC 'YYYY-MM-DD HH:MM:SS' → ISO с Z. */
function ts(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) return s.replace(" ", "T") + "Z";
  return s; // уже ISO ('...Z') либо дата 'YYYY-MM-DD'
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const str = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

const bool = (v: unknown): boolean => v === 1 || v === true || v === "1";

const lastNumber = (s: string | null): number | null => {
  const m = s?.match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
};

interface TableStat { inserted: number; skipped: number; errors: number }
const stats = new Map<string, TableStat>();
const issues: string[] = [];

function stat(table: string): TableStat {
  let s = stats.get(table);
  if (!s) { s = { inserted: 0, skipped: 0, errors: 0 }; stats.set(table, s); }
  return s;
}

function issue(msg: string) {
  issues.push(msg);
  console.warn(`  ! ${msg}`);
}

/**
 * Перекодировка enum: карта RU→EN, англ. значения из allowed проходят как есть,
 * неизвестное → fallback + запись в отчёт.
 */
function mapEnum(
  ctx: string,
  raw: unknown,
  map: Record<string, string>,
  allowed: Set<string>,
  fallback: string
): { code: string; unknown: boolean } {
  const v = str(raw);
  if (v === null) return { code: fallback, unknown: false };
  const mapped = map[v] ?? map[v.trim()];
  if (mapped) return { code: mapped, unknown: false };
  if (allowed.has(v)) return { code: v, unknown: false };
  issue(`${ctx}: неизвестное значение «${v}» → «${fallback}»`);
  return { code: fallback, unknown: true };
}

// ---------------------------------------------------------------------------
// Основной прогон
// ---------------------------------------------------------------------------

async function main() {
  const legacy = openLegacy(sqlitePath);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const pg = await pool.connect();
  console.log(`Источник: ${sqlitePath}`);
  console.log(`Приёмник: ${process.env.DATABASE_URL!.replace(/:[^:@/]+@/, ":***@")}`);

  // crosswalk старых id → uuid (персистентный — обеспечивает идемпотентность повторов)
  await pg.query(`
    CREATE TABLE IF NOT EXISTS legacy_map (
      entity     text NOT NULL,
      legacy_key text NOT NULL,
      new_id     uuid NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (entity, legacy_key)
    )`);

  await pg.query("BEGIN");
  try {
    if (WIPE) {
      console.log("--wipe: очистка мигрируемых таблиц (users/roles не трогаем)");
      await pg.query(`
        TRUNCATE accruals, billing_documents, tariffs, sales_invoices, sales_order_items,
                 sales_orders, maintenance_acts, work_order_performers, work_orders,
                 visit_steps, visits, attachments, request_history, requests,
                 equipment_state_history, equipment_movements, equipment_items,
                 sim_cards, warehouses, monitoring_objects,
                 counterparty_bank_accounts, counterparties, client_contacts, contracts,
                 clients, calls, messages, legacy_map
        CASCADE`);
    }

    const xwalk = new Map<string, string>(); // entity:key → uuid
    {
      const r = await pg.query(`SELECT entity, legacy_key, new_id FROM legacy_map`);
      for (const row of r.rows) xwalk.set(`${row.entity}:${row.legacy_key}`, row.new_id);
    }
    const idOf = (entity: string, key: unknown): string | null =>
      key === null || key === undefined ? null : xwalk.get(`${entity}:${key}`) ?? null;

    async function remember(entity: string, key: unknown, uuid: string) {
      xwalk.set(`${entity}:${key}`, uuid);
      await pg.query(
        `INSERT INTO legacy_map (entity, legacy_key, new_id) VALUES ($1,$2,$3)
         ON CONFLICT (entity, legacy_key) DO NOTHING`,
        [entity, String(key), uuid]
      );
    }

    /** Вставка одной строки под SAVEPOINT: ошибка не роняет весь прогон. */
    async function insertRow(
      table: string,
      entity: string,
      key: unknown,
      sql: string,
      params: unknown[],
      label?: string
    ): Promise<string | null> {
      const s = stat(table);
      if (idOf(entity, key)) { s.skipped++; return idOf(entity, key); }
      await pg.query("SAVEPOINT sp");
      try {
        const r = await pg.query(sql, params);
        await pg.query("RELEASE SAVEPOINT sp");
        if (r.rows.length === 0) { s.skipped++; return null; } // ON CONFLICT DO NOTHING сработал
        const uuid = r.rows[0].id as string;
        await remember(entity, key, uuid);
        s.inserted++;
        return uuid;
      } catch (e) {
        await pg.query("ROLLBACK TO SAVEPOINT sp");
        s.errors++;
        issue(`${table} [${label ?? `${entity}#${key}`}]: ${(e as Error).message}`);
        return null;
      }
    }

    /** Усыновление существующей строки по натуральному ключу (в crosswalk, без вставки). */
    async function adopt(entity: string, key: unknown, sql: string, params: unknown[]) {
      if (idOf(entity, key)) return;
      const r = await pg.query(sql, params);
      if (r.rows.length > 0) await remember(entity, key, r.rows[0].id);
    }

    // ---------------- 1. roles ----------------
    console.log("→ roles");
    for (const r of legacy.all(`SELECT * FROM roles ORDER BY id`)) {
      const rawCode = String(r.code);
      const code = ROLE_CODE_MAP[rawCode] ?? rawCode;
      if (!ROLE_CODES.has(code)) issue(`roles #${r.id}: код «${rawCode}» вне канонического набора, переносится как есть`);
      if (ROLE_CODE_MAP[rawCode]) issue(`roles #${r.id}: код «${rawCode}» («${r.name}») → «${code}»`);
      await adopt("role", r.id, `SELECT id FROM roles WHERE code = $1`, [code]);
      await insertRow(
        "roles", "role", r.id,
        `INSERT INTO roles (code, name) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING RETURNING id`,
        [code, r.name]
      );
    }

    // ---------------- 2. users ----------------
    console.log("→ users");
    for (const u of legacy.all(`SELECT * FROM users ORDER BY id`)) {
      await adopt("user", u.id, `SELECT id FROM users WHERE email = $1`, [u.email]);
      const roleId = idOf("role", u.role_id);
      if (!roleId && !idOf("user", u.id)) {
        stat("users").errors++;
        issue(`users #${u.id} (${u.email}): роль role_id=${u.role_id} не найдена — пропуск`);
        continue;
      }
      const st = mapEnum(`users #${u.id} installer_status`, u.installer_status,
        INSTALLER_STATUS_MAP, INSTALLER_STATUSES, "free");
      await insertRow(
        "users", "user", u.id,
        `INSERT INTO users (full_name, email, phone, role_id, password_hash, is_active, region, installer_status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (email) DO NOTHING RETURNING id`,
        [u.full_name, u.email, u.phone, roleId, u.password_hash, bool(u.active), u.region, st.code],
        String(u.email)
      );
    }

    // ---------------- 3. clients (+counterparties) ----------------
    console.log("→ clients / counterparties");
    for (const c of legacy.all(`SELECT * FROM clients ORDER BY id`)) {
      const clientId = await insertRow(
        "clients", "client", c.id,
        `INSERT INTO clients (name, phone, email, manager_id, created_at)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, now())) RETURNING id`,
        [c.name, c.phone, c.email, idOf("user", c.manager_id), ts(c.created_at)],
        String(c.name)
      );
      const cid = clientId ?? idOf("client", c.id);
      const binIin = str(c.bin_iin);
      if (cid && binIin) {
        const name = String(c.name);
        const legalForm =
          /^ТОО\b|^ТОО\s|«?ТОО/.test(name) ? "TOO" :
          /^ИП\b/.test(name) ? "IP" :
          /^АО\b/.test(name) ? "AO" :
          /^ГУ\b/.test(name) ? "GU" :
          /^КГП\b/.test(name) ? "KGP" :
          /^НАО\b/.test(name) ? "NAO" : null;
        await insertRow(
          "counterparties", "counterparty", c.id,
          `INSERT INTO counterparties (client_id, name, legal_form, bin_iin, phone, email)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
          [cid, c.name, legalForm, binIin, c.phone, c.email],
          String(c.name)
        );
      }
    }

    // ---------------- 4. objects → monitoring_objects ----------------
    console.log("→ monitoring_objects");
    // KZ-госномера: «123ABC02», «A123BCD», «123 ABC 02»
    const plateRe = /\b(\d{3}\s?[A-Z]{2,3}\s?\d{2}|[A-Z]\d{3}[A-Z]{2,3})\b/i;
    for (const o of legacy.all(`SELECT * FROM objects ORDER BY id`)) {
      const clientId = idOf("client", o.client_id);
      if (!clientId) {
        stat("monitoring_objects").errors++;
        issue(`objects #${o.id}: client_id=${o.client_id} не найден — пропуск`);
        continue;
      }
      const name = str(o.name) ?? `Объект #${o.id}`;
      const plate = name.match(plateRe)?.[1] ?? null;
      const kind = plate
        ? "vehicle"
        : /гараж|склад|офис|база|цех|стоянк|двор/i.test(name) ? "stationary" : "other";
      await insertRow(
        "monitoring_objects", "object", o.id,
        `INSERT INTO monitoring_objects (client_id, name, kind, reg_number, address, lat, lng, contact_person, contact_phone)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [clientId, name, kind, plate, o.address, num(o.lat), num(o.lng), o.contact_person, o.contact_phone],
        name
      );
    }

    // ---------------- 5. requests ----------------
    console.log("→ requests");
    for (const r of legacy.all(`SELECT * FROM requests ORDER BY id`)) {
      await adopt("request", r.id, `SELECT id FROM requests WHERE number = $1`, [r.number]);
      const clientId = idOf("client", r.client_id);
      if (!clientId && !idOf("request", r.id)) {
        stat("requests").errors++;
        issue(`requests #${r.id} (${r.number}): client_id=${r.client_id} не найден — пропуск`);
        continue;
      }
      const type = mapEnum(`requests ${r.number} type`, r.type, REQUEST_TYPE_MAP, REQUEST_TYPES, "other");
      const status = mapEnum(`requests ${r.number} status`, r.status, REQUEST_STATUS_MAP, REQUEST_STATUSES, "new");
      const priority = mapEnum(`requests ${r.number} priority`, r.priority, PRIORITY_MAP, PRIORITIES, "normal");
      const source = str(r.source) === null
        ? { code: null as string | null, unknown: false }
        : mapEnum(`requests ${r.number} source`, r.source, SOURCE_MAP, SOURCES, "manual");
      let description = str(r.description);
      const notes: string[] = [];
      if (type.unknown) notes.push(`тип: «${r.type}»`);
      if (status.unknown) notes.push(`статус: «${r.status}»`);
      if (priority.unknown) notes.push(`приоритет: «${r.priority}»`);
      if (source.unknown) notes.push(`источник: «${r.source}»`);
      if (notes.length)
        description = `${description ?? ""}\n[миграция] исходные значения — ${notes.join("; ")}`.trim();
      await insertRow(
        "requests", "request", r.id,
        `INSERT INTO requests (number, client_id, object_id, type, priority, source, subject, description,
                               status, manager_id, support_id, installer_id, photo_required,
                               due_at, result_comment, closed_at, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16, COALESCE($17::timestamptz, now()))
         ON CONFLICT (number) DO NOTHING RETURNING id`,
        [r.number, clientId, idOf("object", r.object_id), type.code, priority.code, source.code,
         r.subject, description, status.code,
         idOf("user", r.manager_id), idOf("user", r.support_id), idOf("user", r.installer_id),
         PHOTO_REQUIRED.has(type.code), ts(r.due_at), r.result_comment, ts(r.closed_at), ts(r.created_at)],
        String(r.number)
      );
    }

    // ---------------- 6. request_history ----------------
    console.log("→ request_history");
    for (const h of legacy.all(`SELECT * FROM request_history ORDER BY id`)) {
      const requestId = idOf("request", h.request_id);
      if (!requestId) {
        stat("request_history").errors++;
        issue(`request_history #${h.id}: заявка ${h.request_id} не найдена — пропуск`);
        continue;
      }
      await insertRow(
        "request_history", "request_history", h.id,
        `INSERT INTO request_history (request_id, action, detail, user_id, created_at)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, now())) RETURNING id`,
        [requestId, h.action, h.detail, idOf("user", h.user_id), ts(h.created_at)]
      );
    }

    // ---------------- 7. attachments ----------------
    console.log("→ attachments");
    for (const a of legacy.all(`SELECT * FROM attachments ORDER BY id`)) {
      const requestId = idOf("request", a.request_id);
      if (!requestId) {
        stat("attachments").errors++;
        issue(`attachments #${a.id}: заявка ${a.request_id} не найдена — пропуск`);
        continue;
      }
      const rawKind = str(a.kind)?.toLowerCase() ?? "";
      let kind = "photo";
      if (ATTACHMENT_KINDS.has(rawKind)) kind = rawKind;
      else if (rawKind.includes("подпис") || rawKind.includes("signature")) kind = "signature";
      else if (rawKind.includes("документ") || rawKind.includes("document")) kind = "document";
      else if (rawKind.includes("аудио") || rawKind.includes("audio")) kind = "audio";
      else if (!rawKind.includes("фото") && rawKind !== "")
        issue(`attachments #${a.id}: kind «${a.kind}» → «photo»`);
      let url = str(a.url);
      if (url === null) {
        url = "";
        issue(`attachments #${a.id} (${a.filename ?? "без имени"}): url отсутствует — записан пустым`);
      }
      await insertRow(
        "attachments", "attachment", a.id,
        `INSERT INTO attachments (entity_type, entity_id, kind, filename, url, uploaded_by, created_at)
         VALUES ('request',$1,$2,$3,$4,$5, COALESCE($6::timestamptz, now())) RETURNING id`,
        [requestId, kind, a.filename, url, idOf("user", a.user_id), ts(a.created_at)]
      );
    }

    // ---------------- 8. visits (legacy-связь на заявку, work_order_id = NULL) --------
    console.log("→ visits");
    for (const v of legacy.all(`SELECT * FROM visits ORDER BY id`)) {
      const requestId = idOf("request", v.request_id);
      const installerId = idOf("user", v.installer_id);
      if (!requestId || !installerId) {
        stat("visits").errors++;
        issue(`visits #${v.id}: заявка/монтажник не найдены — пропуск`);
        continue;
      }
      let status = mapEnum(`visits #${v.id} status`, v.status, INSTALLER_STATUS_MAP, VISIT_STATUSES, "assigned").code;
      if (!VISIT_STATUSES.has(status)) {
        issue(`visits #${v.id}: статус «${v.status}» (${status}) вне набора визитов → «assigned»`);
        status = "assigned";
      }
      await insertRow(
        "visits", "visit", v.id,
        `INSERT INTO visits (request_id, installer_id, planned_at, status, created_at)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, now())) RETURNING id`,
        [requestId, installerId, ts(v.planned_at), status, ts(v.created_at)]
      );
    }
    // второй проход: repeat_of (само-ссылка)
    for (const v of legacy.all(`SELECT id, repeat_of FROM visits WHERE repeat_of IS NOT NULL`)) {
      const self = idOf("visit", v.id);
      const repeatOf = idOf("visit", v.repeat_of);
      if (self && repeatOf)
        await pg.query(`UPDATE visits SET repeat_of = $2 WHERE id = $1 AND repeat_of IS NULL`, [self, repeatOf]);
      else if (self) issue(`visits #${v.id}: repeat_of=${v.repeat_of} не найден`);
    }

    // ---------------- 9. visit_steps ----------------
    console.log("→ visit_steps");
    for (const sRow of legacy.all(`SELECT * FROM visit_steps ORDER BY id`)) {
      const visitId = idOf("visit", sRow.visit_id);
      if (!visitId) {
        stat("visit_steps").errors++;
        issue(`visit_steps #${sRow.id}: визит ${sRow.visit_id} не найден — пропуск`);
        continue;
      }
      let step = String(sRow.step);
      if (!VISIT_STEPS.has(step)) {
        issue(`visit_steps #${sRow.id}: шаг «${step}» → «accept»`);
        step = "accept";
      }
      await insertRow(
        "visit_steps", "visit_step", sRow.id,
        `INSERT INTO visit_steps (visit_id, step, lat, lng, user_id, created_at)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now())) RETURNING id`,
        [visitId, step, num(sRow.lat), num(sRow.lng), idOf("user", sRow.user_id), ts(sRow.created_at)]
      );
    }

    // ---------------- 10. calls ----------------
    console.log("→ calls");
    for (const c of legacy.all(`SELECT * FROM calls ORDER BY id`)) {
      const dir = mapEnum(`calls #${c.id} direction`, c.direction, CALL_DIRECTION_MAP, CALL_DIRECTIONS, "incoming");
      await insertRow(
        "calls", "call", c.id,
        `INSERT INTO calls (direction, phone, client_id, request_id, user_id, duration_sec, recording_url, result, created_at)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6,0), $7,$8, COALESCE($9::timestamptz, now())) RETURNING id`,
        [dir.code, str(c.phone) ?? "", idOf("client", c.client_id), idOf("request", c.request_id),
         idOf("user", c.user_id), num(c.duration_sec), c.recording_url, c.result, ts(c.created_at)]
      );
    }

    // ---------------- 11. messages ----------------
    console.log("→ messages");
    for (const m of legacy.all(`SELECT * FROM messages ORDER BY id`)) {
      const channel = mapEnum(`messages #${m.id} channel`, m.channel, MESSAGE_CHANNEL_MAP, MESSAGE_CHANNELS, "chat");
      const direction = str(m.direction) === "out" ? "out" : "in";
      await insertRow(
        "messages", "message", m.id,
        `INSERT INTO messages (channel, direction, contact, client_id, request_id, text, created_at)
         VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now())) RETURNING id`,
        [channel.code, direction, m.contact, idOf("client", m.client_id), idOf("request", m.request_id),
         m.text, ts(m.created_at)]
      );
    }

    // ---------------- 12. warehouses ----------------
    console.log("→ warehouses");
    for (const w of legacy.all(`SELECT * FROM warehouses ORDER BY id`)) {
      const type = mapEnum(`warehouses #${w.id} type`, w.type, {}, WAREHOUSE_TYPES, "physical");
      await insertRow(
        "warehouses", "warehouse", w.id,
        `INSERT INTO warehouses (name, type, holder_id) VALUES ($1,$2,$3) RETURNING id`,
        [w.name, type.code, idOf("user", w.holder_id)],
        String(w.name)
      );
    }

    // ---------------- 13. equipment → nomenclature + equipment_items (+state history) --
    console.log("→ nomenclature / equipment_items / equipment_state_history");
    const equipmentRows = legacy.all(`SELECT * FROM equipment ORDER BY id`);
    for (const e of equipmentRows) {
      const model = str(e.model) ?? "Оборудование (без модели)";
      const eqType = str(e.eq_type);
      const nomKey = `${model}|${eqType ?? ""}`;
      // номенклатура по (модель, тип): усыновляем совпадение по имени
      if (!idOf("nomenclature", nomKey)) {
        const existing = await pg.query(
          `SELECT id FROM nomenclature WHERE lower(name) = lower($1) AND kind = 'equipment' LIMIT 1`, [model]);
        if (existing.rows.length > 0) await remember("nomenclature", nomKey, existing.rows[0].id);
      }
      let nomId = idOf("nomenclature", nomKey);
      if (!nomId) {
        const deviceType = eqType ? (DEVICE_TYPE_MAP[eqType] ?? eqType) : null;
        if (eqType && !DEVICE_TYPE_MAP[eqType])
          issue(`equipment #${e.id}: eq_type «${eqType}» не в карте типов устройств — перенесён как есть`);
        nomId = await insertRow(
          "nomenclature", "nomenclature", nomKey,
          `INSERT INTO nomenclature (kind, name, is_serial_tracked, device_type)
           VALUES ('equipment', $1, true, $2) RETURNING id`,
          [model, deviceType], model
        );
      } else {
        stat("nomenclature"); // таблица в отчёте даже если всё усыновлено
      }
      if (!nomId) { stat("equipment_items").errors++; continue; }

      // легаси-status смешивает состояние и размещение
      const rawStatus = str(e.status) ?? "new";
      let condition = "new";
      let status = "in_stock";
      let billing: string | null = null;
      if (rawStatus === "new") { condition = "new"; status = "in_stock"; }
      else if (rawStatus === "used") { condition = "used"; status = "in_stock"; }
      else if (rawStatus === "active") { condition = "new"; status = "installed"; billing = "active"; }
      else if (EQUIPMENT_STATUSES.has(rawStatus)) { status = rawStatus; }
      else issue(`equipment #${e.id} (${e.serial}): статус «${rawStatus}» → in_stock/new`);

      await adopt("equipment", e.id, `SELECT id FROM equipment_items WHERE serial_number = $1`, [e.serial]);
      const eqId = await insertRow(
        "equipment_items", "equipment", e.id,
        `INSERT INTO equipment_items (nomenclature_id, serial_number, condition, status, billing_state,
                                      warehouse_id, holder_id, client_id, object_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10::timestamptz, now()))
         ON CONFLICT (serial_number) DO NOTHING RETURNING id`,
        [nomId, e.serial, condition, status, billing,
         idOf("warehouse", e.warehouse_id), idOf("user", e.holder_id),
         idOf("client", e.client_id), idOf("object", e.object_id), ts(e.created_at)],
        String(e.serial)
      );

      // стартовая запись регистра состояний для установленного оборудования
      if (eqId && billing === "active" && !idOf("esh", e.id)) {
        const act = legacy.all(
          `SELECT ma.billing_started_at, ma.created_at
             FROM maintenance_acts ma JOIN work_orders wo ON wo.id = ma.work_order_id
            WHERE ma.equipment_activated = 1
              AND (wo.client_id = ? OR (wo.object_id IS NOT NULL AND wo.object_id = ?))
            ORDER BY ma.id LIMIT 1`,
          e.client_id ?? -1, e.object_id ?? -1
        )[0];
        const validFrom = ts(act?.billing_started_at) ?? ts(act?.created_at) ?? ts(e.created_at) ?? new Date().toISOString();
        await insertRow(
          "equipment_state_history", "esh", e.id,
          `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, source_type)
           VALUES ($1,$2,$3,'active',$4,'import') RETURNING id`,
          [eqId, idOf("object", e.object_id), idOf("client", e.client_id), validFrom],
          `equipment #${e.id}`
        );
      }
    }

    // ---------------- 14. sim_cards ----------------
    console.log("→ sim_cards");
    // операторы РК из предзаполненного справочника (seed) — best-effort
    const simOperators = new Map<string, string>();
    for (const row of (await pg.query(`SELECT id, code FROM sim_operators`)).rows)
      simOperators.set(row.code, row.id);
    for (const sc of legacy.all(`SELECT * FROM sim_cards ORDER BY id`)) {
      await adopt("sim", sc.id, `SELECT id FROM sim_cards WHERE icc = $1`, [sc.serial]);
      let operatorId: string | null = null;
      const opText = str(sc.operator);
      if (opText) {
        const code = SIM_OPERATOR_CODE.find(([re]) => re.test(opText))?.[1];
        operatorId = code ? simOperators.get(code) ?? null : null;
        if (!operatorId)
          issue(`sim_cards #${sc.id} (${sc.serial}): оператор «${opText}» не сопоставлен со справочником — operator_id пуст`);
      }
      const status = mapEnum(`sim_cards #${sc.id} status`, sc.status, {}, SIM_STATUSES, "in_stock");
      await insertRow(
        "sim_cards", "sim", sc.id,
        `INSERT INTO sim_cards (icc, msisdn, operator_id, status, created_at)
         VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, now()))
         ON CONFLICT (icc) DO NOTHING RETURNING id`,
        [sc.serial, sc.msisdn, operatorId, status.code, ts(sc.created_at)],
        String(sc.serial)
      );
    }

    // ---------------- 15. sales_orders / sales_order_items ----------------
    console.log("→ sales_orders / sales_order_items");
    for (const so of legacy.all(`SELECT * FROM sales_orders ORDER BY id`)) {
      await adopt("sales_order", so.id, `SELECT id FROM sales_orders WHERE number = $1`, [so.number]);
      const clientId = idOf("client", so.client_id);
      if (!clientId && !idOf("sales_order", so.id)) {
        stat("sales_orders").errors++;
        issue(`sales_orders #${so.id} (${so.number}): клиент не найден — пропуск`);
        continue;
      }
      const shipment = mapEnum(`sales_orders ${so.number} shipment_order`, so.shipment_order, {}, SO_SHIPMENT, "on_install");
      const status = mapEnum(`sales_orders ${so.number} status`, so.status, {}, SO_STATUSES, "new");
      await insertRow(
        "sales_orders", "sales_order", so.id,
        `INSERT INTO sales_orders (number, client_id, shipment_order, status, manager_id, total_amount, created_at)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6,0), COALESCE($7::timestamptz, now()))
         ON CONFLICT (number) DO NOTHING RETURNING id`,
        [so.number, clientId, shipment.code, status.code, idOf("user", so.manager_id), num(so.total), ts(so.created_at)],
        String(so.number)
      );
    }
    for (const it of legacy.all(`SELECT * FROM sales_order_items ORDER BY id`)) {
      const orderId = idOf("sales_order", it.order_id);
      if (!orderId) {
        stat("sales_order_items").errors++;
        issue(`sales_order_items #${it.id}: заказ ${it.order_id} не найден — пропуск`);
        continue;
      }
      // связка с номенклатурой по точному имени, где найдётся
      const nom = await pg.query(
        `SELECT id FROM nomenclature WHERE lower(name) = lower($1) LIMIT 1`, [it.name]);
      await insertRow(
        "sales_order_items", "sales_order_item", it.id,
        `INSERT INTO sales_order_items (order_id, nomenclature_id, name, is_service, quantity, price, object_id)
         VALUES ($1,$2,$3,$4, COALESCE($5,1), COALESCE($6,0), $7) RETURNING id`,
        [orderId, nom.rows[0]?.id ?? null, it.name, bool(it.is_service),
         num(it.qty), num(it.price), idOf("object", it.object_id)]
      );
    }

    // ---------------- 16. work_orders (+performers из заявки) ----------------
    console.log("→ work_orders / work_order_performers");
    for (const wo of legacy.all(`SELECT * FROM work_orders ORDER BY id`)) {
      await adopt("work_order", wo.id, `SELECT id FROM work_orders WHERE number = $1`, [wo.number]);
      const status = mapEnum(`work_orders ${wo.number} status`, wo.status, {}, WO_STATUSES, "planned");
      const woId = await insertRow(
        "work_orders", "work_order", wo.id,
        `INSERT INTO work_orders (number, client_id, object_id, request_id, scheduled_start, status, created_at)
         VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7::timestamptz, now()))
         ON CONFLICT (number) DO NOTHING RETURNING id`,
        [wo.number, idOf("client", wo.client_id), idOf("object", wo.object_id),
         idOf("request", wo.request_id), ts(wo.planned_at), status.code, ts(wo.created_at)],
        String(wo.number)
      );
      // исполнитель заявки → work_order_performers
      if (woId && wo.request_id) {
        const req = legacy.all(`SELECT installer_id FROM requests WHERE id = ?`, wo.request_id)[0];
        const installerId = idOf("user", req?.installer_id);
        if (installerId) {
          const r = await pg.query(
            `INSERT INTO work_order_performers (work_order_id, user_id, is_lead)
             VALUES ($1,$2,true) ON CONFLICT DO NOTHING`,
            [woId, installerId]
          );
          if (r.rowCount) stat("work_order_performers").inserted++;
          else stat("work_order_performers").skipped++;
        }
      }
    }

    // ---------------- 17. maintenance_acts ----------------
    console.log("→ maintenance_acts");
    for (const ma of legacy.all(`SELECT * FROM maintenance_acts ORDER BY id`)) {
      const woId = idOf("work_order", ma.work_order_id);
      if (!woId) {
        stat("maintenance_acts").errors++;
        issue(`maintenance_acts #${ma.id}: наряд ${ma.work_order_id} не найден — пропуск`);
        continue;
      }
      const status = mapEnum(`maintenance_acts #${ma.id} status`, ma.status, {}, ACT_STATUSES, "done");
      const closedAt = status.code === "done" ? (ts(ma.billing_started_at) ?? ts(ma.created_at)) : null;
      const note = bool(ma.equipment_activated)
        ? `[миграция] оборудование активировано, старт биллинга: ${ts(ma.billing_started_at) ?? "—"}`
        : null;
      await insertRow(
        "maintenance_acts", "maintenance_act", ma.id,
        `INSERT INTO maintenance_acts (work_order_id, status, performed_by, closed_at, note, created_at)
         VALUES ($1,$2,$3,$4,$5, COALESCE($6::timestamptz, now())) RETURNING id`,
        [woId, status.code, idOf("user", ma.performed_by), closedAt, note, ts(ma.created_at)]
      );
    }

    // ---------------- 18. subscription_plans → tariffs ----------------
    console.log("→ tariffs (из subscription_plans)");
    for (const p of legacy.all(`SELECT * FROM subscription_plans ORDER BY id`)) {
      const clientId = idOf("client", p.client_id);
      if (!clientId) {
        stat("tariffs").errors++;
        issue(`subscription_plans #${p.id}: клиент ${p.client_id} не найден — пропуск`);
        continue;
      }
      if (str(p.period) && p.period !== "month")
        issue(`subscription_plans #${p.id}: период «${p.period}» ≠ month — тариф месячный, проверить вручную`);
      await insertRow(
        "tariffs", "tariff", p.id,
        `INSERT INTO tariffs (level, client_id, method, amount, valid_from, is_active, created_at)
         VALUES ('client', $1, 'subscription', $2, COALESCE($3::date, CURRENT_DATE), $4,
                 COALESCE($5::timestamptz, now())) RETURNING id`,
        [clientId, num(p.amount) ?? 0, ts(p.created_at)?.slice(0, 10) ?? null, bool(p.active), ts(p.created_at)]
      );
    }

    // ---------------- 19. subscription_invoices → billing_documents + accruals -------
    console.log("→ billing_documents / accruals (из subscription_invoices)");
    for (const inv of legacy.all(`SELECT * FROM subscription_invoices ORDER BY id`)) {
      const clientId = idOf("client", inv.client_id);
      if (!clientId) {
        stat("billing_documents").errors++;
        issue(`subscription_invoices #${inv.id}: клиент ${inv.client_id} не найден — пропуск`);
        continue;
      }
      const status = mapEnum(`subscription_invoices #${inv.id} status`, inv.status, {}, INVOICE_STATUSES, "issued");
      const amount = num(inv.amount) ?? 0;
      const paid = num(inv.paid_amount) ?? 0;
      const docId = await insertRow(
        "billing_documents", "billing_document", inv.id,
        `INSERT INTO billing_documents (kind, scheme, client_id, period_start, period_end,
                                        subtotal, total, paid_amount, status, issued_at, created_at)
         VALUES ('act','credit',$1,$2,$3,$4,$4,$5,$6, COALESCE($7::timestamptz, now()),
                 COALESCE($7::timestamptz, now())) RETURNING id`,
        [clientId, str(inv.period_start), str(inv.period_end), amount, paid, status.code, ts(inv.created_at)]
      );
      const theDocId = docId ?? idOf("billing_document", inv.id);
      if (theDocId) {
        const from = str(inv.period_start);
        const to = str(inv.period_end);
        const days = from && to
          ? Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1
          : null;
        await insertRow(
          "accruals", "accrual", inv.id,
          `INSERT INTO accruals (billing_document_id, client_id, tariff_id, method, date_from, date_to,
                                 days, amount, status, note)
           VALUES ($1,$2,$3,'subscription', COALESCE($4::date, CURRENT_DATE), COALESCE($5::date, CURRENT_DATE),
                   $6,$7,'billed','[миграция] абонплата за период (subscription_invoices)') RETURNING id`,
          [theDocId, clientId, idOf("tariff", inv.plan_id), from, to, days, amount]
        );
      }
    }

    // ---------------- 20. нумераторы seq_* → max(номер)+1 ----------------
    console.log("→ ресинк нумераторов");
    const seqSources: [string, string][] = [
      ["seq_request_number", `SELECT number FROM requests`],
      ["seq_work_order_number", `SELECT number FROM work_orders`],
      ["seq_sales_order_number", `SELECT number FROM sales_orders`],
    ];
    for (const [seq, sql] of seqSources) {
      const r = await pg.query(sql);
      const max = r.rows.reduce((m, row) => Math.max(m, lastNumber(row.number) ?? 0), 0);
      if (max > 0) {
        await pg.query(`SELECT setval($1, $2, true)`, [seq, max]);
        console.log(`  ${seq} → ${max} (след. номер ${max + 1})`);
      }
    }

    await pg.query("COMMIT");
  } catch (e) {
    await pg.query("ROLLBACK");
    throw e;
  } finally {
    pg.release();
    await pool.end();
    legacy.close();
  }

  // ---------------- Сводка ----------------
  console.log("\n===== СВОДКА МИГРАЦИИ =====");
  const pad = (s: string, n: number) => s.padEnd(n);
  console.log(pad("таблица", 28) + pad("перенесено", 12) + pad("пропущено", 11) + "ошибки");
  let ins = 0, skip = 0, err = 0;
  for (const [table, s] of [...stats.entries()].sort()) {
    console.log(pad(table, 28) + pad(String(s.inserted), 12) + pad(String(s.skipped), 11) + s.errors);
    ins += s.inserted; skip += s.skipped; err += s.errors;
  }
  console.log(pad("ИТОГО", 28) + pad(String(ins), 12) + pad(String(skip), 11) + err);
  if (issues.length) {
    console.log(`\n===== ЗАМЕЧАНИЯ (${issues.length}) =====`);
    for (const i of issues) console.log(`- ${i}`);
  }
  console.log(
    "\nПримечания: наивные метки времени SQLite интерпретированы как UTC;" +
    " vat_rate/vat_amount в billing_documents не заполнены (в легаси НДС не выделялся);" +
    " банковские реквизиты контрагентов добиваются вручную (в легаси их нет)."
  );
  if (err > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
