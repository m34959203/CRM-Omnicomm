// Omnicomm — адаптер Telegram-бота (раздел 12.2 / 23 ТЗ).
// Самостоятельный сервис (как wa-gateway): long-poll Telegram → POST в CRM /api/messages.
// Запуск: TELEGRAM_TOKEN=... CRM_URL=... CHANNEL_SECRET=... node integrations/telegram-bot.js
const TOKEN = process.env.TELEGRAM_TOKEN!;
const CRM_URL = process.env.CRM_URL ?? 'http://localhost:3091';
const CHANNEL_SECRET = process.env.CHANNEL_SECRET!;
const API = `https://api.telegram.org/bot${TOKEN}`;

let offset = 0;

async function pushToCrm(contact: string, content: string) {
  await fetch(`${CRM_URL}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-channel-secret': CHANNEL_SECRET },
    body: JSON.stringify({ channel: 'telegram', contact, content, create_request: false }),
  });
}

async function loop() {
  try {
    const r = await fetch(`${API}/getUpdates?timeout=30&offset=${offset}`);
    const j = await r.json();
    for (const u of j.result ?? []) {
      offset = u.update_id + 1;
      const msg = u.message;
      if (!msg?.text) continue;
      const contact = msg.from?.username ? `tg:@${msg.from.username}` : `tg:${msg.chat.id}`;
      await pushToCrm(contact, msg.text);
      console.log(`[tg] ${contact}: ${msg.text}`);
    }
  } catch (e) {
    console.error('[tg] ошибка:', (e as Error).message);
  }
  setTimeout(loop, 1000);
}

console.log('Telegram-адаптер Omnicomm запущен');
loop();
