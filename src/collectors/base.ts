import type { CollectResult, LotSource } from '../types.js';

/** Загальний інтерфейс колектора джерела. */
export interface Collector {
  readonly source: LotSource;
  /**
   * Забрати лоти починаючи з cursor (значення залежить від джерела:
   * для Prozorro — dateModified; для СЕТАМ — не використовується/дата).
   * Повертає нормалізовані лоти + наступний cursor.
   */
  collect(cursor: string | null): Promise<CollectResult>;
}

/** fetch з таймаутом і базовою обробкою помилок. */
export async function fetchJson<T = unknown>(
  url: string,
  timeoutMs = 30_000
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'ua-auction-monitor/0.1' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export async function fetchText(url: string, timeoutMs = 60_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ua-auction-monitor/0.1' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}
