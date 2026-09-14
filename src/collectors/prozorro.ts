import { config } from '../config.js';
import type { CollectResult, NormalizedLot } from '../types.js';
import { fetchJson, type Collector } from './base.js';
import { classifyAsset } from './classify.js';

/**
 * Колектор Prozorro.Sale (ЦБД-New, відкрите API).
 *
 * Курсор: dateModified. Ендпоінт віддає повні процедури, відсортовані за
 * датою зміни; для наступної сторінки беремо останній dateModified + 1мс.
 *   GET {apiBase}/search/byDateModified/{ISOdate}?limit=100
 *
 * Envelope OpenProcurement: { data: [...], next_page?: {...} } — читаємо захищено.
 *
 * ⚠️ Мапінг полів (value, items, classification, auctionPeriod, address)
 * звірити на першому реальному запуску — див. CLAUDE.md. Усе через optional chaining.
 */

interface OpEnvelope {
  data?: unknown[];
  next_page?: { offset?: string };
}

function asArray(x: unknown): any[] {
  return Array.isArray(x) ? x : [];
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

export class ProzorroCollector implements Collector {
  readonly source = 'prozorro' as const;
  constructor(private apiBase = config.prozorro.apiBase) {}

  async collect(cursor: string | null): Promise<CollectResult> {
    const start = cursor || new Date(config.prozorro.startDate).toISOString();
    const url =
      `${this.apiBase}/search/byDateModified/${encodeURIComponent(start)}` +
      `?limit=${config.collect.pageLimit}`;

    const env = await fetchJson<OpEnvelope>(url);
    const rows = asArray(env.data);

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

    return { source: this.source, lots, nextCursor };
  }

  private normalize(a: any): NormalizedLot | null {
    if (!a || typeof a !== 'object') return null;
    const sourceId: string | undefined = a.auctionId ?? a.id ?? a._id;
    if (!sourceId) return null;

    const items = asArray(a.items);
    const first = items[0] ?? {};

    // коди класифікації (основна + додаткові) з усіх items
    const codes: string[] = [];
    for (const it of items) {
      if (it?.classification?.id) codes.push(String(it.classification.id));
      for (const ac of asArray(it?.additionalClassifications)) {
        if (ac?.id) codes.push(String(ac.id));
      }
    }

    const title: string = a.title ?? first?.description ?? '';
    const description: string = a.description ?? first?.description ?? '';
    const sellingMethod: string | null = a.sellingMethod ?? a.procurementMethodType ?? null;
    const assetType = classifyAsset(sellingMethod, codes, `${title} ${description}`);

    // ціна: стартова (value) та поточна (де є)
    const startPrice = num(a.value?.amount) ?? num(a.minimalStep?.amount) ?? null;
    const currency = a.value?.currency ?? 'UAH';

    // адреса/регіон з items або procuringEntity
    const addr = first?.address ?? a.procuringEntity?.address ?? {};
    const region = addr?.region ?? addr?.locality ?? null;
    const address = [addr?.region, addr?.locality, addr?.streetAddress]
      .filter(Boolean)
      .join(', ') || null;

    // площа з quantity (де одиниця = кв.м / га)
    let area: number | null = null;
    const q = num(first?.quantity);
    const unit = (first?.unit?.name ?? first?.unit?.code ?? '').toLowerCase();
    if (q != null && (unit.includes('м2') || unit.includes('кв') || unit.includes('м²'))) area = q;

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
      valuation: num(a.value?.valueAddedTaxIncluded ? null : a.valuation?.amount) ?? null,
      auction_start: auctionStart,
      bids_end: bidsEnd,
      raw: a,
    };
  }
}
