import { config } from '../config.js';
import type { CollectResult, NormalizedLot } from '../types.js';
import { fetchJson, type Collector } from './base.js';
import { classifyAsset, classifySubtype } from './classify.js';

/**
 * Колектор Prozorro.Sale (ЦБД-New, відкрите API).
 *
 * Курсор: dateModified. Ендпоінт віддає повні процедури, відсортовані за
 * датою зміни ЗА ЗРОСТАННЯМ; для наступної сторінки беремо останній
 * dateModified + 1мс.
 *   GET {apiBase}/search/byDateModified/{ISOdate}?limit=100
 *
 * ⚠️ Мапінг полів ЗВІРЕНО на реальних відповідях API (див. CLAUDE.md):
 *  - Відповідь — це ГОЛИЙ JSON-масив процедур `[ {...}, ... ]`
 *    (а не OpenProcurement-конверт `{ data, next_page }`). Читаємо захищено
 *    для обох форматів на випадок legacy-інстансів.
 *  - Рядкові поля локалізовані: `{ "uk_UA": "..." }` (title, description,
 *    address.*, unit.name, classification.description, sellingEntity.name) —
 *    дістаємо через loc().
 *  - Ідентифікатор: `auctionId` (напр. "LAE001-UA-20260803-09138").
 *  - Ціна: `value.amount` (стартова), валюта `value.currency`.
 *  - Оцінка: `expertMonetaryValuation.amount` (експертна/ринкова) або, як
 *    fallback, `normativeMonetaryValuation.amount` (нормативна). Поля `valuation`
 *    в API немає.
 *  - Класифікація: CAV у `items[].classification.id` (+ additionalClassifications).
 *  - Адреса активу: `items[].address` (region/locality/streetAddress —
 *    локалізовані); fallback — `sellingEntity.address` (це орган, що продає).
 *  - Площа: `items[].quantity` + `items[].unit.code` (HAR=гектар→×10000 м²,
 *    MTK=м²). Інші одиниці (TNE/H87/LO…) площею не вважаємо.
 *  - Періоди: `auctionPeriod.startDate`, `tenderPeriod.endDate`.
 *  - Посилання: `auctionUrl`.
 */

interface OpEnvelope {
  data?: unknown[];
  next_page?: { offset?: string };
}

function asArray(x: unknown): any[] {
  return Array.isArray(x) ? x : [];
}

/** Дістати рядок із локалізованого поля `{uk_UA|en_US}` або звичайного рядка. */
function loc(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v || null;
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const s = o.uk_UA ?? o.en_US ?? Object.values(o)[0];
    return typeof s === 'string' ? s || null : null;
  }
  return null;
}

function toIso(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && !isNaN(n) ? n : null;
}

/** Площа у м² з quantity + unit.code (HAR=гектар, MTK=м²); інакше null. */
function areaSqm(quantity: unknown, unit: any): number | null {
  const q = num(quantity);
  if (q == null) return null;
  const code = String(unit?.code ?? '').toUpperCase();
  const name = (loc(unit?.name) ?? '').toLowerCase();
  if (code === 'HAR' || name.includes('гектар')) return q * 10_000; // га → м²
  if (code === 'MTK' || name.includes('квадратн') || name.includes('кв. м') || name.includes('м²')) {
    return q;
  }
  return null;
}

export class ProzorroCollector implements Collector {
  readonly source = 'prozorro' as const;
  constructor(private apiBase = config.prozorro.apiBase) {}

  async collect(cursor: string | null): Promise<CollectResult> {
    const start = cursor || new Date(config.prozorro.startDate).toISOString();
    const url =
      `${this.apiBase}/search/byDateModified/${encodeURIComponent(start)}` +
      `?limit=${config.collect.pageLimit}`;

    const payload = await fetchJson<unknown[] | OpEnvelope>(url);
    // Реальний ендпоінт віддає голий масив; legacy — конверт { data }.
    const rows = Array.isArray(payload)
      ? payload
      : asArray((payload as OpEnvelope)?.data);

    const lots: NormalizedLot[] = [];
    let lastModified: string | null = cursor;

    for (const row of rows) {
      const dm = toIso(row?.dateModified);
      if (dm) lastModified = dm;
      const lot = this.normalize(row);
      if (lot) lots.push(lot);
    }

    // наступний курсор = останній dateModified + 1мс (щоб не зациклитись)
    let nextCursor = lastModified;
    if (nextCursor) {
      const d = new Date(nextCursor);
      d.setMilliseconds(d.getMilliseconds() + 1);
      nextCursor = d.toISOString();
    }

    // остання сторінка, якщо повернулось менше за ліміт або курсор не зрушив
    const done = rows.length < config.collect.pageLimit || nextCursor === cursor;
    return { source: this.source, lots, nextCursor, done };
  }

  private normalize(a: any): NormalizedLot | null {
    if (!a || typeof a !== 'object') return null;
    const sourceId: string | undefined = a.auctionId ?? a._id ?? a.id ?? a.lotId;
    if (!sourceId) return null;

    const items = asArray(a.items);
    const first = items[0] ?? {};

    // коди класифікації CAV (основна + додаткові) та їх описи з усіх items
    const codes: string[] = [];
    const classDescr: string[] = [];
    for (const it of items) {
      if (it?.classification?.id) {
        codes.push(String(it.classification.id));
        const d = loc(it.classification.description);
        if (d) classDescr.push(d);
      }
      for (const ac of asArray(it?.additionalClassifications)) {
        if (ac?.id) codes.push(String(ac.id));
        const d = loc(ac?.description);
        if (d) classDescr.push(d);
      }
    }

    const title = loc(a.title) ?? loc(first?.description) ?? '';
    const description = loc(a.description) ?? loc(first?.description) ?? '';
    const sellingMethod: string | null = a.sellingMethod ?? a.saleType ?? null;
    // текст для класифікації включає описи класифікатора CAV (укр.)
    const classifyText = `${title} ${description} ${classDescr.join(' ')}`;
    const assetType = classifyAsset(sellingMethod, codes, classifyText);
    const subtype = classifySubtype(assetType, classifyText);

    // ціна: стартова (value) та мін. крок як fallback
    const startPrice = num(a.value?.amount) ?? num(a.minimalStep?.amount) ?? null;
    const currency = a.value?.currency ?? 'UAH';

    // оцінка: експертна (ринкова), інакше нормативна
    const valuation =
      num(a.expertMonetaryValuation?.amount) ??
      num(a.normativeMonetaryValuation?.amount) ??
      null;

    // адреса активу — з items; fallback — sellingEntity (орган, що продає)
    const addr = first?.address ?? a.sellingEntity?.address ?? {};
    const region = loc(addr?.region) ?? loc(addr?.locality);
    const address =
      [loc(addr?.region), loc(addr?.locality), loc(addr?.streetAddress)]
        .filter(Boolean)
        .join(', ') || null;

    const area = areaSqm(first?.quantity, first?.unit);

    const auctionStart = toIso(a.auctionPeriod?.startDate);
    const bidsEnd =
      toIso(a.tenderPeriod?.endDate) ??
      toIso(a.enquiryPeriod?.endDate) ??
      toIso(a.rectificationPeriod?.endDate);

    const lotUrl =
      a.auctionUrl ??
      (a.auctionId ? `https://prozorro.sale/auction/${a.auctionId}` : null);

    return {
      source: this.source,
      source_id: String(sourceId),
      lot_url: lotUrl,
      title: title || null,
      description: description || null,
      asset_type: assetType,
      subtype,
      selling_method: sellingMethod,
      status: a.status ?? null,
      region,
      address,
      lat: num(addr?.latitude),
      lng: num(addr?.longitude),
      area_sqm: area,
      start_price: startPrice,
      current_price: startPrice,
      currency,
      valuation,
      auction_start: auctionStart,
      bids_end: bidsEnd,
      raw: a,
    };
  }
}
