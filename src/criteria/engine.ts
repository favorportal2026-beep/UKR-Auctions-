import type { Criteria, NormalizedLot } from '../types.js';

/** Чи відповідає лот критерію. Порожні поля критерію = «будь-яке». */
export function matches(lot: NormalizedLot, c: Criteria): boolean {
  // тип активу
  if (c.asset_types.length && !c.asset_types.includes(lot.asset_type)) return false;

  // регіон (частковий збіг, без регістру)
  if (c.regions.length) {
    const hay = (lot.region ?? '') + ' ' + (lot.address ?? '');
    const h = hay.toLowerCase();
    if (!c.regions.some((r) => h.includes(r.toLowerCase()))) return false;
  }

  // метод продажу
  if (c.selling_methods.length) {
    const sm = (lot.selling_method ?? '').toLowerCase();
    if (!c.selling_methods.some((m) => sm.includes(m.toLowerCase()))) return false;
  }

  // ключові слова (title + description)
  if (c.keywords.length) {
    const text = ((lot.title ?? '') + ' ' + (lot.description ?? '')).toLowerCase();
    if (!c.keywords.some((k) => text.includes(k.toLowerCase()))) return false;
  }

  // ціна
  const price = lot.start_price ?? lot.current_price ?? null;
  if (c.price_min != null && (price == null || price < c.price_min)) return false;
  if (c.price_max != null && (price == null || price > c.price_max)) return false;

  // площа
  if (c.area_min != null && (lot.area_sqm == null || lot.area_sqm < c.area_min)) return false;
  if (c.area_max != null && (lot.area_sqm == null || lot.area_sqm > c.area_max)) return false;

  // знижка від оцінки: start_price / valuation <= поріг
  if (c.max_price_to_valuation != null) {
    if (lot.valuation == null || price == null || lot.valuation === 0) return false;
    if (price / lot.valuation > c.max_price_to_valuation) return false;
  }

  return true;
}

/** Повертає id критеріїв, під які підпадає лот. */
export function matchAll(lot: NormalizedLot, criteria: Criteria[]): string[] {
  return criteria.filter((c) => c.active && matches(lot, c)).map((c) => c.id);
}
