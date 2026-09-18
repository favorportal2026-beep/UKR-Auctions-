import { fetchJson } from './base.js';

export const SETAM_DATASET_URL = 'https://data.gov.ua/api/3/action/package_show?id=c360d1ef-4eee-4158-812f-ede20c4cc943';
type Resource = { url?: string; name?: string; format?: string; last_modified?: string; created?: string };
export type SetamResource = { url: string; date: string | null };

/** Дата снапшоту з імені файлу має пріоритет над датою створення ресурсу. */
export function resourceDate(r: Resource): string | null {
  const match = `${r.url ?? ''} ${r.name ?? ''}`.match(/auctions[-_](\d{2})[-_](\d{2})[-_](\d{4})/i);
  const value = match ? `${match[3]}-${match[2]}-${match[1]}T00:00:00Z` : r.last_modified || r.created;
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function latestCsv(resources: Resource[]): SetamResource {
  const candidates = resources
    .filter(r => r.url && /^https?:\/\//.test(r.url) &&
      (r.format?.toLowerCase() === 'csv' || /\.csv(?:[?#]|$)/i.test(r.url)))
    .map(r => ({ url: r.url!, date: resourceDate(r) }))
    .sort((a,b) => (b.date ? Date.parse(b.date) : 0) - (a.date ? Date.parse(a.date) : 0));
  if (!candidates[0]) throw new Error('СЕТАМ: набір data.gov.ua не містить CSV-ресурсів');
  return candidates[0];
}

export async function discoverSetamResource(override?: string): Promise<SetamResource> {
  if (override) return { url: override, date: resourceDate({ url: override }) };
  const payload = await fetchJson<{ success: boolean; result?: { resources?: Resource[] } }>(SETAM_DATASET_URL);
  if (!payload.success || !payload.result?.resources) throw new Error('СЕТАМ: некоректна відповідь каталогу data.gov.ua');
  return latestCsv(payload.result.resources);
}
