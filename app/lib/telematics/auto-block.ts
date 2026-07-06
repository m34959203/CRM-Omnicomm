/**
 * Автоблокировка должников (этап 2).
 * Вход — ведомость расчётов (settlementSheet): долг = документы − оплаты.
 * Для каждого должника:
 *   1. Правило blocking_rules по приоритету scope client > category > default (is_active).
 *   2. Отсрочка от oldest_unpaid_due: advance_grace_days / credit_grace_days по схеме
 *      клиента; долг ≤ allowed_debt — не трогать.
 *   3. Ручная разблокировка «до даты»: последняя blocking_events.action='manual_unblock'
 *      с unblock_until >= сегодня — пропустить.
 *   4. Просрочка в окне warn_days_before до блокировки → 'warning' (не чаще 1 раза в
 *      сутки на клиента, + письмо в notification_queue при наличии email).
 *   5. Просрочка сверх отсрочки → 'block': setUserBlocking для всех активных
 *      telematics_accounts клиента с login и auto_block_debtors.
 *   6. Долг погашен (≤ allowed_debt) и была автоблокировка → 'unblock'.
 * События пишутся с performed_by = NULL (автоматика); ошибки Omnicomm — в sync_log,
 * событие не пишется, пакет не прерывается.
 */
import { query } from "@/lib/db";
import { settlementSheet } from "@/lib/billing/engine";
import { almatyDate, almatyDayStart } from "@/lib/billing/dates";
import { omnicommClientFor, writeSyncLog, type TelematicsServerRow } from "./server";

export type AutoBlockEvent = {
  client_id: string;
  action: "warning" | "block" | "unblock";
  rule_id: string | null;
  debt_amount: number;
};

/** Вызов Omnicomm вынесен за инъекцию — в тестах подменяется заглушкой. */
export type SetBlockingFn = (
  server: TelematicsServerRow,
  p: { login: string; blocked: boolean; comment: string }
) => Promise<unknown>;

const defaultSetBlocking: SetBlockingFn = (server, p) =>
  omnicommClientFor(server).setUserBlocking(p);

type RuleRow = {
  id: string;
  scope: "default" | "category" | "client";
  category_id: string | null;
  client_id: string | null;
  advance_grace_days: number;
  credit_grace_days: number;
  allowed_debt: string;
  warn_days_before: number;
};

type AccountRow = TelematicsServerRow & { account_id: string; login: string };

const DAY_MS = 86400000;
const daysBetween = (from: string, to: string) =>
  Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / DAY_MS
  );

function resolveRule(
  rules: RuleRow[],
  clientId: string,
  categoryId: string | null
): RuleRow | null {
  return (
    rules.find((r) => r.scope === "client" && r.client_id === clientId) ??
    (categoryId
      ? rules.find((r) => r.scope === "category" && r.category_id === categoryId)
      : undefined) ??
    rules.find((r) => r.scope === "default") ??
    null
  );
}

/** Блокировка/разблокировка учёток клиента в СМ. true, если хотя бы одна учётка обработана. */
async function applyBlocking(
  clientId: string,
  blocked: boolean,
  debt: number,
  setBlocking: SetBlockingFn
): Promise<boolean> {
  const accounts = await query<AccountRow>(
    `SELECT a.id AS account_id, a.login,
            s.id, s.name, s.server_type, s.base_url, s.auth_login, s.auth_secret,
            s.is_active, s.health_status, s.health_checked_at
     FROM telematics_accounts a
     JOIN telematics_servers s ON s.id = a.server_id
     WHERE a.client_id = $1::uuid AND a.is_active AND a.login IS NOT NULL
       AND a.auto_block_debtors`,
    [clientId]
  );
  let ok = 0;
  for (const acc of accounts) {
    const start = Date.now();
    try {
      await setBlocking(acc, {
        login: acc.login,
        blocked,
        comment: blocked
          ? `Автоблокировка CRM: задолженность ${debt.toFixed(2)} KZT`
          : "Автоматическая разблокировка CRM: долг погашен",
      });
      await writeSyncLog({
        serverId: acc.id,
        operation: blocked ? "block" : "unblock",
        entityType: "telematics_account",
        entityId: acc.account_id,
        status: "ok",
        payload: { login: acc.login, client_id: clientId, auto: true, debt },
        durationMs: Date.now() - start,
      });
      ok++;
    } catch (e) {
      await writeSyncLog({
        serverId: acc.id,
        operation: blocked ? "block" : "unblock",
        entityType: "telematics_account",
        entityId: acc.account_id,
        status: "error",
        errorMessage: (e as Error).message,
        payload: { login: acc.login, client_id: clientId, auto: true, debt },
        durationMs: Date.now() - start,
      });
    }
  }
  return ok > 0;
}

export async function runAutoBlocking(opts?: {
  /** Дата «сегодня» (YYYY-MM-DD, Алматы) — для тестов и пере-прогонов. */
  today?: string;
  setBlocking?: SetBlockingFn;
}): Promise<AutoBlockEvent[]> {
  const today = opts?.today ?? almatyDate(new Date());
  const setBlocking = opts?.setBlocking ?? defaultSetBlocking;

  const [sheet, rules] = await Promise.all([
    settlementSheet(query),
    query<RuleRow>(
      `SELECT id, scope, category_id, client_id, advance_grace_days, credit_grace_days,
              allowed_debt::text, warn_days_before
       FROM blocking_rules WHERE is_active`
    ),
  ]);
  if (sheet.length === 0 || rules.length === 0) return [];

  const clientIds = sheet.map((s) => s.client_id);
  const [metaRows, lastEvents, warnedToday] = await Promise.all([
    query<{ id: string; category_id: string | null; billing_scheme: string; email: string | null; name: string }>(
      `SELECT id, category_id, billing_scheme, email, name FROM clients WHERE id = ANY($1::uuid[])`,
      [clientIds]
    ),
    query<{ client_id: string; action: string; unblock_until: string | null; performed_by: string | null }>(
      `SELECT DISTINCT ON (client_id) client_id, action, unblock_until::text, performed_by
       FROM blocking_events
       WHERE action IN ('block','unblock','manual_unblock') AND client_id = ANY($1::uuid[])
       ORDER BY client_id, created_at DESC`,
      [clientIds]
    ),
    query<{ client_id: string }>(
      `SELECT DISTINCT client_id FROM blocking_events
       WHERE action = 'warning' AND created_at >= $1 AND created_at < $2`,
      [almatyDayStart(today), new Date(almatyDayStart(today).getTime() + DAY_MS)]
    ),
  ]);
  const meta = new Map(metaRows.map((m) => [m.id, m]));
  const lastEvent = new Map(lastEvents.map((e) => [e.client_id, e]));
  const warned = new Set(warnedToday.map((w) => w.client_id));

  const out: AutoBlockEvent[] = [];

  for (const row of sheet) {
    const m = meta.get(row.client_id);
    if (!m) continue;
    const rule = resolveRule(rules, row.client_id, m.category_id);
    if (!rule) continue;

    const allowedDebt = Number(rule.allowed_debt);
    const last = lastEvent.get(row.client_id);
    const isAutoBlocked = last?.action === "block" && last.performed_by === null;
    const isBlocked = last?.action === "block";

    // Долг в пределах допустимого: разблокировать, если блокировали автоматически.
    if (row.debt <= allowedDebt) {
      if (isAutoBlocked) {
        const applied = await applyBlocking(row.client_id, false, row.debt, setBlocking);
        if (applied) {
          await query(
            `INSERT INTO blocking_events (rule_id, client_id, action, debt_amount, performed_by, note)
             VALUES ($1::uuid, $2::uuid, 'unblock', $3, NULL, 'автоматическая разблокировка: долг погашен')`,
            [rule.id, row.client_id, row.debt]
          );
          out.push({ client_id: row.client_id, action: "unblock", rule_id: rule.id, debt_amount: row.debt });
        }
      }
      continue;
    }

    // Должник. Ручная разблокировка «до даты» — уважать.
    if (
      last?.action === "manual_unblock" &&
      last.unblock_until &&
      last.unblock_until >= today
    ) {
      continue;
    }
    if (!row.oldest_unpaid_due) continue;

    const overdueDays = daysBetween(row.oldest_unpaid_due, today);
    const grace =
      m.billing_scheme === "advance" ? rule.advance_grace_days : rule.credit_grace_days;

    if (overdueDays > grace) {
      if (isBlocked) continue; // уже заблокирован (авто или вручную)
      const applied = await applyBlocking(row.client_id, true, row.debt, setBlocking);
      if (applied) {
        await query(
          `INSERT INTO blocking_events (rule_id, client_id, action, debt_amount, performed_by, note)
           VALUES ($1::uuid, $2::uuid, 'block', $3, NULL, 'автоблокировка: просрочка сверх отсрочки')`,
          [rule.id, row.client_id, row.debt]
        );
        out.push({ client_id: row.client_id, action: "block", rule_id: rule.id, debt_amount: row.debt });
      }
    } else if (overdueDays > grace - rule.warn_days_before) {
      // Окно предупреждения перед блокировкой — не чаще 1 раза в сутки.
      if (warned.has(row.client_id) || isBlocked) continue;
      await query(
        `INSERT INTO blocking_events (rule_id, client_id, action, debt_amount, performed_by, note)
         VALUES ($1::uuid, $2::uuid, 'warning', $3, NULL, $4)`,
        [
          rule.id,
          row.client_id,
          row.debt,
          `предупреждение: блокировка через ${grace - overdueDays + 1} дн.`,
        ]
      );
      if (m.email) {
        await query(
          `INSERT INTO notification_queue (channel, recipient, subject, body, entity_type, entity_id, next_attempt_at)
           VALUES ('email', $1, $2, $3, 'client', $4::uuid, now())`,
          [
            m.email,
            "Предупреждение о блокировке мониторинга / Мониторингті бұғаттау туралы ескерту",
            `Уважаемый клиент ${m.name}! Задолженность за услуги мониторинга составляет ${row.debt.toFixed(2)} KZT. ` +
              `При непогашении доступ к системе мониторинга будет заблокирован через ${grace - overdueDays + 1} дн.`,
            row.client_id,
          ]
        );
      }
      out.push({ client_id: row.client_id, action: "warning", rule_id: rule.id, debt_amount: row.debt });
    }
  }
  return out;
}
