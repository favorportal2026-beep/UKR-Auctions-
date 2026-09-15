// Спільні типи домену.

export type LotSource = 'prozorro' | 'setam';
export type AssetType = 'real_estate' | 'land' | 'other';

/** Нормалізований лот — єдина модель для всіх джерел. */
export interface NormalizedLot {
  source: LotSource;
  source_id: string;
  lot_url?: string | null;
  title?: string | null;
  description?: string | null;
  asset_type: AssetType;
  selling_method?: string | null;
  status?: string | null;
  region?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  area_sqm?: number | null;
  start_price?: number | null;
  current_price?: number | null;
  currency?: string | null;
  valuation?: number | null;
  auction_start?: string | null; // ISO
  bids_end?: string | null; // ISO
  raw: unknown;
}

/** Критерій (збережений пошук). */
export interface Criteria {
  id: string;
  name: string;
  active: boolean;
  asset_types: AssetType[];
  regions: string[];
  selling_methods: string[];
  keywords: string[];
  price_min: number | null;
  price_max: number | null;
  area_min: number | null;
  area_max: number | null;
  max_price_to_valuation: number | null;
}

/** Результат забору джерела. */
export interface CollectResult {
  source: LotSource;
  lots: NormalizedLot[];
  nextCursor?: string | null;
  /** true — більше сторінок немає (остання/єдина). Для пагінації у pipeline. */
  done?: boolean;
}
