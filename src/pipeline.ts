import { config } from './config.js';
import type { Collector } from './collectors/base.js';
import { ProzorroCollector } from './collectors/prozorro.js';
import { SetamCollector } from './collectors/setam.js';
import { isSaleMethod } from './collectors/status.js';
import { geocode } from './geo/geocode.js';
import { buildGeoQuery } from './geo/query.js';
import {
  getCursor,
  getGeocodeCache,
  getUnnotifiedMatches,
  lotsMissingCoords,
  markNotified,
  saveCoords,
  setCursor,
  setGeocodeCache,
  upsertLots,
  rematchLots,
  rematchAllLots,
  recordSync,
  syncState,
  db,
} from './db/supabase.js';
import { formatLot, sendTelegram } from './notify/telegram.js';
import type { LotSource } from './types.js';

export function makeCollectors(only?: LotSource): Collector[] {
  const all: Collector[] = [new ProzorroCollector(), new SetamCollector()];
  return only ? all.filter((c) => c.source === only) : all;
}

/** Повний прохід: збір → БД → критерії → сповіщення. */
export async function runPipeline(opts: { only?: LotSource; noNotify?: boolean; noGeocode?: boolean } = {}): Promise<void> {
  const collectors = makeCollectors(opts.only);
  const { maxPages } = config.collect;
  const errors: string[] = [];
  for (const c of collectors) {
    let totalLots = 0;
    let totalPairs = 0;
    let complete = false;
    const previous=await syncState(c.source);
    try {
      await recordSync(c.source,{started_at:new Date().toISOString(),run_status:'running',last_error:null});
      let cursor = await getCursor(c.source);
      console.log(`[${c.source}] старт, cursor=${cursor ?? '—'}, maxPages=${maxPages}`);
      for (let page = 1; page <= maxPages; page++) {
        const {lots,nextCursor,done,dataUrl,dataDate} = await c.collect(cursor);
        const tracked = lots.filter(l => l.asset_type !== 'other' && isSaleMethod(l.selling_method));
        const stored = await upsertLots(tracked);
        totalLots += stored.length;
        if (stored.length) totalPairs += (await rematchLots(stored.map(l => l.id))).inserted;
        if (dataUrl) await recordSync(c.source,{data_url:dataUrl,data_date:dataDate ?? null});
        if (nextCursor) { await setCursor(c.source,nextCursor); cursor=nextCursor; }
        if (done || !nextCursor) { complete=true; break; }
      }
      if (c.source==='prozorro') await refreshKnownProzorro(config.prozorro.refreshLimit);
      await recordSync(c.source,{run_status:complete?'success':'partial',
        last_success_at:new Date().toISOString(),collected_count:totalLots,last_error:null});
      console.log(`[${c.source}] оновлено: ${totalLots}, нових збігів: ${totalPairs}, повний=${complete}`);
      if (!opts.noNotify && previous?.run_status==='failed') await sendTelegram(`✅ Збір ${c.source} відновлено.`).catch(e=>console.error('[notify]',e));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      errors.push(`${c.source}: ${message}`);
      await recordSync(c.source,{run_status:'failed',last_error:message.slice(0,2000)});
      console.error(`[${c.source}] ${message}`);
      if (!opts.noNotify && (previous?.run_status!=='failed' || previous?.last_error!==message.slice(0,2000))) {
        await sendTelegram(`⚠️ Збір ${c.source} не завершився. Деталі — у статусі джерела на сайті та GitHub Actions.`).catch(e=>console.error('[notify] Не вдалося повідомити про збій',e));
      }
    }
  }
  // Дедлайн міг спливти без зміни процедури в джерелі.
  const fullMatch=await rematchAllLots();
  console.log(`[match] повний перерахунок: +${fullMatch.inserted}, -${fullMatch.deleted}, всього=${fullMatch.total}`);
  if (errors.length) throw new Error(errors.join('\n'));

  if (!opts.noGeocode) await geocodeMissing();
  if (!opts.noNotify) await notifyMatches();
}

/** Послідовно перевіряє вже відомі процедури, включно зі старими активними статусами. */
export async function refreshKnownProzorro(limit: number): Promise<void> {
  const state=await syncState('prozorro');
  let cursor: string|null=state?.refresh_cursor ?? null;
  let refreshed=0;
  const collector=new ProzorroCollector();
  while (refreshed<limit) {
    let query=db().from(config.tables.lots).select('id,source_id,internal_id:raw->>_id')
      .eq('source','prozorro').eq('is_active',true).order('id').limit(Math.min(100,limit-refreshed));
    if (cursor) query=query.gt('id',cursor);
    const {data,error}=await query;
    if (error) throw new Error(error.message);
    if (!data?.length) { await recordSync('prozorro',{refresh_cursor:null});break; }
    // Невеликі групи запитів до джерела; запис і matching один раз на сторінку.
    const refreshedLots=[];
    for (let start=0;start<data.length;start+=5) {
      const group=data.slice(start,start+5);
      const lots=await Promise.all(group.map(async row=>{
        if (!row.internal_id) throw new Error(`Prozorro: відсутній внутрішній id ${row.source_id}`);
        const lot=await collector.getProcedure(String(row.internal_id));
        if (!lot || lot.source_id!==row.source_id) throw new Error(`Prozorro: процедура не відповідає ${row.source_id}`);
        return lot;
      }));
      refreshedLots.push(...lots);
    }
    const stored=await upsertLots(refreshedLots);
    if (stored.length) await rematchLots(stored.map(l=>l.id));
    refreshed+=data.length;cursor=data[data.length-1]!.id;
    await recordSync('prozorro',{refresh_cursor:cursor});
    console.log(`[refresh] перевірено ${refreshed}, cursor=${cursor}`);

  }
  console.log(`[refresh] перевірено Prozorro: ${refreshed}`);
}

/**
 * Геокодує лоти без координат (OSM Nominatim), щоб на мапі був точний пін.
 * Обмежено GEOCODE_MAX_PER_RUN за запуск (політика ≤1 req/s). Кеш за текстом
 * запиту економить звернення для однакових адрес.
 */
export async function geocodeMissing(): Promise<void> {
  const rows = await lotsMissingCoords(config.geo.maxPerRun);
  if (rows.length === 0) {
    console.log('[geo] лотів без координат немає.');
    return;
  }
  let ok = 0;
  for (const lot of rows) {
    const q = buildGeoQuery(lot);
    let coord = await getGeocodeCache(q.freeform);
    if (coord === undefined) {
      const r = await geocode(q);
      coord = { lat: r?.lat ?? null, lng: r?.lng ?? null };
      await setGeocodeCache(q.freeform, coord.lat, coord.lng);
    }
    if (coord.lat != null && coord.lng != null) {
      await saveCoords(lot.id, coord.lat, coord.lng);
      ok++;
    }
  }
  console.log(`[geo] геокодовано: ${ok}/${rows.length}`);
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
