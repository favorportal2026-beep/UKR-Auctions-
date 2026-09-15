import { config } from './config.js';
import type { Collector } from './collectors/base.js';
import { ProzorroCollector } from './collectors/prozorro.js';
import { SetamCollector } from './collectors/setam.js';
import { matchAll } from './criteria/engine.js';
import {
  getActiveCriteria,
  getCursor,
  getUnnotifiedMatches,
  insertMatches,
  markNotified,
  setCursor,
  upsertLots,
} from './db/supabase.js';
import { formatLot, sendTelegram } from './notify/telegram.js';
import type { LotSource } from './types.js';

export function makeCollectors(only?: LotSource): Collector[] {
  const all: Collector[] = [new ProzorroCollector(), new SetamCollector()];
  return only ? all.filter((c) => c.source === only) : all;
}

/** Повний прохід: збір → БД → критерії → сповіщення. */
export async function runPipeline(opts: { only?: LotSource } = {}): Promise<void> {
  const collectors = makeCollectors(opts.only);
  const criteria = await getActiveCriteria();
  console.log(`[pipeline] активних критеріїв: ${criteria.length}`);

  const { maxPages } = config.collect;

  for (const c of collectors) {
    let cursor = await getCursor(c.source);
    console.log(`[${c.source}] старт, cursor=${cursor ?? '—'}, maxPages=${maxPages}`);

    let totalLots = 0;
    let totalPairs = 0;
    // Пагінація: докручуємо курсор через кілька сторінок за один запуск,
    // доки джерело не скаже done або не впремося в maxPages (захист від rate limit).
    for (let page = 1; page <= maxPages; page++) {
      const { lots, nextCursor, done } = await c.collect(cursor);
      // Зберігаємо лише профільні активи (нерухомість/земля) — Prozorro віддає
      // усе поспіль (авто, щебінь…), а це монітор нерухомості й землі.
      const tracked = lots.filter((l) => l.asset_type !== 'other');
      totalLots += tracked.length;

      const changed = await upsertLots(tracked);
      const pairs: { lot_id: string; criteria_id: string }[] = [];
      for (const { id, lot } of changed) {
        for (const cid of matchAll(lot, criteria)) pairs.push({ lot_id: id, criteria_id: cid });
      }
      await insertMatches(pairs);
      totalPairs += pairs.length;

      if (nextCursor) {
        await setCursor(c.source, nextCursor);
        cursor = nextCursor;
      }
      if (done || lots.length === 0 || !nextCursor) break;
    }
    console.log(`[${c.source}] всього лотів: ${totalLots}, нових збігів: ${totalPairs}`);
  }

  await notifyMatches();
}

/** Розсилає Telegram по незасповіщених збігах. */
export async function notifyMatches(): Promise<void> {
  const pending = await getUnnotifiedMatches();
  if (pending.length === 0) {
    console.log('[notify] нових збігів для сповіщення немає.');
    return;
  }
  const done: string[] = [];
  for (const m of pending) {
    const ok = await sendTelegram(formatLot(m.lot, m.criteria_name));
    if (ok) done.push(m.match_id);
  }
  await markNotified(done);
  console.log(`[notify] надіслано: ${done.length}/${pending.length}`);
}
