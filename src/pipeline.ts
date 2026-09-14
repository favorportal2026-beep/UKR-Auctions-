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

  for (const c of collectors) {
    const cursor = await getCursor(c.source);
    console.log(`[${c.source}] старт, cursor=${cursor ?? '—'}`);
    const { lots, nextCursor } = await c.collect(cursor);
    console.log(`[${c.source}] отримано лотів: ${lots.length}`);

    const changed = await upsertLots(lots);
    console.log(`[${c.source}] нових/змінених: ${changed.length}`);

    const pairs: { lot_id: string; criteria_id: string }[] = [];
    for (const { id, lot } of changed) {
      for (const cid of matchAll(lot, criteria)) pairs.push({ lot_id: id, criteria_id: cid });
    }
    await insertMatches(pairs);
    console.log(`[${c.source}] нових збігів: ${pairs.length}`);

    if (nextCursor) await setCursor(c.source, nextCursor);
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
