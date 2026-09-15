import { config } from '../config.js';
import type { GeoQuery } from './query.js';

/**
 * Геокодування адреси через OpenStreetMap Nominatim (безкоштовно).
 * Дотримуємось політики використання: описовий User-Agent і не частіше 1 запиту/сек.
 * У пісочниці немає мережі до nominatim — реально працює на GitHub Actions.
 */
const BASE = config.geo.nominatimBase;
const UA = 'ua-auction-monitor/0.1 (+https://github.com/favorportal2026-beep/UKR-Auctions-)';

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function nominatim(q: string): Promise<{ lat: number; lng: number } | null> {
  const url = `${BASE}/search?format=jsonv2&limit=1&countrycodes=ua&q=${encodeURIComponent(q)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    const arr = (await res.json()) as any[];
    const hit = Array.isArray(arr) ? arr[0] : null;
    const lat = hit ? Number(hit.lat) : NaN;
    const lng = hit ? Number(hit.lon) : NaN;
    return !isNaN(lat) && !isNaN(lng) ? { lat, lng } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** Пробує повний запит, потім рівень населеного пункту. Пауза 1.1с між запитами. */
export async function geocode(q: GeoQuery): Promise<{ lat: number; lng: number } | null> {
  for (const query of [q.freeform, q.cityForm]) {
    if (!query || query === 'Україна') continue;
    const r = await nominatim(query);
    await sleep(1100); // політика Nominatim: ≤1 запиту/сек
    if (r) return r;
  }
  return null;
}
