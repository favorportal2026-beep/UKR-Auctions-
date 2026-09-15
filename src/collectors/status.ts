import type { LotSource } from '../types.js';

/**
 * Чи аукціон ще «активний» (на нього можна заявитись / він триває).
 * Монітор показує лише такі — не завершені/скасовані/присуджені.
 *
 * Prozorro-статуси: active_tendering (прийом заяв), active_auction (сам аукціон),
 * active_enquiries / active_rectification (до старту). Виключаємо complete,
 * unsuccessful, cancelled, active_awarded/active_qualification (уже після торгів),
 * pending_payment.
 * СЕТАМ: «Реєстрація учасників» (відкрита реєстрація).
 */
const PROZORRO_ACTIVE = new Set([
  'active_tendering',
  'active_auction',
  'active_enquiries',
  'active_rectification',
]);
const SETAM_ACTIVE = new Set(['Реєстрація учасників']);

export function isActiveStatus(source: LotSource, status: string | null | undefined): boolean {
  const s = (status ?? '').trim();
  if (!s) return false;
  if (source === 'prozorro') return PROZORRO_ACTIVE.has(s);
  if (source === 'setam') return SETAM_ACTIVE.has(s);
  return true;
}

/**
 * Чи це продаж/приватизація (а не ОРЕНДА). Монітор відстежує лише продаж:
 * landSell/landArrested, *Sell, приватизація, банкрутство, СЕТАМ тощо.
 * Оренду виключаємо — у Prozorro це методи з «Lease»/«Rental» у назві
 * (landRental-*, commercialPropertyLease-*, legitimatePropertyLease-*,
 * regulationsPropertyLease-*). СЕТАМ — завжди примусовий продаж.
 */
export function isSaleMethod(sellingMethod: string | null | undefined): boolean {
  const m = (sellingMethod ?? '').toLowerCase();
  if (!m) return true; // невідомий метод не відкидаємо (страховка)
  return !m.includes('lease') && !m.includes('rental');
}
