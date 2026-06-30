// Omnicomm — адаптер приёма email (раздел 12.2 / 23 ТЗ).
// Опрашивает почтовый ящик (IMAP) и шлёт новые письма в CRM /api/messages.
// Зависимость: imapflow. Запуск:
//   IMAP_HOST=... IMAP_USER=... IMAP_PASS=... CRM_URL=... CHANNEL_SECRET=... node integrations/email-poller.js
import { ImapFlow } from 'imapflow';

const CRM_URL = process.env.CRM_URL ?? 'http://localhost:3091';
const CHANNEL_SECRET = process.env.CHANNEL_SECRET!;

async function pushToCrm(contact: string, content: string, subject?: string) {
  await fetch(`${CRM_URL}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-channel-secret': CHANNEL_SECRET },
    body: JSON.stringify({ channel: 'email', contact, content, subject, create_request: true }),
  });
}

async function poll() {
  const client = new ImapFlow({
    host: process.env.IMAP_HOST!,
    port: Number(process.env.IMAP_PORT ?? 993),
    secure: true,
    auth: { user: process.env.IMAP_USER!, pass: process.env.IMAP_PASS! },
    logger: false,
  });
  await client.connect();
  const lock = await client.getMailboxLock('INBOX');
  try {
    for await (const msg of client.fetch({ seen: false }, { envelope: true, source: true })) {
      const from = msg.envelope?.from?.[0]?.address ?? 'unknown';
      const subject = msg.envelope?.subject ?? '';
      await pushToCrm(from, msg.source?.toString().slice(0, 2000) ?? subject, subject);
      await client.messageFlagsAdd(msg.uid, ['\\Seen'], { uid: true });
      console.log(`[email] ${from}: ${subject}`);
    }
  } finally {
    lock.release();
    await client.logout();
  }
}

console.log('Email-адаптер Omnicomm запущен');
poll().catch((e) => console.error('[email] ошибка:', e.message));
