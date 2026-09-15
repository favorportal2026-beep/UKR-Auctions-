import type { AssetType } from '../types.js';

/**
 * Класифікація типу активу (нерухомість / земля / інше).
 *
 * Коди й методи ЗВІРЕНО на реальних відповідях Prozorro.Sale (див. CLAUDE.md).
 * Джерела сигналу, у порядку надійності:
 *   1) коди класифікатора **CAV** (`items[].classification.id`) — найнадійніше:
 *      04* — «Нерухоме майно» (будівлі, приміщення), 05* — «Цілісний майновий
 *      комплекс», 06* — «Земельні ділянки». (Приклади з API: 04000000-8,
 *      04210000-3, 04232000-3, 05000000-5, 06121000-6, 06112000-0, 06128000-5.)
 *   2) `sellingMethod` — надійний для землі (`land*`: landSell/landRental/
 *      landArrested…). Для нерухомості метод НЕ показовий: `basicSell`/
 *      `commercialSell` використовують і для авто, меблів, брухту тощо — тому
 *      його НЕ вважаємо ознакою нерухомості (лише `*property*`/`*realEstate*`).
 *   3) текст (заголовок + опис + опис класифікації) — як fallback.
 *
 * Мета — не пропустити релевантне; уточнення робиться ітеративно.
 */

const LAND_METHOD_HINTS = ['land', 'земел'];
// Лише явні «нерухомі» методи. НЕ додавати basicSell/commercialSell — надто широкі.
const REALTY_METHOD_HINTS = ['realestate', 'property', 'legitimateproperty'];

const LAND_KEYWORDS = [
  'земел', 'ділянк', 'пай', 'сільськогосп', 'кадастр', 'гектар', ' га ', ' га,',
];
const REALTY_KEYWORDS = [
  'квартир', 'будинок', 'будівл', 'приміщенн', 'нежитлов', 'житлов',
  'офіс', 'нерухом', 'котедж', 'кімнат', 'гараж', 'склад', 'магазин',
  'майновий комплекс', 'недобуд', 'незакінчен', 'об’єкт нерухом', 'квартал',
];

function includesAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

/** Дивізіон коду CAV (перші 2 цифри 8-значного коду), напр. "06121000-6" → "06". */
function cavDivision(code: string): string | null {
  const m = String(code).match(/(?:^|\D)(\d{2})\d{6}\b/);
  return m ? m[1]! : null;
}

/**
 * @param sellingMethod  напр. "landSell-english", "basicSell-english"
 * @param classificationCodes  коди CAV з items (може бути порожньо)
 * @param text  title + description (+ опис класифікації, якщо є)
 */
export function classifyAsset(
  sellingMethod: string | null | undefined,
  classificationCodes: string[],
  text: string
): AssetType {
  const sm = (sellingMethod ?? '').toLowerCase();

  // 1) Коди класифікатора CAV — найнадійніший сигнал.
  for (const code of classificationCodes) {
    const div = cavDivision(code);
    if (div === '06') return 'land';
    if (div === '04' || div === '05') return 'real_estate';
  }

  // 2) sellingMethod: земля надійно; нерухомість — лише явні property/realEstate.
  if (includesAny(sm, LAND_METHOD_HINTS)) return 'land';
  if (includesAny(sm, REALTY_METHOD_HINTS)) return 'real_estate';

  // 3) fallback по тексту (землю перевіряємо першою — вона специфічніша).
  if (includesAny(text, LAND_KEYWORDS)) return 'land';
  if (includesAny(text, REALTY_KEYWORDS)) return 'real_estate';

  return 'other';
}

/**
 * Мапа категорій СЕТАМ (контрольований словник поля «Категорія») → тип активу.
 * Звірено на реальному CSV data.gov.ua (див. CLAUDE.md). Категорії поза мапою
 * (напр. «Інше») класифікуються за текстом через classifyAsset().
 */
const SETAM_CATEGORY_MAP: Record<string, AssetType> = {
  'житлова нерухомість': 'real_estate',
  'комерційна нерухомість': 'real_estate',
  'промислова нерухомість': 'real_estate',
  'нежитлове приміщення': 'real_estate',
  'будівлі': 'real_estate',
  'гаражі/стоянки': 'real_estate',
  'недобудована': 'real_estate',
  'земельні ділянки': 'land',
};

/**
 * Класифікація лота СЕТАМ: спочатку за точною категорією (надійно),
 * інакше — за текстом (категорія + назва).
 */
export function classifySetam(category: string, title: string): AssetType {
  const key = (category ?? '').trim().toLowerCase();
  if (key in SETAM_CATEGORY_MAP) return SETAM_CATEGORY_MAP[key]!;
  // Текстовий fallback лише для «Інше»/порожньої/невідомої категорії. Інші відомі
  // категорії (Обладнання, Запчастини, авто, телефони…) — не наш профіль, інакше
  // текст на кшталт «сільськогосподарської техніки» хибно дає land.
  if (key === '' || key === 'інше') return classifyAsset(null, [], `${category} ${title}`);
  return 'other';
}

/** Чи цікавить нас цей актив (нерухомість або земля). */
export function isTracked(t: AssetType): boolean {
  return t === 'real_estate' || t === 'land';
}
