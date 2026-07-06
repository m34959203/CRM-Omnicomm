/**
 * Демо-наполнение ОСНОВНОЙ дев-БД согласованными данными за июнь — начало июля 2026
 * (казахстанский колорит: Караганда/Астана). Запуск: npm run db:seed-demo.
 *
 * Принципы:
 *  - Финансы/движения/ЗП — только через реальные движки:
 *    generateClientDocument / closeMaintenanceAct / buildPayrollSheet.
 *    Прямые INSERT — лишь справочники, заявки/наряды/тикеты/звонки и
 *    equipment_state_history (исходные «миграционные» интервалы).
 *  - Идемпотентность: проверка по натуральным признакам (email, имя клиента,
 *    серийник, ICC, маркеры [demo:*] в description/note/bank_reference).
 *  - Существующие данные (Горкомтранс-Тест, Тест-Приёмник, «Не распределено»,
 *    импортированные объекты) не трогаются.
 *  - closeMaintenanceAct ставит closed_at/valid_from = now() — после закрытия
 *    даты откатываются на июньские (акт, заявка, payroll_entries, ESH, движения),
 *    чтобы июньские отчёты/биллинг/ведомость сходились.
 */
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import bcrypt from "bcryptjs";

// ---------- env (.env приложения), до импорта lib/db ----------
if (!process.env.DATABASE_URL) {
  const envPath = join(import.meta.dirname, "..", ".env");
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
  }
}

const stats = new Map<string, { created: number; skipped: number }>();
function track(entity: string, created: boolean) {
  const s = stats.get(entity) ?? { created: 0, skipped: 0 };
  if (created) s.created++;
  else s.skipped++;
  stats.set(entity, s);
}

/** timestamptz Алматы: ts('06-03','13:00') → 2026-06-03T13:00:00+05:00 */
const ts = (md: string, time = "10:00") => `2026-${md}T${time}:00+05:00`;

async function main() {
  const { query, db } = await import("../lib/db");
  const { generateClientDocument } = await import("../lib/billing/engine");
  const { closeMaintenanceAct, reworkMaintenanceAct } = await import("../lib/service/act-close");
  const { buildPayrollSheet } = await import("../lib/payroll/calc");

  const one = async <T = Record<string, unknown>>(sql: string, p?: unknown[]) =>
    (await query<T>(sql, p))[0];

  /** Найти по натуральному признаку или создать. Возвращает id. */
  async function ensure(
    entity: string,
    selSql: string,
    selP: unknown[],
    insSql: string,
    insP: unknown[]
  ): Promise<string> {
    const ex = await one<{ id: string }>(selSql, selP);
    if (ex) {
      track(entity, false);
      return ex.id;
    }
    const row = await one<{ id: string }>(insSql, insP);
    track(entity, true);
    return row.id;
  }

  // ================= 0. Базовые ссылки =================
  const admin = await one<{ id: string }>(`SELECT id FROM users WHERE email='admin@omnicomm.kz'`);
  const manager = await one<{ id: string }>(`SELECT id FROM users WHERE email='manager@omnicomm.kz'`);
  const support = await one<{ id: string }>(`SELECT id FROM users WHERE email='support@omnicomm.kz'`);
  const demoTech = await one<{ id: string }>(`SELECT id FROM users WHERE email='installer@omnicomm.kz'`);
  if (!admin || !manager || !demoTech) throw new Error("базовый сид не прогнан (npm run db:seed)");
  const roleId = async (code: string) =>
    (await one<{ id: string }>(`SELECT id FROM roles WHERE code=$1`, [code]))!.id;

  const mainWh = (await one<{ id: string }>(
    `SELECT id FROM warehouses WHERE type='physical' AND is_active ORDER BY created_at LIMIT 1`
  ))!.id;
  const testingWh = (await one<{ id: string }>(
    `SELECT id FROM warehouses WHERE type='testing' AND is_active LIMIT 1`
  ))!.id;
  const supplier = (await one<{ id: string }>(`SELECT id FROM suppliers ORDER BY created_at LIMIT 1`))!.id;
  const tmServer = (await one<{ id: string }>(
    `SELECT id FROM telematics_servers WHERE name='Omnicomm демо (RU)' LIMIT 1`
  ))!.id;

  // ================= 1. Пользователи и склады техников =================
  const hash = bcrypt.hashSync("demo1234", 10);
  async function ensureUser(fullName: string, email: string, role: string, phone: string, region: string) {
    return ensure(
      "users",
      `SELECT id FROM users WHERE lower(email)=lower($1)`,
      [email],
      `INSERT INTO users (full_name, email, phone, role_id, password_hash, region)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [fullName, email, phone, await roleId(role), hash, region]
    );
  }
  const serik = await ensureUser("Серик Жумабеков", "s.zhumabekov@omnicomm.kz", "installer", "+7 701 555 00 21", "Караганда");
  const kovalev = await ensureUser("Андрей Ковалёв", "a.kovalev@omnicomm.kz", "installer", "+7 702 555 00 22", "Караганда");
  await ensureUser("Айгуль Садыкова", "a.sadykova@omnicomm.kz", "accounting", "+7 705 555 00 23", "Караганда");

  for (const [uid, name] of [
    [serik, "Техник: Серик Жумабеков"],
    [kovalev, "Техник: Андрей Ковалёв"],
  ] as const) {
    await ensure(
      "warehouses",
      `SELECT id FROM warehouses WHERE type='technician' AND holder_id=$1`,
      [uid],
      `INSERT INTO warehouses (name, type, holder_id) VALUES ($1,'technician',$2) RETURNING id`,
      [name, uid]
    );
  }
  const astanaWh = await ensure(
    "warehouses",
    `SELECT id FROM warehouses WHERE name='Склад Астана'`,
    [],
    `INSERT INTO warehouses (name, type) VALUES ('Склад Астана','physical') RETURNING id`,
    []
  );
  const serikWh = (await one<{ id: string }>(`SELECT id FROM warehouses WHERE holder_id=$1`, [serik]))!.id;
  const kovalevWh = (await one<{ id: string }>(`SELECT id FROM warehouses WHERE holder_id=$1`, [kovalev]))!.id;

  // ================= 2. ЗП-справочники =================
  async function ensurePerfCategory(name: string) {
    return ensure(
      "performer_categories",
      `SELECT id FROM performer_categories WHERE name=$1`,
      [name],
      `INSERT INTO performer_categories (name) VALUES ($1) RETURNING id`,
      [name]
    );
  }
  const catShtat = await ensurePerfCategory("Штатный");
  const catPodryad = await ensurePerfCategory("Подрядчик");
  for (const [uid, cat] of [
    [serik, catShtat],
    [kovalev, catPodryad],
  ] as const) {
    await ensure(
      "performer_category_assignments",
      `SELECT id FROM performer_category_assignments WHERE user_id=$1 AND category_id=$2`,
      [uid, cat],
      `INSERT INTO performer_category_assignments (user_id, category_id, valid_from)
       VALUES ($1,$2,'2026-01-01') RETURNING id`,
      [uid, cat]
    );
  }
  await ensure(
    "payroll_rules",
    `SELECT id FROM payroll_rules WHERE name=$1`,
    ["Оклад 250 000 за 15 монтажей + сделка сверх"],
    `INSERT INTO payroll_rules (name, scope, category_id, salary, norm_count, piece_over_norm)
     VALUES ($1,'category',$2,250000,15,true) RETURNING id`,
    ["Оклад 250 000 за 15 монтажей + сделка сверх", catShtat]
  );

  // ================= 3. Виды работ и расценки =================
  const WT_DEFS: [string, string, string, boolean, string | null, number][] = [
    // name, name_kk, action, photo_required, places, default_rate
    ["Монтаж терминала", "Терминалды орнату", "install", true, '["кабина","разъём"]', 5000],
    ["Монтаж ДУТ", "ЖДД орнату", "install", true, '["бак","тарировка"]', 6000],
    ["Диагностика", "Диагностика", "diagnostics", false, null, 4000],
    ["Замена терминала", "Терминалды ауыстыру", "replace", true, '["кабина"]', 5500],
    ["Демонтаж терминала", "Терминалды бөлшектеу", "dismantle", false, null, 3000],
    ["Настройка мониторинга", "Мониторингті баптау", "service", false, null, 3500],
  ];
  const WT: Record<string, string> = {};
  for (const [name, kk, action, photo, places, rate] of WT_DEFS) {
    WT[name] = await ensure(
      "work_types",
      `SELECT id FROM work_types WHERE name=$1`,
      [name],
      `INSERT INTO work_types (name, name_kk, action, photo_required, photo_places, default_rate)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6) RETURNING id`,
      [name, kk, action, photo, places, rate]
    );
  }

  async function ensureRate(scope: string, catId: string | null, userId: string | null, wt: string, rate: number) {
    await ensure(
      "work_rates",
      `SELECT id FROM work_rates WHERE scope=$1 AND category_id IS NOT DISTINCT FROM $2
         AND user_id IS NOT DISTINCT FROM $3 AND work_type_id=$4`,
      [scope, catId, userId, wt],
      `INSERT INTO work_rates (scope, category_id, user_id, work_type_id, rate, valid_from)
       VALUES ($1,$2,$3,$4,$5,'2026-01-01') RETURNING id`,
      [scope, catId, userId, wt, rate]
    );
  }
  for (const [wt, rate] of [
    ["Монтаж терминала", 5000], ["Монтаж ДУТ", 6000], ["Диагностика", 4000],
    ["Замена терминала", 5500], ["Демонтаж терминала", 3000], ["Настройка мониторинга", 3500],
  ] as const) await ensureRate("default", null, null, WT[wt], rate);
  for (const [wt, rate] of [
    ["Монтаж терминала", 7000], ["Монтаж ДУТ", 7500], ["Диагностика", 4500], ["Замена терминала", 6500],
  ] as const) await ensureRate("category", catPodryad, null, WT[wt], rate);
  await ensureRate("performer", null, serik, WT["Монтаж ДУТ"], 6500);

  // ================= 4. Номенклатура, нормы, SIM-планы =================
  const NOM_DEFS: [string, string, string | null, boolean, number, number, string, string][] = [
    // name, kind, device_type, serial, price, max_sim, unit, sku
    ["Omnicomm Optim 3", "equipment", "gps_terminal", true, 95000, 1, "шт", "OPT-3"],
    ["Omnicomm Light", "equipment", "gps_terminal", true, 65000, 1, "шт", "LGT-1"],
    ["ДУТ Omnicomm LLS 5", "equipment", "fuel_sensor", true, 55000, 0, "шт", "LLS-5"],
    ["Гофра защитная", "material", null, false, 350, 0, "м", "MAT-GOFRA"],
    ["Пломба номерная", "material", null, false, 150, 0, "шт", "MAT-PLOMB"],
    ["Стяжка кабельная", "material", null, false, 20, 0, "шт", "MAT-STYAG"],
    ["Настройка отчётов BI", "service", null, false, 25000, 0, "усл", "SRV-BI"],
    ["Обучение диспетчера", "service", null, false, 15000, 0, "усл", "SRV-EDU"],
    ["Монтажные работы", "service", null, false, 5000, 0, "усл", "SRV-MNT"],
  ];
  const NOM: Record<string, string> = {
    "Omnicomm Profi 2.0": (await one<{ id: string }>(
      `SELECT id FROM nomenclature WHERE name='Omnicomm Profi 2.0'`
    ))!.id,
    "Кабель монтажный": (await one<{ id: string }>(
      `SELECT id FROM nomenclature WHERE name='Кабель монтажный'`
    ))!.id,
  };
  for (const [name, kind, dev, serial, price, maxSim, unit, sku] of NOM_DEFS) {
    NOM[name] = await ensure(
      "nomenclature",
      `SELECT id FROM nomenclature WHERE name=$1`,
      [name],
      `INSERT INTO nomenclature (kind, name, sku, unit, default_price, is_serial_tracked, device_type, max_sim_slots)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [kind, name, sku, unit, price, serial, dev, maxSim]
    );
  }
  const NORMS: [string, string, number][] = [
    ["Монтаж терминала", "Кабель монтажный", 3],
    ["Монтаж терминала", "Гофра защитная", 2],
    ["Монтаж терминала", "Стяжка кабельная", 10],
    ["Монтаж ДУТ", "Кабель монтажный", 5],
    ["Монтаж ДУТ", "Гофра защитная", 3],
    ["Монтаж ДУТ", "Пломба номерная", 2],
    ["Монтаж ДУТ", "Стяжка кабельная", 8],
    ["Диагностика", "Стяжка кабельная", 2],
    ["Замена терминала", "Кабель монтажный", 2],
    ["Замена терминала", "Стяжка кабельная", 6],
  ];
  for (const [wt, nom, qty] of NORMS) {
    await ensure(
      "material_norms",
      `SELECT id FROM material_norms WHERE work_type_id=$1 AND nomenclature_id=$2`,
      [WT[wt], NOM[nom]],
      `INSERT INTO material_norms (work_type_id, nomenclature_id, quantity) VALUES ($1,$2,$3) RETURNING id`,
      [WT[wt], NOM[nom], qty]
    );
  }
  const opId = async (code: string) =>
    (await one<{ id: string }>(`SELECT id FROM sim_operators WHERE code=$1`, [code]))!.id;
  const OPS = { beeline: await opId("beeline_kz"), kcell: await opId("kcell"), tele2: await opId("tele2_altel") };
  const PLANS: Record<string, string> = {};
  for (const [op, name, fee] of [
    ["beeline", "M2M Казахстан 100 МБ", 1200],
    ["kcell", "IoT Standard", 1500],
    ["tele2", "M2M Смарт", 900],
  ] as const) {
    PLANS[op] = await ensure(
      "sim_operator_plans",
      `SELECT id FROM sim_operator_plans WHERE operator_id=$1 AND name=$2`,
      [OPS[op], name],
      `INSERT INTO sim_operator_plans (operator_id, name, monthly_fee) VALUES ($1,$2,$3) RETURNING id`,
      [OPS[op], name, fee]
    );
  }

  // ================= 5. Категории обслуживания, тарифный план, клиенты =================
  const vipCat = await ensure(
    "service_categories",
    `SELECT id FROM service_categories WHERE name='VIP'`,
    [],
    `INSERT INTO service_categories (name, name_kk, note) VALUES ('VIP','VIP','Тариф 4500, приоритетная поддержка') RETURNING id`,
    []
  );
  const agroPlan = await ensure(
    "tariff_plans",
    `SELECT id FROM tariff_plans WHERE name='Агро-пакет'`,
    [],
    `INSERT INTO tariff_plans (name, name_kk) VALUES ('Агро-пакет','Агро-пакет') RETURNING id`,
    []
  );
  await ensure(
    "tariff_plan_items",
    `SELECT id FROM tariff_plan_items WHERE plan_id=$1 AND method='activity'`,
    [agroPlan],
    `INSERT INTO tariff_plan_items (plan_id, method, name, amount) VALUES ($1,'activity','Абонплата (агро)',4200) RETURNING id`,
    [agroPlan]
  );

  type ClientDef = {
    key: string; name: string; scheme: "advance" | "credit";
    legalForm: string; bin: string; kbe: string; vat: boolean; govt?: boolean;
    nameKk?: string; address: string; iik: string; bik: string; bank: string;
    phone: string; email: string; contact: [string, string, string];
    contract: { number: string; kind: string; goszakup?: string };
    categoryId?: string; planId?: string;
  };
  const CLIENT_DEFS: ClientDef[] = [
    {
      key: "gkt", name: "ТОО «Горкомтранс КЗ»", scheme: "advance", legalForm: "TOO",
      bin: "020340001234", kbe: "17", vat: true, nameKk: "«Горкомтранс КЗ» ЖШС",
      address: "г. Караганда, ул. Складская, 8", iik: "KZ566010131000201234", bik: "HSBKKZKX",
      bank: "АО «Народный Банк Казахстана»", phone: "+7 (7212) 41-22-33", email: "info@gktrans.kz",
      contact: ["Ержан Абдрахманов", "Директор по транспорту", "+7 701 555 10 11"],
      contract: { number: "ДМ-2026/014", kind: "complex" },
    },
    {
      key: "klg", name: "ТОО «КарагандаЛогистик»", scheme: "credit", legalForm: "TOO",
      bin: "091140004321", kbe: "17", vat: true,
      address: "г. Караганда, пр. Сатпаева, 12/1", iik: "KZ868562203105704321", bik: "KCJBKZKX",
      bank: "АО «Банк ЦентрКредит»", phone: "+7 (7212) 50-60-70", email: "office@krglogistic.kz",
      contact: ["Виктор Ким", "Начальник логистики", "+7 702 555 10 12"],
      contract: { number: "ДМ-2026/015", kind: "subscription" },
    },
    {
      key: "gu", name: "ГУ «Управление пассажирского транспорта г. Караганды»", scheme: "advance",
      legalForm: "GU", bin: "990240005678", kbe: "16", vat: false, govt: true,
      nameKk: "«Қарағанды қаласының жолаушылар көлігі басқармасы» ММ",
      address: "г. Караганда, ул. Алиханова, 13", iik: "KZ240705022973405678", bik: "KKMFKZ2A",
      bank: "Комитет казначейства МФ РК", phone: "+7 (7212) 56-44-55", email: "upt@karaganda.gov.kz",
      contact: ["Айбек Тулеубаев", "Главный специалист", "+7 705 555 10 13"],
      contract: { number: "ГЗ-2026/041", kind: "complex", goszakup: "2026.ГЗ-1745821-1" },
    },
    {
      key: "sts", name: "ТОО «СтройТехСервис»", scheme: "credit", legalForm: "TOO",
      bin: "120540007890", kbe: "17", vat: true,
      address: "г. Караганда, ул. Гоголя, 34", iik: "KZ128560017000707890", bik: "CASPKZKA",
      bank: "АО «Kaspi Bank»", phone: "+7 (7212) 47-88-99", email: "buh@stroytech.kz",
      contact: ["Марат Оспанов", "Директор", "+7 701 555 10 14"],
      contract: { number: "ДМ-2026/016", kind: "subscription" },
    },
    {
      key: "asn", name: "ИП Асанов", scheme: "credit", legalForm: "IP",
      bin: "850915300123", kbe: "19", vat: false,
      address: "г. Караганда, мкр. Голубые Пруды, 11-25", iik: "KZ948560017000800123", bik: "CASPKZKA",
      bank: "АО «Kaspi Bank»", phone: "+7 701 555 10 15", email: "asanov.b@mail.kz",
      contact: ["Бауыржан Асанов", "Владелец", "+7 701 555 10 15"],
      contract: { number: "ДМ-2026/017", kind: "subscription" },
    },
    {
      key: "agt", name: "ТОО «АгроТранс Астана»", scheme: "credit", legalForm: "TOO",
      bin: "180140009876", kbe: "17", vat: true, planId: agroPlan,
      address: "г. Астана, пр. Кабанбай батыра, 42", iik: "KZ756017131000109876", bik: "IRTYKZKA",
      bank: "АО «ForteBank»", phone: "+7 (7172) 64-20-30", email: "info@agrotrans.kz",
      contact: ["Динара Ержанова", "Офис-менеджер", "+7 707 555 10 16"],
      contract: { number: "ДМ-2026/018", kind: "subscription" },
    },
    {
      key: "zhb", name: "ИП Жумабеков", scheme: "credit", legalForm: "IP",
      bin: "790302300456", kbe: "19", vat: false,
      address: "г. Караганда, ул. Ермекова, 58-4", iik: "KZ948560017000900456", bik: "CASPKZKA",
      bank: "АО «Kaspi Bank»", phone: "+7 702 555 10 17", email: "zhumabekov.k@mail.kz",
      contact: ["Кайрат Жумабеков", "Владелец", "+7 702 555 10 17"],
      contract: { number: "ДМ-2026/019", kind: "subscription" },
    },
    {
      key: "eat", name: "ТОО «ЕвроАзияТранс»", scheme: "credit", legalForm: "TOO",
      bin: "060940003214", kbe: "17", vat: true, categoryId: vipCat,
      address: "г. Караганда, ул. Молокова, 100/2", iik: "KZ916018861000203214", bik: "HSBKKZKX",
      bank: "АО «Народный Банк Казахстана»", phone: "+7 (7212) 79-30-40", email: "dispatch@eat-trans.kz",
      contact: ["Олег Пак", "Руководитель АТП", "+7 705 555 10 18"],
      contract: { number: "ДМ-2026/020", kind: "subscription" },
    },
    {
      key: "sht", name: "ТОО «Шахтинск Транс»", scheme: "credit", legalForm: "TOO",
      bin: "150240006789", kbe: "17", vat: true,
      address: "г. Шахтинск, ул. Казахстанская, 101", iik: "KZ606019261000106789", bik: "TSESKZKA",
      bank: "АО «Jusan Bank»", phone: "+7 (72156) 5-40-50", email: "office@shahtinsk-trans.kz",
      contact: ["Аслан Бекетов", "Механик", "+7 700 555 10 19"],
      contract: { number: "ДМ-2026/021", kind: "subscription" },
    },
  ];

  const CL: Record<string, string> = {};
  for (const c of CLIENT_DEFS) {
    CL[c.key] = await ensure(
      "clients",
      `SELECT id FROM clients WHERE name=$1`,
      [c.name],
      `INSERT INTO clients (name, category_id, manager_id, phone, email, billing_scheme, tariff_plan_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [c.name, c.categoryId ?? null, manager.id, c.phone, c.email, c.scheme, c.planId ?? null, "[demo]"]
    );
    const cpId = await ensure(
      "counterparties",
      `SELECT id FROM counterparties WHERE client_id=$1 AND bin_iin=$2`,
      [CL[c.key], c.bin],
      `INSERT INTO counterparties (client_id, name, name_kk, legal_form, bin_iin, kbe, is_vat_payer,
         is_government, legal_address, phone, email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [CL[c.key], c.name, c.nameKk ?? null, c.legalForm, c.bin, c.kbe, c.vat, c.govt ?? false,
       c.address, c.phone, c.email]
    );
    await ensure(
      "counterparty_bank_accounts",
      `SELECT id FROM counterparty_bank_accounts WHERE counterparty_id=$1 AND iik=$2`,
      [cpId, c.iik],
      `INSERT INTO counterparty_bank_accounts (counterparty_id, iik, bik, bank_name)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [cpId, c.iik, c.bik, c.bank]
    );
    await ensure(
      "client_contacts",
      `SELECT id FROM client_contacts WHERE client_id=$1 AND name=$2`,
      [CL[c.key], c.contact[0]],
      `INSERT INTO client_contacts (client_id, name, position, phone, is_primary)
       VALUES ($1,$2,$3,$4,true) RETURNING id`,
      [CL[c.key], c.contact[0], c.contact[1], c.contact[2]]
    );
    await ensure(
      "contracts",
      `SELECT id FROM contracts WHERE number=$1 AND client_id=$2`,
      [c.contract.number, CL[c.key]],
      `INSERT INTO contracts (number, client_id, counterparty_id, kind, is_goszakup, goszakup_number,
         signed_at, valid_from, status)
       VALUES ($1,$2,$3,$4,$5,$6,'2026-05-15','2026-05-15','active') RETURNING id`,
      [c.contract.number, CL[c.key], cpId, c.contract.kind, !!c.contract.goszakup, c.contract.goszakup ?? null]
    );
  }

  // ================= 6. Объекты =================
  type ObjDef = { key: string; client: string; brand: string; model: string; reg: string };
  const OBJ_DEFS: ObjDef[] = [
    { key: "gkt1", client: "gkt", brand: "КАМАЗ", model: "65115", reg: "A215KM09" },
    { key: "gkt2", client: "gkt", brand: "КАМАЗ", model: "65115", reg: "A216KM09" },
    { key: "gkt3", client: "gkt", brand: "КАМАЗ", model: "65115", reg: "A217KM09" },
    { key: "gkt4", client: "gkt", brand: "ГАЗель", model: "NEXT", reg: "A340NP09" },
    { key: "gkt5", client: "gkt", brand: "ГАЗель", model: "NEXT", reg: "A341NP09" },
    { key: "gkt6", client: "gkt", brand: "Shacman", model: "X3000", reg: "A512SH09" },
    { key: "gkt7", client: "gkt", brand: "Shacman", model: "X3000", reg: "A513SH09" },
    { key: "gkt8", client: "gkt", brand: "MAN", model: "TGS", reg: "A644MN09" },
    { key: "gkt9", client: "gkt", brand: "JCB", model: "3CX", reg: "A780JC09" },
    { key: "klg1", client: "klg", brand: "MAN", model: "TGS", reg: "A101EU09" },
    { key: "klg2", client: "klg", brand: "MAN", model: "TGS", reg: "A102EU09" },
    { key: "klg3", client: "klg", brand: "Shacman", model: "X3000", reg: "A210KL09" },
    { key: "klg4", client: "klg", brand: "ГАЗель", model: "NEXT", reg: "A310KL09" },
    { key: "klg5", client: "klg", brand: "КАМАЗ", model: "65115", reg: "A410KL09" },
    { key: "gu1", client: "gu", brand: "Yutong", model: "ZK6128HG", reg: "001AB09" },
    { key: "gu2", client: "gu", brand: "Yutong", model: "ZK6128HG", reg: "002AB09" },
    { key: "gu3", client: "gu", brand: "Yutong", model: "ZK6128HG", reg: "003AB09" },
    { key: "gu4", client: "gu", brand: "Yutong", model: "ZK6128HG", reg: "004AB09" },
    { key: "sts1", client: "sts", brand: "КАМАЗ", model: "65115", reg: "A555ST09" },
    { key: "sts2", client: "sts", brand: "JCB", model: "3CX", reg: "A556ST09" },
    { key: "sts3", client: "sts", brand: "ГАЗель", model: "NEXT", reg: "A557ST09" },
    { key: "asn1", client: "asn", brand: "ГАЗель", model: "NEXT", reg: "A660IP09" },
    { key: "asn2", client: "asn", brand: "ГАЗель", model: "NEXT", reg: "A661IP09" },
    { key: "agt1", client: "agt", brand: "КАМАЗ", model: "65115", reg: "350AKZ01" },
    { key: "agt2", client: "agt", brand: "Shacman", model: "X3000", reg: "351AKZ01" },
    { key: "agt3", client: "agt", brand: "MAN", model: "TGS", reg: "352AKZ01" },
    { key: "zhb1", client: "zhb", brand: "ГАЗель", model: "NEXT", reg: "A700ZH09" },
    { key: "eat1", client: "eat", brand: "MAN", model: "TGS", reg: "A810EA09" },
    { key: "eat2", client: "eat", brand: "MAN", model: "TGS", reg: "A811EA09" },
    { key: "eat3", client: "eat", brand: "КАМАЗ", model: "65115", reg: "A812EA09" },
    { key: "eat4", client: "eat", brand: "Shacman", model: "X3000", reg: "A813EA09" },
    { key: "sht1", client: "sht", brand: "КАМАЗ", model: "65115", reg: "A900SH09" },
    { key: "sht2", client: "sht", brand: "ГАЗель", model: "NEXT", reg: "A901SH09" },
  ];
  const OBJ: Record<string, string> = {};
  for (const o of OBJ_DEFS) {
    const name = `${o.brand} ${o.model} ${o.reg}`;
    OBJ[o.key] = await ensure(
      "monitoring_objects",
      `SELECT id FROM monitoring_objects WHERE client_id=$1 AND name=$2`,
      [CL[o.client], name],
      `INSERT INTO monitoring_objects (client_id, name, kind, brand, model, reg_number)
       VALUES ($1,$2,'vehicle',$3,$4,$5) RETURNING id`,
      [CL[o.client], name, o.brand, o.model, o.reg]
    );
  }

  // ================= 7. Тарифы и скидка =================
  await ensure(
    "tariffs",
    `SELECT id FROM tariffs WHERE level='default' AND method='activity' AND is_active`,
    [],
    `INSERT INTO tariffs (level, method, amount, valid_from) VALUES ('default','activity',5000,'2026-01-01') RETURNING id`,
    []
  );
  const tariffDefs: [string, unknown[], string, unknown[]][] = [
    ["category VIP", [vipCat],
     `INSERT INTO tariffs (level, category_id, method, amount, valid_from) VALUES ('category',$1,'activity',4500,'2026-01-01') RETURNING id`, [vipCat]],
    ["client gkt", [CL.gkt],
     `INSERT INTO tariffs (level, client_id, method, amount, valid_from) VALUES ('client',$1,'activity',4800,'2026-01-01') RETURNING id`, [CL.gkt]],
    ["client klg", [CL.klg],
     `INSERT INTO tariffs (level, client_id, method, amount, valid_from) VALUES ('client',$1,'activity',5200,'2026-01-01') RETURNING id`, [CL.klg]],
  ];
  for (const [, selP, ins, insP] of tariffDefs) {
    const sel =
      ins.includes("'category'")
        ? `SELECT id FROM tariffs WHERE level='category' AND category_id=$1 AND method='activity'`
        : `SELECT id FROM tariffs WHERE level='client' AND client_id=$1 AND method='activity'`;
    await ensure("tariffs", sel, selP, ins, insP);
  }
  // объектный 7500 «выезд за рубеж» на MAN КарагандаЛогистик
  await ensure(
    "tariffs",
    `SELECT id FROM tariffs WHERE level='object' AND object_id=$1 AND method='activity'`,
    [OBJ.klg1],
    `INSERT INTO tariffs (level, object_id, method, amount, valid_from)
     VALUES ('object',$1,'activity',7500,'2026-06-01') RETURNING id`,
    [OBJ.klg1]
  );
  // подписка Шахтинск Транс 12000 + «не начислять» activity (чтобы не задваивать)
  await ensure(
    "tariffs",
    `SELECT id FROM tariffs WHERE level='client' AND client_id=$1 AND method='subscription'`,
    [CL.sht],
    `INSERT INTO tariffs (level, client_id, method, amount, valid_from)
     VALUES ('client',$1,'subscription',12000,'2026-06-01') RETURNING id`,
    [CL.sht]
  );
  await ensure(
    "tariffs",
    `SELECT id FROM tariffs WHERE level='client' AND client_id=$1 AND method='activity'`,
    [CL.sht],
    `INSERT INTO tariffs (level, client_id, method, amount, do_not_charge, valid_from)
     VALUES ('client',$1,'activity',0,true,'2026-06-01') RETURNING id`,
    [CL.sht]
  );
  // do_not_charge на объект ИП Жумабекова
  await ensure(
    "tariffs",
    `SELECT id FROM tariffs WHERE level='object' AND object_id=$1 AND method='activity'`,
    [OBJ.zhb1],
    `INSERT INTO tariffs (level, object_id, method, amount, do_not_charge, valid_from)
     VALUES ('object',$1,'activity',0,true,'2026-05-01') RETURNING id`,
    [OBJ.zhb1]
  );
  // скидка 15000 ЕвроАзияТранс
  await ensure(
    "discounts",
    `SELECT id FROM discounts WHERE client_id=$1 AND name='Скидка по доп. соглашению'`,
    [CL.eat],
    `INSERT INTO discounts (client_id, name, total_amount, valid_from)
     VALUES ($1,'Скидка по доп. соглашению',15000,'2026-06-01') RETURNING id`,
    [CL.eat]
  );

  // ================= 8. Оборудование + исходные ESH-интервалы =================
  type Disp =
    | { t: "installed"; obj: string; from: string; conservFrom?: string; disabledFrom?: string }
    | { t: "dismantled"; obj: string; from: string; to: string } // снят (ремонт), БУ на складе
    | { t: "stock"; wh: string; cond?: "new" | "used" }
    | { t: "tech"; user: string }
    | { t: "testing" }
    | { t: "supplier" };
  type EqDef = { sn: string; nom: string; disp: Disp; imei?: string };
  let imeiN = 0;
  const im = () => `8683450570${String(1000 + ++imeiN)}`;
  const EQ_DEFS: EqDef[] = [
    // Горкомтранс КЗ
    { sn: "212900101", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "gkt1", from: "05-05" } },
    { sn: "560100401", nom: "ДУТ Omnicomm LLS 5", disp: { t: "installed", obj: "gkt1", from: "05-05" } },
    { sn: "212900102", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "gkt2", from: "05-05" } },
    { sn: "201900301", nom: "Omnicomm Light", imei: im(), disp: { t: "installed", obj: "gkt4", from: "05-12" } },
    { sn: "212900104", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "gkt6", from: "05-20" } },
    { sn: "212900105", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "gkt8", from: "05-20", conservFrom: "06-15" } },
    { sn: "201900302", nom: "Omnicomm Light", imei: im(), disp: { t: "installed", obj: "gkt9", from: "05-25" } },
    // КарагандаЛогистик
    { sn: "212900106", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "klg1", from: "05-08" } },
    { sn: "212900107", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "klg2", from: "05-08" } },
    { sn: "312800202", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "installed", obj: "klg3", from: "05-15" } },
    { sn: "201900303", nom: "Omnicomm Light", imei: im(), disp: { t: "installed", obj: "klg4", from: "05-18", conservFrom: "06-16" } },
    // ГУ УПТ
    { sn: "312800204", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "installed", obj: "gu1", from: "05-18" } },
    { sn: "312800205", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "installed", obj: "gu2", from: "05-19" } },
    { sn: "312800206", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "installed", obj: "gu3", from: "05-20" } },
    // СтройТехСервис
    { sn: "212900108", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "sts1", from: "05-01" } }, // снимут заменой 12.06
    { sn: "201900305", nom: "Omnicomm Light", imei: im(), disp: { t: "installed", obj: "sts2", from: "05-10" } },
    { sn: "201900306", nom: "Omnicomm Light", imei: im(), disp: { t: "installed", obj: "sts3", from: "05-10", disabledFrom: "06-25" } },
    // ИП Асанов (терминал снят в ремонт 01.07)
    { sn: "212900110", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "dismantled", obj: "asn1", from: "05-22", to: "07-01" } },
    // АгроТранс Астана
    { sn: "312800209", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "installed", obj: "agt2", from: "05-28" } },
    { sn: "312800210", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "installed", obj: "agt3", from: "06-01" } },
    // ИП Жумабеков
    { sn: "201900308", nom: "Omnicomm Light", imei: im(), disp: { t: "installed", obj: "zhb1", from: "05-15" } },
    // ЕвроАзияТранс (312800211 — после тест-драйва 01–15.06)
    { sn: "212900111", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "eat1", from: "05-05" } },
    { sn: "312800211", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "installed", obj: "eat2", from: "06-15" } },
    { sn: "212900112", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "eat3", from: "05-05", disabledFrom: "06-28" } },
    // Шахтинск Транс
    { sn: "212900113", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "installed", obj: "sht2", from: "05-30" } },
    // Под июньские акты (склад → монтаж движком)
    { sn: "212900103", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "stock", wh: mainWh } }, // c1 gkt3
    { sn: "560100402", nom: "ДУТ Omnicomm LLS 5", disp: { t: "stock", wh: mainWh } },             // c1 gkt3
    { sn: "312800201", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "stock", wh: mainWh } },   // c2 gkt7
    { sn: "312800203", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "stock", wh: mainWh } },   // c3 klg5
    { sn: "312800208", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "stock", wh: astanaWh } }, // c4 agt1
    { sn: "212900109", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "stock", wh: mainWh } }, // c5 sts1 замена
    { sn: "201900309", nom: "Omnicomm Light", imei: im(), disp: { t: "stock", wh: mainWh } },     // c7 sht1
    { sn: "312800207", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "stock", wh: mainWh } },   // c8 gu4
    { sn: "201900307", nom: "Omnicomm Light", imei: im(), disp: { t: "stock", wh: mainWh } },     // c9 asn2
    // Свободный остаток: склад / техники / тест / гарантия
    { sn: "212900114", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "stock", wh: mainWh } },
    { sn: "312800212", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "stock", wh: mainWh } },
    { sn: "201900310", nom: "Omnicomm Light", imei: im(), disp: { t: "stock", wh: astanaWh } },
    { sn: "312800213", nom: "Omnicomm Optim 3", imei: im(), disp: { t: "stock", wh: astanaWh } },
    { sn: "212900115", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "tech", user: serik } },
    { sn: "201900311", nom: "Omnicomm Light", imei: im(), disp: { t: "tech", user: kovalev } },
    { sn: "201900304", nom: "Omnicomm Light", imei: im(), disp: { t: "testing" } },   // тестирование КЛГ с 25.06
    { sn: "212900116", nom: "Omnicomm Profi 2.0", imei: im(), disp: { t: "supplier" } }, // гарантия
    { sn: "201900312", nom: "Omnicomm Light", imei: im(), disp: { t: "stock", wh: mainWh, cond: "used" } }, // БУ
  ];

  const EQ: Record<string, string> = {};
  for (const e of EQ_DEFS) {
    const ex = await one<{ id: string }>(`SELECT id FROM equipment_items WHERE serial_number=$1`, [e.sn]);
    if (ex) {
      EQ[e.sn] = ex.id;
      track("equipment_items", false);
      continue;
    }
    const price = Number(
      (await one<{ p: string }>(`SELECT default_price::text AS p FROM nomenclature WHERE id=$1`, [NOM[e.nom]]))?.p ?? 0
    );
    const d = e.disp;
    let row: { id: string };
    if (d.t === "installed") {
      const state = d.disabledFrom ? "disabled" : d.conservFrom ? "conservation" : "active";
      const cid = (await one<{ client_id: string }>(
        `SELECT client_id FROM monitoring_objects WHERE id=$1`, [OBJ[d.obj]]
      ))!.client_id;
      row = (await query<{ id: string }>(
        `INSERT INTO equipment_items (nomenclature_id, serial_number, imei, condition, status,
           billing_state, client_id, object_id, purchase_price)
         VALUES ($1,$2,$3,'new','installed',$4,$5,$6,$7) RETURNING id`,
        [NOM[e.nom], e.sn, e.imei ?? null, state, cid, OBJ[d.obj], price]
      ))[0];
      const from = ts(d.from, "09:00");
      if (d.conservFrom) {
        const mid = ts(d.conservFrom, "09:00");
        await query(
          `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, valid_to, source_type)
           VALUES ($1,$2,$3,'active',$4,$5,'import'), ($1,$2,$3,'conservation',$5,NULL,'manual')`,
          [row.id, OBJ[d.obj], cid, from, mid]
        );
      } else if (d.disabledFrom) {
        const mid = ts(d.disabledFrom, "09:00");
        await query(
          `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, valid_to, source_type)
           VALUES ($1,$2,$3,'active',$4,$5,'import'), ($1,$2,$3,'disabled',$5,NULL,'manual')`,
          [row.id, OBJ[d.obj], cid, from, mid]
        );
      } else {
        await query(
          `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, source_type)
           VALUES ($1,$2,$3,'active',$4,'import')`,
          [row.id, OBJ[d.obj], cid, from]
        );
      }
    } else if (d.t === "dismantled") {
      const cid = (await one<{ client_id: string }>(
        `SELECT client_id FROM monitoring_objects WHERE id=$1`, [OBJ[d.obj]]
      ))!.client_id;
      row = (await query<{ id: string }>(
        `INSERT INTO equipment_items (nomenclature_id, serial_number, imei, condition, status, warehouse_id, purchase_price, note)
         VALUES ($1,$2,$3,'used','in_stock',$4,$5,'Снят в ремонт 01.07.2026') RETURNING id`,
        [NOM[e.nom], e.sn, e.imei ?? null, mainWh, price]
      ))[0];
      await query(
        `INSERT INTO equipment_state_history (equipment_id, object_id, client_id, state, valid_from, valid_to, source_type)
         VALUES ($1,$2,$3,'active',$4,$5,'import')`,
        [row.id, OBJ[d.obj], cid, ts(d.from, "09:00"), ts(d.to, "10:00")]
      );
    } else if (d.t === "stock") {
      row = (await query<{ id: string }>(
        `INSERT INTO equipment_items (nomenclature_id, serial_number, imei, condition, status, warehouse_id, purchase_price)
         VALUES ($1,$2,$3,$4,'in_stock',$5,$6) RETURNING id`,
        [NOM[e.nom], e.sn, e.imei ?? null, d.cond ?? "new", d.wh, price]
      ))[0];
    } else if (d.t === "tech") {
      const wh = d.user === serik ? serikWh : kovalevWh;
      row = (await query<{ id: string }>(
        `INSERT INTO equipment_items (nomenclature_id, serial_number, imei, condition, status, warehouse_id, holder_id, purchase_price)
         VALUES ($1,$2,$3,'new','with_technician',$4,$5,$6) RETURNING id`,
        [NOM[e.nom], e.sn, e.imei ?? null, wh, d.user, price]
      ))[0];
    } else if (d.t === "testing") {
      row = (await query<{ id: string }>(
        `INSERT INTO equipment_items (nomenclature_id, serial_number, imei, condition, status, warehouse_id, purchase_price)
         VALUES ($1,$2,$3,'new','on_testing',$4,$5) RETURNING id`,
        [NOM[e.nom], e.sn, e.imei ?? null, testingWh, price]
      ))[0];
    } else {
      row = (await query<{ id: string }>(
        `INSERT INTO equipment_items (nomenclature_id, serial_number, imei, condition, status, supplier_id, purchase_price, note)
         VALUES ($1,$2,$3,'new','at_supplier',$4,$5,'Гарантийный возврат поставщику') RETURNING id`,
        [NOM[e.nom], e.sn, e.imei ?? null, supplier, price]
      ))[0];
    }
    EQ[e.sn] = row.id;
    track("equipment_items", true);
  }

  // ================= 9. SIM-карты =================
  type SimDef = { icc: string; msisdn: string; op: keyof typeof OPS; where:
    | { t: "eq"; sn: string } | { t: "stock" } | { t: "tech"; user: string } };
  const SIM_DEFS: SimDef[] = [
    { icc: "8977010000000010101", msisdn: "+77055501011", op: "beeline", where: { t: "eq", sn: "212900101" } },
    { icc: "8977010000000010102", msisdn: "+77055501012", op: "beeline", where: { t: "eq", sn: "212900102" } },
    { icc: "8977020000000010103", msisdn: "+77015501013", op: "kcell", where: { t: "eq", sn: "201900301" } },
    { icc: "8977020000000010104", msisdn: "+77015501014", op: "kcell", where: { t: "eq", sn: "212900104" } },
    { icc: "8977070000000010105", msisdn: "+77075501015", op: "tele2", where: { t: "eq", sn: "212900105" } },
    { icc: "8977010000000010106", msisdn: "+77055501016", op: "beeline", where: { t: "eq", sn: "212900106" } },
    { icc: "8977010000000010107", msisdn: "+77055501017", op: "beeline", where: { t: "eq", sn: "212900107" } },
    { icc: "8977020000000010108", msisdn: "+77015501018", op: "kcell", where: { t: "eq", sn: "312800202" } },
    { icc: "8977070000000010109", msisdn: "+77075501019", op: "tele2", where: { t: "eq", sn: "312800204" } },
    { icc: "8977070000000010110", msisdn: "+77075501020", op: "tele2", where: { t: "eq", sn: "312800205" } },
    { icc: "8977010000000010111", msisdn: "+77055501021", op: "beeline", where: { t: "eq", sn: "212900111" } },
    { icc: "8977020000000010112", msisdn: "+77015501022", op: "kcell", where: { t: "eq", sn: "312800209" } },
    // для июньских актов (установятся движком через act_sim_ops)
    { icc: "8977010000000010113", msisdn: "+77055501023", op: "beeline", where: { t: "stock" } }, // c1
    { icc: "8977020000000010114", msisdn: "+77015501024", op: "kcell", where: { t: "stock" } },   // c3
    { icc: "8977070000000010115", msisdn: "+77075501025", op: "tele2", where: { t: "stock" } },   // c7
    // склад и техники
    { icc: "8977010000000010116", msisdn: "+77055501026", op: "beeline", where: { t: "stock" } },
    { icc: "8977020000000010117", msisdn: "+77015501027", op: "kcell", where: { t: "stock" } },
    { icc: "8977070000000010118", msisdn: "+77075501028", op: "tele2", where: { t: "stock" } },
    { icc: "8977010000000010119", msisdn: "+77055501029", op: "beeline", where: { t: "tech", user: serik } },
    { icc: "8977020000000010120", msisdn: "+77015501030", op: "kcell", where: { t: "tech", user: kovalev } },
  ];
  const SIM: Record<string, string> = {};
  for (const s of SIM_DEFS) {
    const ex = await one<{ id: string }>(`SELECT id FROM sim_cards WHERE icc=$1`, [s.icc]);
    if (ex) {
      SIM[s.icc] = ex.id;
      track("sim_cards", false);
      continue;
    }
    let row: { id: string };
    if (s.where.t === "eq") {
      row = (await query<{ id: string }>(
        `INSERT INTO sim_cards (icc, msisdn, operator_id, plan_id, location_type, equipment_id, status)
         VALUES ($1,$2,$3,$4,'equipment',$5,'installed') RETURNING id`,
        [s.icc, s.msisdn, OPS[s.op], PLANS[s.op], EQ[s.where.sn]]
      ))[0];
    } else if (s.where.t === "tech") {
      row = (await query<{ id: string }>(
        `INSERT INTO sim_cards (icc, msisdn, operator_id, plan_id, location_type, holder_id, status)
         VALUES ($1,$2,$3,$4,'employee',$5,'assigned') RETURNING id`,
        [s.icc, s.msisdn, OPS[s.op], PLANS[s.op], s.where.user]
      ))[0];
    } else {
      row = (await query<{ id: string }>(
        `INSERT INTO sim_cards (icc, msisdn, operator_id, plan_id, location_type, warehouse_id, status)
         VALUES ($1,$2,$3,$4,'warehouse',$5,'in_stock') RETURNING id`,
        [s.icc, s.msisdn, OPS[s.op], PLANS[s.op], mainWh]
      ))[0];
    }
    SIM[s.icc] = row.id;
    track("sim_cards", true);
  }

  // ================= 10. Телематика: учётка, связки, sync_log =================
  const tmAccount = await ensure(
    "telematics_accounts",
    `SELECT id FROM telematics_accounts WHERE server_id=$1 AND client_id=$2`,
    [tmServer, CL.gkt],
    `INSERT INTO telematics_accounts (server_id, client_id, login, auto_block_debtors)
     VALUES ($1,$2,'gktrans_kz',true) RETURNING id`,
    [tmServer, CL.gkt]
  );
  const TM_LINKS: { obj: string; eq: string; acc?: string }[] = [
    { obj: "gkt1", eq: "212900101", acc: tmAccount },
    { obj: "gkt2", eq: "212900102", acc: tmAccount },
    { obj: "gkt4", eq: "201900301", acc: tmAccount },
    { obj: "gkt6", eq: "212900104", acc: tmAccount },
    { obj: "gkt9", eq: "201900302", acc: tmAccount },
    { obj: "klg1", eq: "212900106" },
    { obj: "klg2", eq: "212900107" },
    { obj: "klg3", eq: "312800202" },
    { obj: "gu1", eq: "312800204" },
    { obj: "gu2", eq: "312800205" },
  ];
  for (const l of TM_LINKS) {
    const objName = (await one<{ name: string }>(`SELECT name FROM monitoring_objects WHERE id=$1`, [OBJ[l.obj]]))!.name;
    await ensure(
      "telematics_object_links",
      `SELECT id FROM telematics_object_links WHERE server_id=$1 AND object_id=$2`,
      [tmServer, OBJ[l.obj]],
      `INSERT INTO telematics_object_links (server_id, account_id, object_id, equipment_id,
         external_uuid, external_name, sync_status, last_synced_at)
       VALUES ($1,$2,$3,$4, gen_random_uuid()::text, $5, 'synced', $6) RETURNING id`,
      [tmServer, l.acc ?? null, OBJ[l.obj], EQ[l.eq], objName, ts("06-30", "23:40")]
    );
  }
  const SYNC_LOGS: [string, string, string][] = [
    ["import", "06-10", "Импорт объектов клиента ТОО «Горкомтранс КЗ» (5 шт.)"],
    ["create_object", "06-22", "Создание объекта Yutong ZK6128HG 004AB09"],
    ["health", "07-05", "Health-проба online.omnicomm.ru: ok"],
  ];
  for (const [op, md, note] of SYNC_LOGS) {
    await ensure(
      "sync_log",
      `SELECT id FROM sync_log WHERE payload->>'seed' = $1`,
      [`demo-${op}-${md}`],
      `INSERT INTO sync_log (server_id, operation, status, payload, duration_ms, created_at)
       VALUES ($1,$2,'ok', jsonb_build_object('seed',$3::text,'note',$4::text), $5, $6) RETURNING id`,
      [tmServer, op, `demo-${op}-${md}`, note, 350 + Math.floor(Math.random() * 400), ts(md, "10:30")]
    );
  }

  // ================= 11. Ремонт, тестирование, продажи =================
  async function repairDoc(
    marker: string, docType: string, status: string, md: string,
    clientId: string | null, eqSn: string, defect: string | null
  ) {
    const id = await ensure(
      "equipment_repair_docs",
      `SELECT id FROM equipment_repair_docs WHERE note LIKE $1`,
      [`%[demo:${marker}]%`],
      `INSERT INTO equipment_repair_docs (number, doc_type, client_id, supplier_id, status, note, performed_by, created_at)
       VALUES ('РМ-' || lpad(nextval('seq_repair_doc_number')::text, 6, '0'),
               $1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [docType, clientId, supplier, status, `${defect ?? ""} [demo:${marker}]`.trim(), admin.id, ts(md, "11:00")]
    );
    await ensure(
      "equipment_repair_doc_items",
      `SELECT id FROM equipment_repair_doc_items WHERE doc_id=$1 AND equipment_id=$2`,
      [id, EQ[eqSn]],
      `INSERT INTO equipment_repair_doc_items (doc_id, equipment_id, defect_note) VALUES ($1,$2,$3) RETURNING id`,
      [id, EQ[eqSn], defect]
    );
    return id;
  }
  // Завершённый цикл июня: ДУТ Горкомтранс (без прерывания биллинга — подменный фонд)
  await repairDoc("rem1", "receive_from_client", "closed", "06-05", CL.gkt, "560100401", "Занижение уровня топлива");
  await repairDoc("rem2", "send_to_supplier", "closed", "06-08", null, "560100401", null);
  await repairDoc("rem3", "receive_from_supplier", "closed", "06-20", null, "560100401", null);
  await repairDoc("rem4", "issue_to_client", "closed", "06-22", CL.gkt, "560100401", null);
  // Открытый приём от клиента 01.07 (ИП Асанов) и гарантия поставщику
  await repairDoc("rem5", "receive_from_client", "open", "07-01", CL.asn, "212900110", "Не выходит на связь после ДТП");
  await repairDoc("rem6", "send_to_supplier", "open", "06-28", null, "212900116", "Брак при входном контроле — гарантия");

  // Тестирование, завершённое продажей (ЕвроАзияТранс, 01–15.06)
  const eatCp = await one<{ id: string }>(`SELECT id FROM counterparties WHERE client_id=$1 LIMIT 1`, [CL.eat]);
  const saleOrder = await ensure(
    "sales_orders",
    `SELECT id FROM sales_orders WHERE note LIKE '%[demo:so-eat]%'`,
    [],
    `INSERT INTO sales_orders (number, client_id, counterparty_id, warehouse_id, shipment_order,
       status, manager_id, total_amount, vat_rate, note, created_at)
     VALUES ('ЗК-' || lpad(nextval('seq_sales_order_number')::text, 6, '0'),
             $1,$2,$3,'on_install','realized',$4,100000,16,'Продажа по итогам тест-драйва [demo:so-eat]',$5)
     RETURNING id`,
    [CL.eat, eatCp?.id ?? null, mainWh, manager.id, ts("06-15", "15:00")]
  );
  for (const [nom, name, isSrv, qty, price] of [
    ["Omnicomm Optim 3", "Omnicomm Optim 3", false, 1, 95000],
    ["Монтажные работы", "Монтажные работы", true, 1, 5000],
  ] as const) {
    await ensure(
      "sales_order_items",
      `SELECT id FROM sales_order_items WHERE order_id=$1 AND name=$2`,
      [saleOrder, name],
      `INSERT INTO sales_order_items (order_id, nomenclature_id, name, is_service, quantity, price, object_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [saleOrder, NOM[nom], name, isSrv, qty, price, OBJ.eat2]
    );
  }
  for (const [kind, md, amount] of [["invoice", "06-15", 100000], ["waybill", "06-16", 95000]] as const) {
    await ensure(
      "sales_invoices",
      `SELECT id FROM sales_invoices WHERE order_id=$1 AND kind=$2`,
      [saleOrder, kind],
      `INSERT INTO sales_invoices (order_id, kind, number, amount, issued_at)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [saleOrder, kind, `${kind === "invoice" ? "СЧФ" : "З-2"}-000${kind === "invoice" ? "41" : "42"}`, amount, ts(md, "12:00")]
    );
  }
  const testDone = await ensure(
    "testing_orders",
    `SELECT id FROM testing_orders WHERE note LIKE '%[demo:test-eat]%'`,
    [],
    `INSERT INTO testing_orders (number, client_id, object_id, warehouse_id, status, result,
       sales_order_id, started_at, finished_at, note, created_at)
     VALUES ('ЗТ-' || lpad(nextval('seq_testing_order_number')::text, 6, '0'),
             $1,$2,$3,'completed','sale',$4,$5,$6,'Тест-драйв Optim 3 [demo:test-eat]',$5) RETURNING id`,
    [CL.eat, OBJ.eat2, testingWh, saleOrder, ts("06-01", "09:00"), ts("06-15", "14:00")]
  );
  await ensure(
    "testing_order_items",
    `SELECT id FROM testing_order_items WHERE testing_order_id=$1`,
    [testDone],
    `INSERT INTO testing_order_items (testing_order_id, equipment_id) VALUES ($1,$2) RETURNING id`,
    [testDone, EQ["312800211"]]
  );
  // Открытое тестирование с 25.06 (КарагандаЛогистик)
  const testOpen = await ensure(
    "testing_orders",
    `SELECT id FROM testing_orders WHERE note LIKE '%[demo:test-klg]%'`,
    [],
    `INSERT INTO testing_orders (number, client_id, object_id, warehouse_id, status, started_at, note, created_at)
     VALUES ('ЗТ-' || lpad(nextval('seq_testing_order_number')::text, 6, '0'),
             $1,$2,$3,'open',$4,'Тестирование Omnicomm Light на самосвале [demo:test-klg]',$4) RETURNING id`,
    [CL.klg, OBJ.klg5, testingWh, ts("06-25", "10:00")]
  );
  await ensure(
    "testing_order_items",
    `SELECT id FROM testing_order_items WHERE testing_order_id=$1`,
    [testOpen],
    `INSERT INTO testing_order_items (testing_order_id, equipment_id) VALUES ($1,$2) RETURNING id`,
    [testOpen, EQ["201900304"]]
  );
  // Госзакуп ГУ: заказ «закрывающие до установки»
  const guCp = await one<{ id: string }>(`SELECT id FROM counterparties WHERE client_id=$1 LIMIT 1`, [CL.gu]);
  const guOrder = await ensure(
    "sales_orders",
    `SELECT id FROM sales_orders WHERE note LIKE '%[demo:so-gu]%'`,
    [],
    `INSERT INTO sales_orders (number, client_id, counterparty_id, warehouse_id, shipment_order,
       status, manager_id, total_amount, vat_rate, note, created_at)
     VALUES ('ЗК-' || lpad(nextval('seq_sales_order_number')::text, 6, '0'),
             $1,$2,$3,'before_install','realized',$4,400000,16,
             'Госзакуп: оснащение автобусов, закрывающие до монтажа [demo:so-gu]',$5) RETURNING id`,
    [CL.gu, guCp?.id ?? null, mainWh, manager.id, ts("06-02", "09:30")]
  );
  for (const [nom, name, isSrv, qty, price] of [
    ["Omnicomm Optim 3", "Omnicomm Optim 3 (автобусы Yutong)", false, 4, 95000],
    ["Монтажные работы", "Монтаж терминала на автобус", true, 4, 5000],
  ] as const) {
    await ensure(
      "sales_order_items",
      `SELECT id FROM sales_order_items WHERE order_id=$1 AND name=$2`,
      [guOrder, name],
      `INSERT INTO sales_order_items (order_id, nomenclature_id, name, is_service, quantity, price)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [guOrder, NOM[nom], name, isSrv, qty, price]
    );
  }
  for (const [kind, md, amount, num] of [
    ["invoice", "06-02", 400000, "СЧФ-00038"],
    ["realization", "06-25", 20000, "Р1-00039"],
    ["waybill", "06-25", 380000, "З2-00040"],
  ] as const) {
    await ensure(
      "sales_invoices",
      `SELECT id FROM sales_invoices WHERE order_id=$1 AND kind=$2`,
      [guOrder, kind],
      `INSERT INTO sales_invoices (order_id, kind, number, amount, issued_at) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [guOrder, kind, num, amount, ts(md, "12:00")]
    );
  }

  // ================= 12. Июньские цепочки «заявка → наряд → акт ТО» =================
  type ChainLine = { action: "install" | "replace" | "diagnostics"; installSn?: string; removeSn?: string; wt: string };
  type Chain = {
    key: string; date: string; // MM-DD
    type: "connect" | "replace" | "diagnostics";
    client: string; obj: string; tech: string; techName: string;
    subject: string; source: string;
    lines: ChainLine[]; works: string[]; sim?: { icc: string; sn: string };
  };
  const CHAINS: Chain[] = [
    { key: "c1", date: "06-03", type: "connect", client: "gkt", obj: "gkt3", tech: serik, techName: "Серик Жумабеков",
      subject: "Подключение нового КАМАЗа (терминал + ДУТ)", source: "whatsapp",
      lines: [
        { action: "install", installSn: "212900103", wt: "Монтаж терминала" },
        { action: "install", installSn: "560100402", wt: "Монтаж ДУТ" },
      ],
      works: ["Монтаж терминала", "Монтаж ДУТ"], sim: { icc: "8977010000000010113", sn: "212900103" } },
    { key: "c2", date: "06-05", type: "connect", client: "gkt", obj: "gkt7", tech: kovalev, techName: "Андрей Ковалёв",
      subject: "Подключение Shacman X3000", source: "phone",
      lines: [{ action: "install", installSn: "312800201", wt: "Монтаж терминала" }],
      works: ["Монтаж терминала"] },
    { key: "c3", date: "06-08", type: "connect", client: "klg", obj: "klg5", tech: serik, techName: "Серик Жумабеков",
      subject: "Подключение КАМАЗа к мониторингу", source: "email",
      lines: [{ action: "install", installSn: "312800203", wt: "Монтаж терминала" }],
      works: ["Монтаж терминала"], sim: { icc: "8977020000000010114", sn: "312800203" } },
    { key: "c4", date: "06-10", type: "connect", client: "agt", obj: "agt1", tech: demoTech.id, techName: "Монтажник Демо",
      subject: "Монтаж терминала (Астана)", source: "phone",
      lines: [{ action: "install", installSn: "312800208", wt: "Монтаж терминала" }],
      works: ["Монтаж терминала"] },
    { key: "c5", date: "06-12", type: "replace", client: "sts", obj: "sts1", tech: serik, techName: "Серик Жумабеков",
      subject: "Замена неисправного терминала", source: "phone",
      lines: [{ action: "replace", installSn: "212900109", removeSn: "212900108", wt: "Замена терминала" }],
      works: ["Замена терминала"] },
    { key: "c6", date: "06-15", type: "diagnostics", client: "eat", obj: "eat1", tech: kovalev, techName: "Андрей Ковалёв",
      subject: "Диагностика: пропадает сигнал GPS", source: "whatsapp",
      lines: [{ action: "diagnostics", wt: "Диагностика" }],
      works: ["Диагностика"] },
    { key: "c7", date: "06-18", type: "connect", client: "sht", obj: "sht1", tech: demoTech.id, techName: "Монтажник Демо",
      subject: "Подключение КАМАЗа (Шахтинск)", source: "phone",
      lines: [{ action: "install", installSn: "201900309", wt: "Монтаж терминала" }],
      works: ["Монтаж терминала"], sim: { icc: "8977070000000010115", sn: "201900309" } },
    { key: "c8", date: "06-22", type: "connect", client: "gu", obj: "gu4", tech: serik, techName: "Серик Жумабеков",
      subject: "Оснащение автобуса Yutong (госзакуп)", source: "email",
      lines: [{ action: "install", installSn: "312800207", wt: "Монтаж терминала" }],
      works: ["Монтаж терминала"] },
    { key: "c9", date: "06-25", type: "connect", client: "asn", obj: "asn2", tech: kovalev, techName: "Андрей Ковалёв",
      subject: "Подключение второй ГАЗели", source: "telegram",
      lines: [{ action: "install", installSn: "201900307", wt: "Монтаж терминала" }],
      works: ["Монтаж терминала"] },
    { key: "c10", date: "06-26", type: "diagnostics", client: "klg", obj: "klg1", tech: kovalev, techName: "Андрей Ковалёв",
      subject: "Диагностика перед рейсом за рубеж", source: "phone",
      lines: [{ action: "diagnostics", wt: "Диагностика" }],
      works: ["Диагностика"] },
  ];

  const chainRefs: Record<string, { requestId: string; actId: string; woId: string }> = {};
  for (const ch of CHAINS) {
    const marker = `[demo:${ch.key}]`;
    const exist = await one<{ id: string }>(`SELECT id FROM requests WHERE description LIKE $1`, [`%${marker}%`]);
    if (exist) {
      track("chains (закрытые акты июня)", false);
      continue;
    }
    const day = ch.date;
    const clientId = CL[ch.client];
    const objId = OBJ[ch.obj];
    const address = (await one<{ legal_address: string }>(
      `SELECT legal_address FROM counterparties WHERE client_id=$1 LIMIT 1`, [clientId]
    ))?.legal_address ?? "г. Караганда";

    const req = await one<{ id: string }>(
      `INSERT INTO requests (number, client_id, object_id, type, priority, source, subject, description,
         status, manager_id, support_id, installer_id, photo_required, due_at, created_at)
       VALUES ('Z-' || lpad(nextval('seq_request_number')::text, 6, '0'),
               $1,$2,$3,'normal',$4,$5,$6,'assigned',$7,$8,$9,$10,$11::timestamptz,$12::timestamptz)
       RETURNING id`,
      [clientId, objId, ch.type, ch.source, ch.subject, `${ch.subject}. ${marker}`,
       manager.id, support.id, ch.tech, ch.type !== "diagnostics",
       ts(day, "18:00"), `${ts(day, "09:00")}`]
    );
    await query(
      `INSERT INTO request_history (request_id, action, detail, user_id, created_at)
       VALUES ($1,'created','Заявка создана',$2,$3::timestamptz),
              ($1,'assigned',$4,$2,$5::timestamptz)`,
      [req!.id, manager.id, ts(day, "09:10"), `Назначен техник: ${ch.techName}`, ts(day, "09:15")]
    );
    const wo = await one<{ id: string }>(
      `INSERT INTO work_orders (number, client_id, object_id, request_id, address, scheduled_start,
         scheduled_end, status, logist_id, created_by, created_at, note)
       VALUES ('ЗН-' || lpad(nextval('seq_work_order_number')::text, 6, '0'),
               $1,$2,$3,$4,$5::timestamptz,$6::timestamptz,'planned',$7,$7,$5::timestamptz,$8)
       RETURNING id`,
      [clientId, objId, req!.id, address, ts(day, "10:00"), ts(day, "13:00"), manager.id, marker]
    );
    await query(
      `INSERT INTO work_order_performers (work_order_id, user_id, is_lead) VALUES ($1,$2,true)`,
      [wo!.id, ch.tech]
    );
    const act = await one<{ id: string }>(
      `INSERT INTO maintenance_acts (work_order_id, status, performed_by, client_signer_name,
         signed_by_client_at, note, created_at)
       VALUES ($1,'in_preparation',$2,$3,$4::timestamptz,$5,$4::timestamptz) RETURNING id`,
      [wo!.id, ch.tech, "Представитель заказчика", ts(day, "12:40"), marker]
    );
    for (const l of ch.lines) {
      await query(
        `INSERT INTO maintenance_act_lines (act_id, action, basis, object_id, installed_equipment_id,
           removed_equipment_id, work_type_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamptz)`,
        [act!.id, l.action, l.action === "diagnostics" ? null : "sales_order", objId,
         l.installSn ? EQ[l.installSn] : null, l.removeSn ? EQ[l.removeSn] : null,
         WT[l.wt], ts(day, "12:00")]
      );
    }
    for (const w of ch.works) {
      await query(
        `INSERT INTO act_works (act_id, work_type_id, performer_id, quantity, rate, amount, created_at)
         VALUES ($1,$2,$3,1,0,0,$4::timestamptz)`,
        [act!.id, WT[w], ch.tech, ts(day, "12:30")]
      );
    }
    // материалы по нормам вида работ
    for (const w of ch.works) {
      const norms = await query<{ nomenclature_id: string; quantity: string }>(
        `SELECT nomenclature_id, quantity FROM material_norms WHERE work_type_id=$1`, [WT[w]]
      );
      for (const n of norms) {
        await query(
          `INSERT INTO act_materials (act_id, nomenclature_id, quantity, by_norm, created_at)
           VALUES ($1,$2,$3,true,$4::timestamptz)`,
          [act!.id, n.nomenclature_id, n.quantity, ts(day, "12:30")]
        );
      }
    }
    if (ch.sim) {
      await query(
        `INSERT INTO act_sim_ops (act_id, sim_id, op, equipment_id) VALUES ($1,$2,'install',$3)`,
        [act!.id, SIM[ch.sim.icc], EQ[ch.sim.sn]]
      );
    }
    await query(
      `INSERT INTO attachments (entity_type, entity_id, kind, place, filename, url, uploaded_by, created_at)
       VALUES ('maintenance_act',$1,'photo','кабина','photo_kabina.jpg','seed://photo',$2,$3::timestamptz),
              ('maintenance_act',$1,'photo','разъём','photo_razem.jpg','seed://photo',$2,$3::timestamptz)`,
      [act!.id, ch.tech, ts(day, "12:35")]
    );

    // Закрытие РЕАЛЬНЫМ движком (движения, ESH, SIM, payroll_entries, статусы)
    const t0 = (await one<{ n: string }>(`SELECT now()::text AS n`))!.n;
    await closeMaintenanceAct(act!.id, admin.id);

    // Откат дат на июньские (движок ставит now())
    const closedTs = ts(day, "13:00");
    await query(`UPDATE maintenance_acts SET closed_at=$2::timestamptz WHERE id=$1`, [act!.id, closedTs]);
    await query(`UPDATE requests SET closed_at=$2::timestamptz WHERE id=$1`, [req!.id, closedTs]);
    await query(
      `UPDATE payroll_entries SET entry_date=$2::date
       WHERE act_work_id IN (SELECT id FROM act_works WHERE act_id=$1)`,
      [act!.id, `2026-${day}`]
    );
    await query(
      `UPDATE equipment_state_history SET valid_from=$2::timestamptz WHERE source_type='maintenance_act' AND source_id=$1`,
      [act!.id, closedTs]
    );
    await query(
      `UPDATE equipment_state_history SET valid_to=$2::timestamptz
       WHERE source_type='maintenance_act' AND source_id=$1 AND valid_to IS NOT NULL`,
      [act!.id, closedTs]
    );
    await query(
      `UPDATE equipment_state_history SET valid_to=$2::timestamptz
       WHERE valid_to >= $3::timestamptz AND equipment_id IN
         (SELECT removed_equipment_id FROM maintenance_act_lines WHERE act_id=$1 AND removed_equipment_id IS NOT NULL)`,
      [act!.id, closedTs, t0]
    );
    await query(
      `UPDATE equipment_movements SET created_at=$2::timestamptz WHERE source_type='maintenance_act' AND source_id=$1`,
      [act!.id, closedTs]
    );
    await query(
      `UPDATE request_history SET created_at=$2::timestamptz WHERE request_id=$1 AND created_at > $3::timestamptz`,
      [req!.id, closedTs, t0]
    );
    chainRefs[ch.key] = { requestId: req!.id, actId: act!.id, woId: wo!.id };
    track("chains (закрытые акты июня)", true);
  }

  // Акт «требуется доработка» (СтройТехСервис, 20.06)
  {
    const marker = "[demo:rw1]";
    const exist = await one<{ id: string }>(`SELECT id FROM requests WHERE description LIKE $1`, [`%${marker}%`]);
    if (exist) track("rework act", false);
    else {
      const req = await one<{ id: string }>(
        `INSERT INTO requests (number, client_id, object_id, type, priority, source, subject, description,
           status, manager_id, installer_id, photo_required, created_at)
         VALUES ('Z-' || lpad(nextval('seq_request_number')::text, 6, '0'),
                 $1,$2,'diagnostics','high','phone','Сбой ДУТ на экскаваторе-погрузчике',
                 $3,'assigned',$4,$5,false,$6::timestamptz) RETURNING id`,
        [CL.sts, OBJ.sts2, `Сбой ДУТ на экскаваторе-погрузчике. ${marker}`, manager.id, serik, ts("06-19", "09:00")]
      );
      const wo = await one<{ id: string }>(
        `INSERT INTO work_orders (number, client_id, object_id, request_id, address, scheduled_start,
           scheduled_end, status, created_by, created_at, note)
         VALUES ('ЗН-' || lpad(nextval('seq_work_order_number')::text, 6, '0'),
                 $1,$2,$3,'г. Караганда, ул. Гоголя, 34',$4::timestamptz,$5::timestamptz,'planned',$6,$4::timestamptz,$7)
         RETURNING id`,
        [CL.sts, OBJ.sts2, req!.id, ts("06-20", "10:00"), ts("06-20", "12:00"), manager.id, marker]
      );
      await query(`INSERT INTO work_order_performers (work_order_id, user_id, is_lead) VALUES ($1,$2,true)`, [wo!.id, serik]);
      const act = await one<{ id: string }>(
        `INSERT INTO maintenance_acts (work_order_id, status, performed_by, note, created_at)
         VALUES ($1,'in_preparation',$2,$3,$4::timestamptz) RETURNING id`,
        [wo!.id, serik, marker, ts("06-20", "12:00")]
      );
      await query(
        `INSERT INTO maintenance_act_lines (act_id, action, object_id, work_type_id)
         VALUES ($1,'diagnostics',$2,$3)`,
        [act!.id, OBJ.sts2, WT["Диагностика"]]
      );
      await query(
        `INSERT INTO act_works (act_id, work_type_id, performer_id, quantity, rate, amount)
         VALUES ($1,$2,$3,1,0,0)`,
        [act!.id, WT["Диагностика"], serik]
      );
      await reworkMaintenanceAct(act!.id, admin.id, "Не устранён сбой ДУТ — требуется повторный выезд с тарировкой");
      track("rework act", true);
    }
  }

  // ================= 13. Июльский сервис: тикеты, заявки, наряды, командировка =================
  async function ensureTicket(
    marker: string, md: string, clientKey: string, channel: string, subject: string,
    status: string, resolution: string | null, closedMd: string | null
  ) {
    return ensure(
      "tickets",
      `SELECT id FROM tickets WHERE description LIKE $1`,
      [`%[demo:${marker}]%`],
      `INSERT INTO tickets (number, client_id, contact, channel, subject, description, status, resolution,
         assigned_to, closed_at, created_at)
       VALUES ('ТП-' || lpad(nextval('seq_ticket_number')::text, 6, '0'),
               $1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz,$10::timestamptz) RETURNING id`,
      [CL[clientKey], null, channel, subject, `${subject} [demo:${marker}]`, status, resolution,
       support.id, closedMd ? ts(closedMd, "16:00") : null, ts(md, "10:00")]
    );
  }
  await ensureTicket("t1", "06-09", "gkt", "phone", "Не отображается объект на карте", "done", "remote", "06-09");
  const t2 = await ensureTicket("t2", "07-04", "gkt", "whatsapp", "После заправки скачет уровень топлива", "on_service", "service_requests", null);
  await ensureTicket("t3", "07-05", "asn", "phone", "Перенести терминал на новую машину", "new", null, null);
  await ensureTicket("t4", "06-27", "sts", "email", "Просят скидку на абонплату", "rejected", "rejected", "06-27");

  type ReqDef = {
    key: string; md: string; client: string; obj: string | null; type: string; status: string;
    subject: string; tech?: string; ticket?: string; priority?: string;
  };
  const JULY_REQS: ReqDef[] = [
    { key: "r1", md: "07-03", client: "eat", obj: "eat4", type: "connect", status: "visit_planned",
      subject: "Подключение Shacman X3000 (новая машина)", tech: kovalev },
    { key: "r2", md: "07-04", client: "gkt", obj: "gkt1", type: "fuel_sensor_fault", status: "assigned",
      subject: "Скачет уровень топлива после заправки", tech: serik, ticket: t2, priority: "high" },
    { key: "r3", md: "07-05", client: "gkt", obj: "gkt2", type: "diagnostics", status: "in_progress",
      subject: "Проверка тарировки ДУТ", tech: serik, ticket: t2 },
    { key: "r4", md: "07-02", client: "klg", obj: "klg3", type: "diagnostics", status: "visit_planned",
      subject: "Плановая диагностика Shacman", tech: serik },
    { key: "r5", md: "07-01", client: "agt", obj: "agt3", type: "connect", status: "wait_parts",
      subject: "Дооснащение ДУТ (ждём поставку LLS 5)", tech: demoTech.id },
    { key: "r6", md: "07-06", client: "sts", obj: null, type: "payment_question", status: "new",
      subject: "Вопрос по задолженности за июнь" },
  ];
  const REQ: Record<string, string> = {};
  for (const r of JULY_REQS) {
    REQ[r.key] = await ensure(
      "requests (июль, открытые)",
      `SELECT id FROM requests WHERE description LIKE $1`,
      [`%[demo:${r.key}]%`],
      `INSERT INTO requests (number, ticket_id, client_id, object_id, type, priority, source, subject,
         description, status, manager_id, support_id, installer_id, photo_required, created_at)
       VALUES ('Z-' || lpad(nextval('seq_request_number')::text, 6, '0'),
               $1,$2,$3,$4,$5,'phone',$6,$7,$8,$9,$10,$11,$12,$13::timestamptz) RETURNING id`,
      [r.ticket ?? null, CL[r.client], r.obj ? OBJ[r.obj] : null, r.type, r.priority ?? "normal",
       r.subject, `${r.subject} [demo:${r.key}]`, r.status, manager.id, support.id,
       r.tech ?? null, r.type === "connect", ts(r.md, "11:00")]
    );
  }

  type WoDef = {
    key: string; req?: string; client: string; obj: string | null; tech: string;
    start: [string, string]; end: [string, string]; note: string;
    trip?: { from: string; to: string; transport: string; cost: number; note: string };
  };
  const JULY_WOS: WoDef[] = [
    { key: "w1", req: "r4", client: "klg", obj: "klg3", tech: serik,
      start: ["07-07", "09:00"], end: ["07-07", "12:00"], note: "Плановая диагностика" },
    { key: "w2", req: "r1", client: "eat", obj: "eat4", tech: kovalev,
      start: ["07-08", "10:00"], end: ["07-08", "14:00"], note: "Монтаж терминала на Shacman" },
    { key: "w3", client: "gu", obj: "gu1", tech: demoTech.id,
      start: ["07-09", "09:00"], end: ["07-09", "13:00"], note: "Профилактика по автобусам Yutong" },
    { key: "w4", client: "sht", obj: "sht1", tech: serik,
      start: ["07-08", "08:00"], end: ["07-10", "18:00"], note: "Выездное обслуживание, г. Балхаш",
      trip: { from: "2026-07-08", to: "2026-07-10", transport: "Служебный Toyota Hilux",
              cost: 85000, note: "Командировка Караганда — Балхаш, 3 дня (ГСМ + проживание)" } },
  ];
  for (const w of JULY_WOS) {
    const marker = `[demo:${w.key}]`;
    const id = await ensure(
      "work_orders (июль)",
      `SELECT id FROM work_orders WHERE note LIKE $1`,
      [`%${marker}%`],
      `INSERT INTO work_orders (number, client_id, object_id, request_id, address, scheduled_start,
         scheduled_end, status, logist_id, created_by, note)
       VALUES ('ЗН-' || lpad(nextval('seq_work_order_number')::text, 6, '0'),
               $1,$2,$3,$4,$5::timestamptz,$6::timestamptz,'planned',$7,$7,$8) RETURNING id`,
      [CL[w.client], w.obj ? OBJ[w.obj] : null, w.req ? REQ[w.req] : null,
       w.key === "w4" ? "г. Балхаш, промзона ГРЭС" : "по адресу клиента",
       ts(w.start[0], w.start[1]), ts(w.end[0], w.end[1]), manager.id, `${w.note} ${marker}`]
    );
    await query(
      `INSERT INTO work_order_performers (work_order_id, user_id, is_lead)
       VALUES ($1,$2,true) ON CONFLICT DO NOTHING`,
      [id, w.tech]
    );
    if (w.trip) {
      await ensure(
        "work_order_trips",
        `SELECT id FROM work_order_trips WHERE work_order_id=$1`,
        [id],
        `INSERT INTO work_order_trips (work_order_id, date_from, date_to, transport, cost, include_in_cost, note)
         VALUES ($1,$2,$3,$4,$5,true,$6) RETURNING id`,
        [id, w.trip.from, w.trip.to, w.trip.transport, w.trip.cost, w.trip.note]
      );
    }
  }

  // ================= 14. Биллинг июня/июля — ДВИЖКОМ =================
  const round2 = (n: number) => Math.round(n * 100) / 100;
  async function issueDoc(docId: string | null, md: string, sent: boolean) {
    if (!docId) return;
    await query(
      `UPDATE billing_documents
       SET status = CASE WHEN status='prepared' THEN $2 ELSE status END,
           issued_at = COALESCE(issued_at, $3::timestamptz),
           sent_at = CASE WHEN $2='sent' THEN COALESCE(sent_at, $3::timestamptz) ELSE sent_at END
       WHERE id=$1`,
      [docId, sent ? "sent" : "issued", ts(md, "12:00")]
    );
  }
  /** Оплата «как в API»: INSERT payments + paid_amount/status документа. */
  async function pay(docId: string | null, ref: string, md: string, amount?: number) {
    if (!docId) return;
    const exists = await one(`SELECT 1 AS x FROM payments WHERE bank_reference=$1`, [ref]);
    if (exists) {
      track("payments", false);
      return;
    }
    const doc = await one<{ client_id: string; total: string; paid_amount: string }>(
      `SELECT client_id, total::text, paid_amount::text FROM billing_documents WHERE id=$1`, [docId]
    );
    if (!doc) return;
    const a = round2(amount ?? Number(doc.total) - Number(doc.paid_amount));
    if (a <= 0) {
      track("payments", false);
      return;
    }
    const accountant = await one<{ id: string }>(`SELECT id FROM users WHERE email='a.sadykova@omnicomm.kz'`);
    await query(
      `INSERT INTO payments (client_id, billing_document_id, amount, paid_at, method, bank_reference, created_by)
       VALUES ($1,$2,$3,$4::timestamptz,'bank',$5,$6)`,
      [doc.client_id, docId, a, ts(md, "11:30"), ref, accountant?.id ?? admin.id]
    );
    await query(
      `UPDATE billing_documents SET
         paid_amount = paid_amount + $2,
         status = CASE WHEN paid_amount + $2 >= total THEN 'paid' ELSE 'partial' END
       WHERE id=$1`,
      [docId, a]
    );
    track("payments", true);
  }

  // 14.1 Июньские авансовые счета (advance-клиенты)
  const juneAdv: Record<string, string | null> = {};
  for (const [key, md] of [["gkt", "06-01"], ["gu", "06-02"]] as const) {
    const r = await generateClientDocument(CL[key], "2026-06", "advance_invoice", admin.id);
    juneAdv[key] = r.documentId;
    track("billing: advance_invoice июнь", !r.skipped);
    if (!r.skipped) await issueDoc(r.documentId, md, true);
  }
  // 14.2 Разовое начисление ДО актов (Горкомтранс, попадёт в июньский акт)
  await ensure(
    "accruals (one_time draft)",
    `SELECT id FROM accruals WHERE client_id=$1 AND method='one_time' AND note='Настройка отчётов BI'`,
    [CL.gkt],
    `INSERT INTO accruals (client_id, method, date_from, date_to, amount, status, note, created_at)
     VALUES ($1,'one_time','2026-06-25','2026-06-25',25000,'draft','Настройка отчётов BI',$2::timestamptz) RETURNING id`,
    [CL.gkt, ts("06-25", "15:00")]
  );
  // 14.3 Июньские акты (все клиенты; у ИП Жумабекова начислений нет — документ не создастся)
  const juneAct: Record<string, string | null> = {};
  for (const c of CLIENT_DEFS) {
    const r = await generateClientDocument(CL[c.key], "2026-06", "act", admin.id);
    juneAct[c.key] = r.documentId;
    track("billing: act июнь", !r.skipped && !!r.documentId);
    if (!r.skipped && r.documentId) {
      await issueDoc(r.documentId, c.key === "gkt" || c.key === "klg" ? "07-01" : "06-30", true);
    }
  }
  // 14.4 Оплаты июня: большинство полные, 2 частичные, СтройТехСервис — ноль
  await pay(juneAdv.gkt, "SEED-PAY-GKT-ADV06", "06-05");
  await pay(juneAdv.gu, "SEED-PAY-GU-ADV06", "06-10");
  await pay(juneAct.gkt, "SEED-PAY-GKT-ACT06", "07-02");
  await pay(juneAct.gu, "SEED-PAY-GU-ACT06", "07-03");
  await pay(juneAct.klg, "SEED-PAY-KLG-ACT06", "06-28", 15000); // частичная
  await pay(juneAct.asn, "SEED-PAY-ASN-ACT06", "07-01", 4000);  // частичная
  await pay(juneAct.agt, "SEED-PAY-AGT-ACT06", "06-30");
  await pay(juneAct.sht, "SEED-PAY-SHT-ACT06", "07-01");
  // sts — долг (ноль оплат); eat — total 0 после скидки, оплата не требуется

  // 14.5 Июльские авансовые счета (начало месяца)
  const julyAdv: Record<string, string | null> = {};
  for (const key of ["gkt", "gu"] as const) {
    const r = await generateClientDocument(CL[key], "2026-07", "advance_invoice", admin.id);
    julyAdv[key] = r.documentId;
    track("billing: advance_invoice июль", !r.skipped);
    if (!r.skipped) await issueDoc(r.documentId, "07-01", true);
  }
  await pay(julyAdv.gkt, "SEED-PAY-GKT-ADV07", "07-03");

  // ================= 15. ЗП: компенсации/удержания + ведомость июня =================
  const PE_DEFS: [string, string, string, number, string][] = [
    [serik, "compensation", "ГСМ (выезды по Караганде)", 15000, "2026-06-30"],
    [kovalev, "compensation", "Амортизация инструмента", 10000, "2026-06-30"],
    [demoTech.id, "deduction", "Нарушение регламента фотофиксации", 2000, "2026-06-28"],
  ];
  for (const [uid, kind, reason, amount, date] of PE_DEFS) {
    await ensure(
      "payroll_entries (комп/удерж)",
      `SELECT id FROM payroll_entries WHERE user_id=$1 AND kind=$2 AND reason=$3 AND entry_date=$4::date`,
      [uid, kind, reason, date],
      `INSERT INTO payroll_entries (user_id, entry_date, kind, reason, amount, note)
       VALUES ($1,$2::date,$3,$4,$5,'[demo]') RETURNING id`,
      [uid, date, kind, reason, amount]
    );
  }
  const sheet = await buildPayrollSheet("2026-06-01", "2026-06-30", admin.id);
  track("payroll_sheet июнь", !sheet.skipped);
  if (!sheet.skipped && sheet.sheetId) {
    await query(`UPDATE payroll_sheets SET status='approved' WHERE id=$1 AND status='draft'`, [sheet.sheetId]);
  }

  // ================= 16. Коммуникации =================
  type CallDef = [string, string, string, string | null, number, string, string, string]; // dir, md+time, phone, client, dur, result, marker, time
  const CALLS: { dir: string; md: string; time: string; phone: string; client: string | null;
    req?: string; ticket?: string; dur: number; result: string; key: string }[] = [
    { dir: "incoming", md: "06-02", time: "09:40", phone: "+77015551011", client: CL.gkt, dur: 240,
      result: "Приняли заявку на подключение КАМАЗа", key: "call1" },
    { dir: "outgoing", md: "06-08", time: "08:50", phone: "+77025551012", client: CL.klg, dur: 180,
      result: "Согласовали время монтажа", key: "call2" },
    { dir: "incoming", md: "06-19", time: "14:20", phone: "+77015551014", client: CL.sts, dur: 300,
      result: "Жалоба на показания ДУТ, создана заявка", key: "call3" },
    { dir: "missed", md: "06-24", time: "18:10", phone: "+77015551015", client: CL.asn, dur: 0,
      result: "Перезвонили на следующий день", key: "call4" },
    { dir: "incoming", md: "07-01", time: "10:05", phone: "+77055551013", client: CL.gu, dur: 420,
      result: "Вопрос по счёту за июль (казначейство)", key: "call5" },
    { dir: "outgoing", md: "07-03", time: "11:30", phone: "+77015551014", client: CL.sts, dur: 260,
      result: "Напоминание о задолженности, обещали оплатить до 10.07", key: "call6" },
    { dir: "incoming", md: "07-04", time: "09:15", phone: "+77015551011", client: CL.gkt, ticket: t2, dur: 350,
      result: "Открыт тикет по уровню топлива", key: "call7" },
    { dir: "incoming", md: "07-06", time: "08:45", phone: "+77025551017", client: CL.zhb, dur: 150,
      result: "Консультация по мобильному приложению", key: "call8" },
  ];
  for (const c of CALLS) {
    await ensure(
      "calls",
      `SELECT id FROM calls WHERE recording_url=$1`,
      [`seed://call/${c.key}`],
      `INSERT INTO calls (direction, phone, client_id, ticket_id, user_id, duration_sec, recording_url, result, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamptz) RETURNING id`,
      [c.dir, c.phone, c.client, c.ticket ?? null, support.id, c.dur, `seed://call/${c.key}`,
       c.result, ts(c.md, c.time)]
    );
  }
  const MSGS: { ch: string; dir: string; md: string; contact: string; client: string; text: string; key: string }[] = [
    { ch: "whatsapp", dir: "in", md: "06-02", contact: "+77015551011", client: CL.gkt,
      text: "Добрый день! Просим подключить новый КАМАЗ А217КМ09 к мониторингу, машина на базе.", key: "m1" },
    { ch: "email", dir: "out", md: "07-03", contact: "buh@stroytech.kz", client: CL.sts,
      text: "Уважаемый клиент! Напоминаем о задолженности за услуги мониторинга за июнь 2026. Просим погасить до 10.07.2026.", key: "m2" },
    { ch: "telegram", dir: "in", md: "06-24", contact: "@asanov_b", client: CL.asn,
      text: "Саламатсыз ба! ГАЗель А661IP09 подключите пожалуйста на этой неделе.", key: "m3" },
  ];
  for (const m of MSGS) {
    await ensure(
      "messages",
      `SELECT id FROM messages WHERE external_id=$1`,
      [`seed-demo-${m.key}`],
      `INSERT INTO messages (channel, direction, contact, client_id, text, external_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7::timestamptz) RETURNING id`,
      [m.ch, m.dir, m.contact, m.client, m.text, `seed-demo-${m.key}`, ts(m.md, "12:00")]
    );
  }
  // Очередь уведомлений: sent (июнь) + queued (свежие)
  if (juneAct.gkt) {
    await ensure(
      "notification_queue",
      `SELECT id FROM notification_queue WHERE entity_type='billing_document' AND entity_id=$1 AND template_code='billing_doc_email'`,
      [juneAct.gkt],
      `INSERT INTO notification_queue (channel, recipient, template_code, subject, body, entity_type,
         entity_id, status, attempts, sent_at, created_at)
       VALUES ('email','info@gktrans.kz','billing_doc_email',
               'Расчётный документ за июнь 2026','Направляем расчётный документ за период июнь 2026. Документ во вложении.',
               'billing_document',$1,'sent',1,$2::timestamptz,$2::timestamptz) RETURNING id`,
      [juneAct.gkt, ts("07-01", "13:00")]
    );
  }
  await ensure(
    "notification_queue",
    `SELECT id FROM notification_queue WHERE entity_type='client' AND entity_id=$1 AND template_code='block_warning'`,
    [CL.sts],
    `INSERT INTO notification_queue (channel, recipient, template_code, subject, body, entity_type,
       entity_id, status, next_attempt_at)
     VALUES ('email','buh@stroytech.kz','block_warning',
             'Предупреждение о блокировке мониторинга',
             'Уважаемый клиент ТОО «СтройТехСервис»! Задолженность за услуги мониторинга. При непогашении доступ будет ограничен.',
             'client',$1,'queued', now() + interval '1 hour') RETURNING id`,
    [CL.sts]
  );
  if (julyAdv.gu) {
    await ensure(
      "notification_queue",
      `SELECT id FROM notification_queue WHERE entity_type='billing_document' AND entity_id=$1 AND template_code='billing_doc_email'`,
      [julyAdv.gu],
      `INSERT INTO notification_queue (channel, recipient, template_code, subject, body, entity_type,
         entity_id, status, next_attempt_at)
       VALUES ('email','upt@karaganda.gov.kz','billing_doc_email',
               'Счёт на предоплату за июль 2026','Направляем авансовый счёт за период июль 2026.',
               'billing_document',$1,'queued', now() + interval '1 hour') RETURNING id`,
      [julyAdv.gu]
    );
  }

  // Правило блокировки default — существует? (создавать дубль нельзя)
  const blockRule = await one(`SELECT id FROM blocking_rules WHERE scope='default' AND is_active`);
  track("blocking_rules (default)", !blockRule);
  if (!blockRule) {
    await query(
      `INSERT INTO blocking_rules (name, scope, advance_grace_days, credit_grace_days, allowed_debt, warn_days_before)
       VALUES ('Правило по умолчанию','default',5,10,10000,3)`
    );
  }

  // ================= Сводка =================
  console.log("\n=== seed-demo: сводка ===");
  for (const [entity, s] of [...stats.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${entity.padEnd(38)} создано: ${String(s.created).padStart(3)}  пропущено: ${s.skipped}`);
  }
  await db.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
