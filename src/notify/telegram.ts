import { config } from '../config.js';

/** Форматує лот у повідомлення Telegram (HTML). */
export function formatLot(lot: any, criteriaName: string): string {
  const fmt = (n: number | null) =>
    n == null ? '—' : new Intl.NumberFormat('uk-UA').format(n) + ' грн';
  const lines = [
    `🏷 <b>${escapeHtml(lot.title ?? 'Лот')}</b>`,
    `🎯 Критерій: ${escapeHtml(criteriaName)}`,
    `📦 Джерело: ${lot.source === 'prozorro' ? 'Prozorro.Sale' : 'СЕТАМ'} · ${lot.asset_type}`,
    lot.region ? `📍 ${escapeHtml(lot.region)}` : null,
    `💰 Старт: ${fmt(lot.start_price)}${lot.valuation ? ` · Оцінка: ${fmt(lot.valuation)}` : ''}`,
    lot.area_sqm ? `📐 Площа: ${lot.area_sqm} м²` : null,
    lot.bids_end ? `⏰ Заявки до: ${new Date(lot.bids_end).toLocaleString('uk-UA')}` : null,
    lot.lot_url ? `🔗 ${lot.lot_url}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export async function sendTelegram(text: string): Promise<boolean> {
  const { botToken, chatId } = config.telegram;
  if (!botToken || !chatId) {
    console.warn('[telegram] токен/chat_id не задано — сповіщення пропущено.');
    return false;
  }
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) {
    console.error('[telegram] помилка:', res.status, await res.text());
    return false;
  }
  return true;
}
