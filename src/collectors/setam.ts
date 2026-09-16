import { parse } from 'csv-parse/sync';
import { config } from '../config.js';
import type { CollectResult, NormalizedLot } from '../types.js';
import { fetchText, type Collector } from './base.js';
import { classifySetam, classifySubtype, extractCadastre, isTracked } from './classify.js';

/**
 * Колектор СЕТАМ (арештоване/конфісковане майно).
 *
 * Джерело: CSV-набір на data.gov.ua «Повідомлення про торги ... та їх результати».
 * У СЕТАМ немає JSON-API, тому тягнемо CSV повністю і фільтруємо на нашому боці.
 *
 * ✅ Колонки CSV ЗВІРЕНО на реальному файлі (див. CLAUDE.md). Фактичні заголовки
 * (роздільник — кома, кодування UTF-8, з BOM):
 *   Назва, Стан, Категорія, Місцезнаходження, Переможець, Номер лота,
 *   Стартова ціна, Ціна продажу, Провадження
 *
 * Особливості набору:
 *  - Немає колонок URL, оцінки та дат торгів — тому lot_url будуємо з «Номер лота»,
 *    valuation/auction_start/bids_end лишаються null.
 *  - «Категорія» — контрольований словник → класифікація за classifySetam().
 *  - «Стартова ціна» / «Ціна продажу» — число з крапкою (напр. "403805.00");
 *    «Ціна продажу» заповнена лише для завершених торгів.
 *
 * Резолвер за ключовими словами лишаємо як страховку на випадок зміни заголовків;
 * на першому запуску колектор друкує знайдені заголовки й мапінг.
 */

type Row = Record<string, string>;

// Точні заголовки CSV → логічне поле (звірено). Резолвер за підказками нижче
// спрацьовує лише якщо точного заголовка немає.
const EXACT_COLUMNS: Record<string, string> = {
  id: 'Номер лота',
  title: 'Назва',
  category: 'Категорія',
  region: 'Місцезнаходження',
  address: 'Місцезнаходження',
  price: 'Стартова ціна',
  salePrice: 'Ціна продажу',
  status: 'Стан',
  winner: 'Переможець',
  proceeding: 'Провадження',
};

// Резервні підказки (частковий збіг, нижній регістр) — якщо заголовки зміняться.
const COLUMN_HINTS: Record<string, string[]> = {
  id: ['номер лот', 'id', 'ідентифікатор', 'код лоту', '№'],
  title: ['назва', 'найменування', 'предмет'],
  category: ['категор', 'тип майна', 'вид майна', 'група'],
  region: ['місцезнаходж', 'область', 'регіон', 'адреса', 'розташування'],
  address: ['місцезнаходж', 'адреса', 'розташування'],
  price: ['стартова', 'початкова ціна', 'ціна', 'вартість'],
  salePrice: ['ціна продажу', 'ціна реалізації'],
  valuation: ['оцін', 'оціночна'],
  auctionDate: ['дата торгів', 'дата аукціону', 'дата проведення'],
  bidsEnd: ['дата закінчення', 'кінцевий термін', 'прийом заяв'],
  url: ['посилання', 'url', 'лінк'],
  status: ['стан', 'статус'],
  winner: ['переможець'],
  proceeding: ['провадження', 'виконавче провадження'],
};

function resolveColumns(headers: string[]): Record<string, string | null> {
  const map: Record<string, string | null> = {};
  const lower = headers.map((h) => h.toLowerCase().trim());
  const fields = new Set([...Object.keys(EXACT_COLUMNS), ...Object.keys(COLUMN_HINTS)]);
  for (const field of fields) {
    // 1) точний заголовок
    const exact = EXACT_COLUMNS[field];
    if (exact && headers.includes(exact)) {
      map[field] = exact;
      continue;
    }
    // 2) підказки за частковим збігом
    const hints = COLUMN_HINTS[field] ?? [];
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
  const m = v.match(/(\d{2})\.(\d{2})\.(\d{4})/); // dd.mm.yyyy
  if (m) return new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00Z`).toISOString();
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

// У CSV немає URL, а сторінка лота — /auction/{ID_АУКЦІОНУ}, де ID ≠ «Номер лота».
// Резолвимо URL зі списку торгів: там у кожній картці є і «Номер лоту», і лінк
// /auction/{id}. Токени в порядку документа: спершу /auction/{id}, потім номер.
const AUCTION_PAIR_RE = /auction\/(\d+)|Номер лоту:\s*<span>(\d+)<\/span>/g;
const SETAM_LIST_MAX_PAGES = 45;

/** Мапа «Номер лота» → URL сторінки /auction/{id}, зібрана зі списку торгів СЕТАМ. */
async function resolveAuctionUrls(needed: Set<string>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let p = 1; p <= SETAM_LIST_MAX_PAGES && map.size < needed.size; p++) {
    const url = p === 1 ? 'https://setam.net.ua/auctions' : `https://setam.net.ua/auctions/page/${p}`;
    let html: string;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.warn(`[setam] не вдалося прочитати список торгів (${url}):`, (e as Error).message);
      break;
    }
    let last: string | null = null;
    let pairsOnPage = 0;
    for (const m of html.matchAll(AUCTION_PAIR_RE)) {
      if (m[1]) {
        last = m[1];
      } else if (m[2] && last) {
        pairsOnPage++;
        if (needed.has(m[2]) && !map.has(m[2])) {
          map.set(m[2], `https://setam.net.ua/auction/${last}`);
        }
      }
    }
    if (pairsOnPage === 0) break; // порожня/остання сторінка
  }
  console.log(`[setam] резолвлено URL: ${map.size}/${needed.size}`);
  return map;
}

export class SetamCollector implements Collector {
  readonly source = 'setam' as const;
  constructor(private csvUrl = config.setam.csvUrl) {}

  async collect(_cursor: string | null): Promise<CollectResult> {
    if (!this.csvUrl) {
      console.warn('[setam] SETAM_CSV_URL не задано — пропускаю. Див. CLAUDE.md.');
      return { source: this.source, lots: [], nextCursor: _cursor, done: true };
    }

    const csv = await fetchText(this.csvUrl);
    const rows = parse(csv, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }) as Row[];

    if (rows.length === 0) return { source: this.source, lots: [], nextCursor: _cursor, done: true };

    const headers = Object.keys(rows[0]!);
    const col = resolveColumns(headers);
    console.log('[setam] заголовки CSV:', headers.join(' | '));
    console.log('[setam] мапінг колонок:', col);

    const lots: NormalizedLot[] = [];
    for (const r of rows) {
      const title = (col.title ? r[col.title] : '') ?? '';
      const category = (col.category ? r[col.category] : '') ?? '';
      const assetType = classifySetam(category, title);
      if (!isTracked(assetType)) continue; // тільки нерухомість/земля
      const subtype = classifySubtype(assetType, `${category} ${title}`, category);

      const rawId = (col.id && r[col.id]) ? String(r[col.id]).trim() : '';
      const sourceId =
        rawId ||
        (col.url && r[col.url]) ||
        `${title}-${col.auctionDate ? r[col.auctionDate] : ''}`;

      const startPrice = col.price ? num(r[col.price]) : null;
      const salePrice = col.salePrice ? num(r[col.salePrice]) : null;

      lots.push({
        source: this.source,
        source_id: String(sourceId).trim(),
        lot_url: (col.url ? r[col.url] : null) || null, // резолвимо нижче зі списку торгів
        title: title || null,
        description: category || null,
        asset_type: assetType,
        subtype,
        cadastral_number: extractCadastre(`${category} ${title}`),
        selling_method: 'setam',
        status: col.status ? r[col.status] : null,
        region: col.region ? r[col.region] : null,
        address: col.address ? r[col.address] : null,
        lat: null,
        lng: null,
        area_sqm: null,
        start_price: startPrice,
        // поточна = ціна продажу (для завершених), інакше стартова
        current_price: salePrice ?? startPrice,
        currency: 'UAH',
        valuation: col.valuation ? num(r[col.valuation]) : null,
        auction_start: col.auctionDate ? toIso(r[col.auctionDate]) : null,
        bids_end: col.bidsEnd ? toIso(r[col.bidsEnd]) : null,
        raw: r,
      });
    }

    // Резолвимо посилання на сторінки лотів зі списку торгів (best-effort).
    if (lots.length > 0) {
      const needed = new Set(lots.map((l) => l.source_id).filter((n) => /^\d+$/.test(n)));
      try {
        const urls = await resolveAuctionUrls(needed);
        for (const l of lots) {
          if (!l.lot_url) l.lot_url = urls.get(l.source_id) ?? null;
        }
      } catch (e) {
        console.warn('[setam] резолвінг URL пропущено:', (e as Error).message);
      }
    }

    // СЕТАМ віддає повний CSV за один раз — пагінації немає (done=true).
    return { source: this.source, lots, nextCursor: new Date().toISOString(), done: true };
  }
}
