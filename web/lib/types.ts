// Доменні типи для веб-дашборда (дзеркало src/types.ts колектора).

export type LotSource = 'prozorro' | 'setam';
export type AssetType = 'real_estate' | 'land' | 'other';

export interface Lot {
  id: string;
  source: LotSource;
  source_id: string;
  lot_url: string | null;
  title: string | null;
  description: string | null;
  asset_type: AssetType;
  subtype: string | null;
  selling_method: string | null;
  status: string | null;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  area_sqm: number | null;
  start_price: number | null;
  current_price: number | null;
  currency: string | null;
  valuation: number | null;
  auction_start: string | null;
  bids_end: string | null;
  hidden: boolean;
  updated_at: string;
}

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
  created_at: string;
}

/** Лот із назвами критеріїв, під які він підпадає. */
export interface LotWithMatches extends Lot {
  matchedCriteria: { id: string; name: string }[];
}
