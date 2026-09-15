// Логіка збігу лот×критерій — ДЗЕРКАЛО src/criteria/engine.ts колектора.
// Джерело істини — engine.ts; тут копія для дії «перерахувати збіги» у веб-дашборді.
import type { Criteria, Lot } from './types';

export function matches(lot: Lot, c: Criteria): boolean {
  if (c.asset_types.length && !c.asset_types.includes(lot.asset_type)) return false;

  if (c.regions.length) {
    const h = ((lot.region ?? '') + ' ' + (lot.address ?? '')).toLowerCase();
    if (!c.regions.some((r) => h.includes(r.toLowerCase()))) return false;
  }

  if (c.selling_methods.length) {
    const sm = (lot.selling_method ?? '').toLowerCase();
    if (!c.selling_methods.some((m) => sm.includes(m.toLowerCase()))) return false;
  }

  if (c.keywords.length) {
    const text = ((lot.title ?? '') + ' ' + (lot.description ?? '')).toLowerCase();
    if (!c.keywords.some((k) => text.includes(k.toLowerCase()))) return false;
  }

  const price = lot.start_price ?? lot.current_price ?? null;
  if (c.price_min != null && (price == null || price < c.price_min)) return false;
  if (c.price_max != null && (price == null || price > c.price_max)) return false;

  if (c.area_min != null && (lot.area_sqm == null || lot.area_sqm < c.area_min)) return false;
  if (c.area_max != null && (lot.area_sqm == null || lot.area_sqm > c.area_max)) return false;

  if (c.max_price_to_valuation != null) {
    if (lot.valuation == null || price == null || lot.valuation === 0) return false;
    if (price / lot.valuation > c.max_price_to_valuation) return false;
  }

  return true;
}

export function matchAll(lot: Lot, criteria: Criteria[]): string[] {
  return criteria.filter((c) => c.active && matches(lot, c)).map((c) => c.id);
}
