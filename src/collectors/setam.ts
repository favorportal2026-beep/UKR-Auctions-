import { parse } from 'csv-parse/sync';
import { config } from '../config.js';
import type { CollectResult, NormalizedLot } from '../types.js';
import { fetchText, type Collector } from './base.js';
import { classifyAsset, isTracked } from './classify.js';

/**
 * Колектор СЕТАМ (арештоване/конфісковане майно).
 *
 * Джерело: CSV-набір на data.gov.ua
 *   «Повідомлення про торги ... та їх результати».
 * У СЕТАМ немає JSON-API, тому тягнемо CSV повністю і фільтруємо на нашому боці.
 *
 * ⚠️ Точні назви колонок CSV невідомі до першого завантаження. Тому нижче —
 * гнучкий резолвер колонок за ключовими словами; на першому запуску колектор
 * друкує знайдені заголовки, щоб ви (у Claude Code) закріпили точний мапінг.
 * Див. CLAUDE.md → «СЕТАМ: закріпити колонки CSV».
 */

type Row = Record<string, string>;

// кандидати назв колонок (укр., частими варіантами) → логічне поле
const COLUMN_HINTS: Record<string, string[]> = {
  id: ['номер лоту', 'id', 'ідентифікатор', 'код лоту', '№'],
  title: ['назва', 'найменування', 'предмет', 'опис'],
  category: ['категор', 'тип майна', 'вид майна', 'група'],
  region: ['область', 'регіон', 'місто', 'адреса', 'розташування'],
  address: ['адреса', 'місцезнаходження', 'розташування'],
  price: ['стартова', 'початкова ціна', 'ціна', 'вартість'],
  valuation: ['оцін', 'оціночна'],
  auctionDate: ['дата торгів', 'дата аукціону', 'дата проведення'],
  bidsEnd: ['дата закінчення', 'кінцевий термін', 'прийом заяв'],
  url: ['посилання', 'url', 'лінк'],
  status: ['статус', 'стан'],
};

function resolveColumns(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const lower = headers.map((h) => h.toLowerCase());
  for (const [field, hints] of Object.entries(COLUMN_HINTS)) {
    const idx = lower.findIndex((h) => hints.some((hint) => h.includes(hint)));
    map[field] = idx >= 0 ? headers[idx]! : null;
  }
  return map;
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v.replace(/\s/g, '').replace(',', '.').replace(/[^\d.]/g, ''));
  return isNaN(n) ? null : n;
}

function toIso(v: string | undefined): string | null {
  if (!v) return null;
  // спробувати dd.mm.yyyy та ISO
  const m = v.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

export class SetamCollector implements Collector {
  readonly source = 'setam' as const;
  constructor(private csvUrl = config.setam.csvUrl) {}

  async collect(_cursor: string | null): Promise<CollectResult> {
    if (!this.csvUrl) {
      console.warn('[setam] SETAM_CSV_URL не задано — пропускаю. Див. CLAUDE.md.');
      return { source: this.source, lots: [], nextCursor: _cursor };
    }

    const csv = await fetchText(this.csvUrl);
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }) as Row[];

    if (rows.length === 0) return { source: this.source, lots: [], nextCursor: _cursor };

    const headers = Object.keys(rows[0]!);
    const col = resolveColumns(headers);
    console.log('[setam] заголовки CSV:', headers.join(' | '));
    console.log('[setam] мапінг колонок:', col);

    const lots: NormalizedLot[] = [];
    for (const r of rows) {
      const title = col.title ? r[col.title] : '';
      const category = col.category ? r[col.category] : '';
      const assetType = classifyAsset(null, [], `${category} ${title}`);
      if (!isTracked(assetType)) continue; // тільки нерухомість/земля

      const sourceId =
        (col.id && r[col.id]) ||
        (col.url && r[col.url]) ||
        `${title}-${col.auctionDate ? r[col.auctionDate] : ''}`;

      lots.push({
        source: this.source,
        source_id: String(sourceId).trim(),
        lot_url: col.url ? r[col.url] : null,
        title: title || null,
        description: category || null,
        asset_type: assetType,
        selling_method: 'setam',
        status: col.status ? r[col.status] : null,
        region: col.region ? r[col.region] : null,
        address: col.address ? r[col.address] : null,
        lat: null,
        lng: null,
        area_sqm: null,
        start_price: col.price ? num(r[col.price]) : null,
        current_price: col.price ? num(r[col.price]) : null,
        currency: 'UAH',
        valuation: col.valuation ? num(r[col.valuation]) : null,
        auction_start: col.auctionDate ? toIso(r[col.auctionDate]) : null,
        bids_end: col.bidsEnd ? toIso(r[col.bidsEnd]) : null,
        raw: r,
      });
    }

    // СЕТАМ віддає повний CSV — курсор не потрібен (дедуп робить БД).
    return { source: this.source, lots, nextCursor: new Date().toISOString() };
  }
}
