import { Pool } from "pg";
import bcrypt from "bcryptjs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const ROLES: [string, string, string][] = [
  ["admin", "Администратор", "Әкімші"],
  ["manager", "Менеджер", "Менеджер"],
  ["support", "Техподдержка", "Техқолдау"],
  ["installer", "Техник-установщик", "Орнатушы техник"],
  ["head", "Руководитель отдела", "Бөлім басшысы"],
  ["accounting", "Бухгалтерия", "Бухгалтерия"],
  ["boss", "Владелец", "Иесі"],
];

const USERS: [string, string, string][] = [
  ["Администратор", "admin@omnicomm.kz", "admin"],
  ["Менеджер Демо", "manager@omnicomm.kz", "manager"],
  ["Саппорт Демо", "support@omnicomm.kz", "support"],
  ["Монтажник Демо", "installer@omnicomm.kz", "installer"],
  ["Руководитель Демо", "boss@omnicomm.kz", "boss"],
];

const SIM_OPERATORS: [string, string][] = [
  ["Beeline KZ", "beeline_kz"],
  ["Kcell", "kcell"],
  ["Tele2/Altel", "tele2_altel"],
  ["izi", "izi"],
];

async function main() {
  const hash = await bcrypt.hash(process.env.SEED_PASSWORD ?? "demo1234", 10);

  for (const [code, name, nameKk] of ROLES) {
    await pool.query(
      `INSERT INTO roles (code, name, name_kk) VALUES ($1,$2,$3)
       ON CONFLICT (code) DO UPDATE SET name = $2, name_kk = $3`,
      [code, name, nameKk]
    );
  }

  for (const [name, email, role] of USERS) {
    await pool.query(
      `INSERT INTO users (full_name, email, role_id, password_hash)
       SELECT $1, $2, r.id, $4 FROM roles r WHERE r.code = $3
       ON CONFLICT (email) DO NOTHING`,
      [name, email, role, hash]
    );
  }

  await pool.query(
    `INSERT INTO vat_rates (rate, valid_from, note) VALUES
       (12, '2009-01-01', 'НК РК до 2026'),
       (16, '2026-01-01', 'НК РК-2026')
     ON CONFLICT (valid_from) DO NOTHING`
  );

  for (const [name, code] of SIM_OPERATORS) {
    await pool.query(
      `INSERT INTO sim_operators (name, code) VALUES ($1,$2) ON CONFLICT (code) DO NOTHING`,
      [name, code]
    );
  }

  // Организация-продавец для печатных форм (счёт/АВР Р-1). Реквизиты фиктивные.
  await pool.query(
    `INSERT INTO own_organizations
       (name, name_kk, legal_form, bin, iik, bik, bank_name, kbe, is_vat_payer,
        vat_certificate, legal_address, legal_address_kk, director_name, director_basis, phone, email)
     SELECT 'ТОО «Омникомм Альянс KZ»', '«Омникомм Альянс KZ» ЖШС', 'TOO',
            '990140012345', 'KZ868562203105747338', 'KCJBKZKX', 'АО «Банк ЦентрКредит»', '17', true,
            'Серия 60001 № 0012345', 'г. Караганда, пр. Бухар Жырау, 1', 'Қарағанды қ., Бұқар Жырау даңғ., 1',
            'Иванов И.И.', 'Устава', '+7 (7212) 00-00-00', 'info@omnicomm.kz'
     WHERE NOT EXISTS (SELECT 1 FROM own_organizations WHERE bin = '990140012345')`
  );

  // Шаблоны уведомлений (этап 6). Идемпотентно: существующие не перезаписываются,
  // чтобы не затирать правки из /support/notifications.
  const TEMPLATES: [string, string, string, string, string, string][] = [
    [
      "block_warning",
      "email",
      "Предупреждение о блокировке мониторинга",
      "Мониторингті бұғаттау туралы ескерту",
      "Уважаемый клиент {{client}}! Задолженность за услуги мониторинга составляет {{debt}} KZT. " +
        "При непогашении доступ к системе мониторинга будет заблокирован {{date}}.",
      "Құрметті клиент {{client}}! Мониторинг қызметтері бойынша берешек {{debt}} KZT құрайды. " +
        "Өтелмеген жағдайда мониторинг жүйесіне қолжетімділік {{date}} бұғатталады.",
    ],
    [
      "billing_doc_email",
      "email",
      "Расчётный документ {{number}} за {{period}}",
      "{{period}} кезеңіне {{number}} есеп айырысу құжаты",
      "Здравствуйте! Направляем расчётный документ {{number}} за период {{period}}. " +
        "Документ во вложении. Это письмо сформировано автоматически.",
      "Сәлеметсіз бе! {{period}} кезеңіне {{number}} есеп айырысу құжатын жолдаймыз. " +
        "Құжат тіркемеде. Бұл хат автоматты түрде қалыптастырылды.",
    ],
    [
      "order_assigned_tg",
      "telegram",
      "Новый наряд",
      "Жаңа наряд",
      "Вам назначен заказ-наряд {{number}}. Адрес: {{address}}",
      "Сізге {{number}} заказ-наряды тағайындалды. Мекенжайы: {{address}}",
    ],
  ];
  for (const [code, channel, subjectRu, subjectKk, bodyRu, bodyKk] of TEMPLATES) {
    await pool.query(
      `INSERT INTO notification_templates (code, channel, subject_ru, subject_kk, body_ru, body_kk)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (code) DO NOTHING`,
      [code, channel, subjectRu, subjectKk, bodyRu, bodyKk]
    );
  }

  console.log("seed done");
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
