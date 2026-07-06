/**
 * Расчёт сдельной ведомости (этап 5). Схемы:
 *  - чистая сделка (правила нет): total = works + compensations − deductions;
 *  - «оклад за норму + сделка сверх» (payroll_rules): salary покрывает первые
 *    norm_count работ; при piece_over_norm работы СВЕРХ нормы оплачиваются
 *    сделкой (bonus) — берутся ПОСЛЕДНИЕ по дате работы периода;
 *    threshold_met = выполнена ли норма. Дифференциатор: у Аскан только «в теории».
 * Правило разрешается: performer > category > default.
 * В расчёт попадают только незакреплённые записи (sheet_line_id IS NULL).
 */
import { tx } from "@/lib/db";

type Q = <R = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<R[]>;

export class PayrollError extends Error {
  status: number;
  constructor(message: string, status = 422) {
    super(message);
    this.status = status;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

type Rule = {
  id: string;
  salary: number;
  norm_count: number;
  piece_over_norm: boolean;
};

async function resolveRule(q: Q, userId: string): Promise<Rule | null> {
  const [byUser] = await q<Rule & { salary: string }>(
    `SELECT id, salary, norm_count, piece_over_norm FROM payroll_rules
     WHERE is_active AND scope='performer' AND user_id=$1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  if (byUser) return { ...byUser, salary: Number(byUser.salary) };
  const [byCat] = await q<Rule & { salary: string }>(
    `SELECT r.id, r.salary, r.norm_count, r.piece_over_norm FROM payroll_rules r
     JOIN performer_category_assignments pca ON pca.category_id = r.category_id AND pca.user_id = $1
     WHERE r.is_active AND r.scope='category'
     ORDER BY pca.valid_from DESC, r.created_at DESC LIMIT 1`,
    [userId]
  );
  if (byCat) return { ...byCat, salary: Number(byCat.salary) };
  const [byDefault] = await q<Rule & { salary: string }>(
    `SELECT id, salary, norm_count, piece_over_norm FROM payroll_rules
     WHERE is_active AND scope='default' ORDER BY created_at DESC LIMIT 1`
  );
  return byDefault ? { ...byDefault, salary: Number(byDefault.salary) } : null;
}

export type SheetLine = {
  user_id: string;
  full_name: string;
  acts_count: number;
  work_amount: number;
  salary_amount: number;
  bonus_amount: number;
  compensation_amount: number;
  deduction_amount: number;
  total: number;
  threshold_met: boolean;
};

/** Сформировать ведомость за период. Идемпотентно: черновик за тот же период не дублируется. */
export async function buildPayrollSheet(
  periodStart: string,
  periodEnd: string,
  userId: string
): Promise<{ sheetId: string; lines: SheetLine[]; skipped?: string }> {
  return tx(async (q) => {
    const [existing] = await q<{ id: string; status: string }>(
      `SELECT id, status FROM payroll_sheets WHERE period_start=$1::date AND period_end=$2::date
       AND status <> 'paid' LIMIT 1`,
      [periodStart, periodEnd]
    );
    if (existing) {
      return { sheetId: existing.id, lines: [], skipped: "ведомость за период уже существует" };
    }

    const entries = await q<{
      id: string;
      user_id: string;
      full_name: string;
      kind: "work" | "compensation" | "deduction";
      amount: string;
      entry_date: string;
    }>(
      `SELECT e.id, e.user_id, u.full_name, e.kind, e.amount, e.entry_date::text
       FROM payroll_entries e JOIN users u ON u.id = e.user_id
       WHERE e.sheet_line_id IS NULL AND e.entry_date BETWEEN $1::date AND $2::date
       ORDER BY e.user_id, e.entry_date, e.created_at`,
      [periodStart, periodEnd]
    );
    if (entries.length === 0) {
      return { sheetId: "", lines: [], skipped: "нет незакреплённых начислений за период" };
    }

    const [sheet] = await q<{ id: string }>(
      `INSERT INTO payroll_sheets (period_start, period_end, status, created_by)
       VALUES ($1::date, $2::date, 'draft', $3) RETURNING id`,
      [periodStart, periodEnd, userId]
    );

    const byUser = new Map<string, typeof entries>();
    for (const e of entries) {
      const arr = byUser.get(e.user_id) ?? [];
      arr.push(e);
      byUser.set(e.user_id, arr);
    }

    const lines: SheetLine[] = [];
    for (const [performerId, rows] of byUser) {
      const works = rows.filter((r) => r.kind === "work");
      const compensation = round2(
        rows.filter((r) => r.kind === "compensation").reduce((s, r) => s + Number(r.amount), 0)
      );
      const deduction = round2(
        rows.filter((r) => r.kind === "deduction").reduce((s, r) => s + Number(r.amount), 0)
      );
      const workAmount = round2(works.reduce((s, r) => s + Number(r.amount), 0));

      const rule = await resolveRule(q, performerId);
      let salaryAmount = 0;
      let bonusAmount = 0;
      let total: number;
      let thresholdMet = false;

      if (rule && rule.salary > 0) {
        salaryAmount = rule.salary;
        thresholdMet = works.length >= rule.norm_count;
        if (rule.piece_over_norm && works.length > rule.norm_count) {
          // Сверх нормы — последние по дате работы периода.
          const over = works.slice(rule.norm_count);
          bonusAmount = round2(over.reduce((s, r) => s + Number(r.amount), 0));
        }
        total = round2(salaryAmount + bonusAmount + compensation - deduction);
      } else {
        total = round2(workAmount + compensation - deduction);
      }

      const [line] = await q<{ id: string }>(
        `INSERT INTO payroll_sheet_lines
           (sheet_id, user_id, acts_count, work_amount, salary_amount, bonus_amount,
            compensation_amount, deduction_amount, total, threshold_met)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [sheet.id, performerId, works.length, workAmount, salaryAmount, bonusAmount,
         compensation, deduction, total, thresholdMet]
      );
      await q(
        `UPDATE payroll_entries SET sheet_line_id = $1 WHERE id = ANY($2::uuid[])`,
        [line.id, rows.map((r) => r.id)]
      );

      lines.push({
        user_id: performerId,
        full_name: rows[0].full_name,
        acts_count: works.length,
        work_amount: workAmount,
        salary_amount: salaryAmount,
        bonus_amount: bonusAmount,
        compensation_amount: compensation,
        deduction_amount: deduction,
        total,
        threshold_met: thresholdMet,
      });
    }

    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'create','payroll_sheet',$2)`,
      [userId, sheet.id]
    );
    return { sheetId: sheet.id, lines };
  });
}

/** Отмена черновика: строки удаляются, записи открепляются (можно пересчитать). */
export async function cancelPayrollSheet(sheetId: string, userId: string): Promise<void> {
  return tx(async (q) => {
    const [sheet] = await q<{ status: string }>(
      `SELECT status FROM payroll_sheets WHERE id = $1 FOR UPDATE`,
      [sheetId]
    );
    if (!sheet) throw new PayrollError("Ведомость не найдена", 404);
    if (sheet.status !== "draft") throw new PayrollError("Отменить можно только черновик");
    await q(
      `UPDATE payroll_entries SET sheet_line_id = NULL
       WHERE sheet_line_id IN (SELECT id FROM payroll_sheet_lines WHERE sheet_id = $1)`,
      [sheetId]
    );
    await q(`DELETE FROM payroll_sheets WHERE id = $1`, [sheetId]);
    await q(
      `INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES ($1,'cancel','payroll_sheet',$2)`,
      [userId, sheetId]
    );
  });
}
