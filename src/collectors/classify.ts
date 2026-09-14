import type { AssetType } from '../types.js';

/**
 * Класифікація типу активу.
 *
 * ВАЖЛИВО: точні коди CAV-PS / sellingMethod треба звірити на перших реальних
 * відповідях API (див. CLAUDE.md). Тут — захищена евристика, яка спирається на:
 *   1) sellingMethod (напр. landSell/landRental → земля);
 *   2) коди класифікатора (префікси);
 *   3) ключові слова в заголовку/описі як fallback.
 * Мета — не пропустити релевантне; уточнення робиться ітеративно.
 */

const LAND_METHOD_HINTS = ['land', 'земел'];
const REALTY_METHOD_HINTS = ['realestate', 'property', 'basicsell', 'legitimateproperty'];

const LAND_KEYWORDS = [
  'земел', 'ділянк', 'пай', 'сільськогосп', 'кадастр', 'га ', 'гектар',
];
const REALTY_KEYWORDS = [
  'квартир', 'будинок', 'будівл', 'приміщенн', 'нежитлов', 'житлов',
  'офіс', 'нерухом', 'котедж', 'кімнат', 'гараж', 'склад', 'магазин',
];

function includesAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

/**
 * @param sellingMethod  напр. "landSell-english"
 * @param classificationCodes  коди CAV/CAV-PS з items (може бути порожньо)
 * @param text  title + description
 */
export function classifyAsset(
  sellingMethod: string | null | undefined,
  classificationCodes: string[],
  text: string
): AssetType {
  const sm = (sellingMethod ?? '').toLowerCase();
  const codes = classificationCodes.join(' ');

  // 1) sellingMethod
  if (includesAny(sm, LAND_METHOD_HINTS)) return 'land';
  if (includesAny(sm, REALTY_METHOD_HINTS)) return 'real_estate';

  // 2) коди класифікатора (приклад: CAV-PS для землі часто починається з '06',
  //    для будівель/нерухомості — '04'/'05'. Уточнити на реальних даних.)
  if (/\b06\d{6,}/.test(codes) || includesAny(codes, ['земел', 'land'])) return 'land';
  if (/\b0[45]\d{6,}/.test(codes) || includesAny(codes, ['будів', 'нерух', 'estate'])) {
    return 'real_estate';
  }

  // 3) fallback по тексту
  if (includesAny(text, LAND_KEYWORDS)) return 'land';
  if (includesAny(text, REALTY_KEYWORDS)) return 'real_estate';

  return 'other';
}

/** Чи цікавить нас цей актив (нерухомість або земля). */
export function isTracked(t: AssetType): boolean {
  return t === 'real_estate' || t === 'land';
}
