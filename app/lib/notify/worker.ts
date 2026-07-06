/**
 * Воркер очереди уведомлений (этап 6): выбирает пачку queued/failed с наступившим
 * next_attempt_at, шлёт по каналу, ретраит с экспоненцией (макс 5 попыток).
 * Каналы: email (SMTP из env), telegram (BOT_TOKEN). Без настроенного канала —
 * dry-run: помечает sent c пометкой (для дев-среды), если NOTIFY_DRY_RUN=1,
 * иначе failed «канал не настроен».
 * Транспорты за инъекцией — тестируется без сети.
 */
import { query } from "@/lib/db";

export type QueueItem = {
  id: string;
  channel: string;
  recipient: string;
  subject: string | null;
  body: string | null;
  attachments: { url: string; filename: string }[] | null;
  attempts: number;
};

export type Transports = {
  email?: (item: QueueItem) => Promise<void>;
  telegram?: (item: QueueItem) => Promise<void>;
};

const MAX_ATTEMPTS = 5;
const BACKOFF_MIN = [1, 5, 30, 120, 480]; // минуты

async function smtpSend(item: QueueItem): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) throw new Error("SMTP не настроен (SMTP_HOST)");
  const nodemailer = (await import("nodemailer")).default;
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
  });
  await transporter.sendMail({
    from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
    to: item.recipient,
    subject: item.subject ?? "",
    html: item.body ?? "",
    attachments: (item.attachments ?? []).map((a) => ({ path: a.url, filename: a.filename })),
  });
}

async function telegramSend(item: QueueItem): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Telegram не настроен (TELEGRAM_BOT_TOKEN)");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: item.recipient, text: item.body ?? item.subject ?? "", parse_mode: "HTML" }),
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as { ok: boolean; description?: string };
  if (!data.ok) throw new Error(`Telegram: ${data.description ?? res.status}`);
}

export async function processNotificationQueue(
  limit = 20,
  transports: Transports = {}
): Promise<{ sent: number; failed: number; dryRun: number }> {
  const items = await query<QueueItem>(
    `UPDATE notification_queue SET status = 'sending', updated_at = now()
     WHERE id IN (
       SELECT id FROM notification_queue
       WHERE status IN ('queued','failed') AND attempts < $2
         AND (next_attempt_at IS NULL OR next_attempt_at <= now())
       ORDER BY created_at LIMIT $1 FOR UPDATE SKIP LOCKED
     )
     RETURNING id, channel, recipient, subject, body, attachments, attempts`,
    [limit, MAX_ATTEMPTS]
  );

  let sent = 0, failed = 0, dryRun = 0;
  for (const item of items) {
    try {
      const send =
        item.channel === "email"
          ? transports.email ?? smtpSend
          : item.channel === "telegram"
            ? transports.telegram ?? telegramSend
            : null;
      if (!send) throw new Error(`Канал ${item.channel} не поддерживается воркером`);

      const configured =
        item.channel === "email"
          ? Boolean(process.env.SMTP_HOST) || Boolean(transports.email)
          : Boolean(process.env.TELEGRAM_BOT_TOKEN) || Boolean(transports.telegram);
      if (!configured && process.env.NOTIFY_DRY_RUN === "1") {
        await query(
          `UPDATE notification_queue SET status='sent', sent_at=now(), last_error='dry-run (канал не настроен)' WHERE id=$1`,
          [item.id]
        );
        dryRun++;
        continue;
      }

      await send(item);
      await query(
        `UPDATE notification_queue SET status='sent', sent_at=now(), last_error=NULL WHERE id=$1`,
        [item.id]
      );
      sent++;
    } catch (e) {
      const attempts = item.attempts + 1;
      const backoffMin = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
      await query(
        `UPDATE notification_queue
         SET status = 'failed', attempts = $2::int, last_error = $3,
             next_attempt_at = now() + ($4::int || ' minutes')::interval
         WHERE id = $1`,
        [item.id, attempts, (e as Error).message.slice(0, 500), backoffMin]
      );
      failed++;
    }
  }
  return { sent, failed, dryRun };
}

/** Постановка в очередь по шаблону (подстановка {{key}} из params). */
export async function enqueueNotification(p: {
  channel: "email" | "telegram" | "whatsapp" | "web_push" | "sms";
  recipient: string;
  templateCode?: string;
  subject?: string;
  body?: string;
  params?: Record<string, string>;
  locale?: "ru" | "kk";
  attachments?: { url: string; filename: string }[];
  entityType?: string;
  entityId?: string;
}): Promise<string> {
  let subject = p.subject ?? null;
  let body = p.body ?? null;
  if (p.templateCode) {
    const [tpl] = await query<{ subject_ru: string; subject_kk: string; body_ru: string; body_kk: string }>(
      `SELECT subject_ru, subject_kk, body_ru, body_kk FROM notification_templates
       WHERE code = $1 AND is_active`,
      [p.templateCode]
    );
    if (tpl) {
      subject = (p.locale === "kk" ? tpl.subject_kk : tpl.subject_ru) ?? tpl.subject_ru;
      body = (p.locale === "kk" ? tpl.body_kk : tpl.body_ru) ?? tpl.body_ru;
      for (const [k, v] of Object.entries(p.params ?? {})) {
        subject = subject?.replaceAll(`{{${k}}}`, v) ?? null;
        body = body?.replaceAll(`{{${k}}}`, v) ?? null;
      }
    }
  }
  const [row] = await query<{ id: string }>(
    `INSERT INTO notification_queue (channel, recipient, template_code, subject, body, attachments, entity_type, entity_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::uuid) RETURNING id`,
    [p.channel, p.recipient, p.templateCode ?? null, subject, body,
     JSON.stringify(p.attachments ?? []), p.entityType ?? null, p.entityId ?? null]
  );
  return row.id;
}
