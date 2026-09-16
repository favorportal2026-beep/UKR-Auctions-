// Спільна логіка фільтрів лотів (мапа + дашборд): парсинг searchParams і
// застосування до supabase-запиту. Тримаємо в одному місці, щоб обидві сторінки
// фільтрували однаково.

export type SP = Record<string, string | undefined>;

export const SUBTYPE_LABEL: Record<string, string> = {
  land: 'Земля',
  apartment: 'Квартира',
  house: 'Будинок',
  premises: 'Приміщення',
  building: 'Будівля / споруда',
  garage: 'Гараж / стоянка',
  unfinished: 'Недобудова',
  complex: 'Майновий комплекс',
  other: 'Інше',
};

// Порядок у випадайці підтипу.
export const SUBTYPE_OPTIONS: { value: string; label: string }[] = [
  'land',
  'apartment',
  'house',
  'premises',
  'building',
  'garage',
  'unfinished',
  'complex',
  'other',
].map((v) => ({ value: v, label: SUBTYPE_LABEL[v]! }));

// Дедлайн подання заявок «скоро»: значення = днів від зараз.
export const DEADLINE_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Будь-коли' },
  { value: '1', label: 'До 24 год' },
  { value: '3', label: 'До 3 днів' },
  { value: '7', label: 'До тижня' },
];

// Сортування списку/сітки.
export const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'new', label: 'Спочатку нові' },
  { value: 'price_asc', label: 'Ціна ↑' },
  { value: 'price_desc', label: 'Ціна ↓' },
  { value: 'area_desc', label: 'Площа ↓' },
  { value: 'deadline', label: 'Дедлайн (скоро)' },
  { value: 'discount', label: 'Знижка від оцінки' },
];

/** Застосовує сортування до запиту `lots`. */
export function applyLotSort<T>(query: T, sort: string): T {
  const q = query as any;
  switch (sort) {
    case 'price_asc':
      return q.order('current_price', { ascending: true, nullsFirst: false }) as T;
    case 'price_desc':
      return q.order('current_price', { ascending: false, nullsFirst: false }) as T;
    case 'area_desc':
      return q.order('area_sqm', { ascending: false, nullsFirst: false }) as T;
    case 'deadline':
      return q.order('bids_end', { ascending: true, nullsFirst: false }) as T;
    case 'discount':
      return q.order('price_to_valuation', { ascending: true, nullsFirst: false }) as T;
    default:
      return q.order('updated_at', { ascending: false }) as T;
  }
}

export type LotFilters = {
  source: string;
  asset: string;
  subtype: string;
  region: string;
  q: string;
  priceMin: number | null;
  priceMax: number | null;
  areaMin: number | null;
  areaMax: number | null;
  deadline: string; // '' | '1' | '3' | '7'
  cadastr: string; // кадастровий номер (частковий збіг)
};

function num(v: string | undefined): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export function parseLotFilters(sp: SP): LotFilters {
  return {
    source: sp.source || '',
    asset: sp.asset || '',
    subtype: sp.subtype || '',
    region: (sp.region || '').trim(),
    q: (sp.q || '').trim(),
    priceMin: num(sp.price_min),
    priceMax: num(sp.price_max),
    areaMin: num(sp.area_min),
    areaMax: num(sp.area_max),
    deadline: sp.deadline || '',
    cadastr: (sp.cadastr || '').trim(),
  };
}

/**
 * Застосовує спільні фільтри до supabase-запиту `lots`. Приймає й повертає
 * билдер (PostgrestFilterBuilder), тому працює і на мапі, і на дашборді.
 */
export function applyLotFilters<T>(query: T, f: LotFilters): T {
  // supabase-js повертає той самий билдер із кожного методу; типізуємо через any.
  let q = query as any;
  if (f.source) q = q.eq('source', f.source);
  if (f.asset) q = q.eq('asset_type', f.asset);
  if (f.subtype) q = q.eq('subtype', f.subtype);
  if (f.region) q = q.ilike('region', `%${f.region}%`);
  if (f.q) q = q.or(`title.ilike.%${f.q}%,description.ilike.%${f.q}%`);
  if (f.cadastr) q = q.ilike('cadastral_number', `%${f.cadastr}%`);
  if (f.priceMin != null) q = q.gte('current_price', f.priceMin);
  if (f.priceMax != null) q = q.lte('current_price', f.priceMax);
  if (f.areaMin != null) q = q.gte('area_sqm', f.areaMin);
  if (f.areaMax != null) q = q.lte('area_sqm', f.areaMax);
  if (f.deadline) {
    const days = Number(f.deadline);
    if (!isNaN(days) && days > 0) {
      const now = new Date();
      const until = new Date(now.getTime() + days * 86400_000);
      q = q.gte('bids_end', now.toISOString()).lte('bids_end', until.toISOString());
    }
  }
  return q as T;
}
