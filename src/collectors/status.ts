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
