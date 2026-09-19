import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type { Criteria, LotSource, NormalizedLot } from '../types.js';
import { isOpenLot } from '../collectors/status.js';

let _client: SupabaseClient | null = null;

// Назви таблиць залежать від цільового проєкту (див. config.tables):
// standalone (`lots`…) або портал RONDA (`auction_*`). RPC ua_rematch_lots
// існує в кожній БД під тією самою назвою й працює над своїм набором таблиць.
const T = config.tables;

export function db(): SupabaseClient {
  if (!_client) {
    _client = createClient(config.supabase.url, config.supabase.serviceKey, {
      auth: { persistSession: false },
    });
  }
  return _client;
}

/**
 * Upsert лотів за (source, source_id). Повертає лоти, які є НОВИМИ або в яких
 * оновились поля. Збіги звіряємо для кожного збереженого лота.
 */
export async function upsertLots(lots: NormalizedLot[]): Promise<{ id: string; lot: NormalizedLot; isNew: boolean }[]> {
  const client = db();
  const result: { id: string; lot: NormalizedLot; isNew: boolean }[] = [];
  const unique = [...new Map(lots.map(l => [l.source_id,l])).values()];
  for (let offset = 0; offset < unique.length; offset += 250) {
    const batch = unique.slice(offset, offset + 250);
    const source = batch[0]!.source;
    const { data: existing, error: readError } = await client.from(T.lots)
      .select('id,source_id,lat,lng,lot_url').eq('source',source).in('source_id',batch.map(l => l.source_id));
    if (readError) throw new Error(`upsertLots read: ${readError.message}`);
    const prev = new Map((existing ?? []).map(r => [r.source_id,r]));
    // Нові неактивні лоти не імпортуємо; наявні обов'язково оновлюємо до завершення.
    const tracked = batch.filter(l => prev.has(l.source_id) || isOpenLot(l));
    if (!tracked.length) continue;
    const now = new Date().toISOString();
    const payload = tracked.map(l => ({ ...l,
      lat: l.lat ?? prev.get(l.source_id)?.lat ?? null,
      lng: l.lng ?? prev.get(l.source_id)?.lng ?? null,
      lot_url: l.lot_url ?? prev.get(l.source_id)?.lot_url ?? null,
      last_seen: now,updated_at: now }));
    const { data,error } = await client.from(T.lots).upsert(payload,{onConflict:'source,source_id'})
      .select('id,source_id');
    if (error) throw new Error(`upsertLots: ${error.message}`);
    const ids = new Map((data ?? []).map(r => [r.source_id,r.id]));
    for (const lot of tracked) {
      const id = ids.get(lot.source_id);
      if (id) result.push({id,lot,isNew:!prev.has(lot.source_id)});
    }
  }
  return result;
}

export async function rematchLots(ids?: string[]): Promise<{ inserted: number; deleted: number; total: number }> {
  const {data,error} = await db().rpc('ua_rematch_lots',{p_lot_ids:ids ?? null});
  if (error) throw new Error(`rematchLots: ${error.message}`);
  return data;
}

/** Повний rematch пакетами, щоб кожен RPC вкладався у statement_timeout Supabase. */
export async function rematchAllLots(batchSize = 250): Promise<{ inserted: number; deleted: number; total: number }> {
  const client=db();
  let from=0;
  let inserted=0;
  let deleted=0;
  let total=0;
  while (true) {
    const {data,error}=await client.from(T.lots).select('id').order('id').range(from,from+batchSize-1);
    if (error) throw new Error(`rematchAllLots read: ${error.message}`);
    if (!data?.length) break;
    const result=await rematchLots(data.map(row=>row.id));
    inserted+=result.inserted;
    deleted+=result.deleted;
    total=result.total;
    from+=data.length;
    if (data.length<batchSize) break;
  }
  return {inserted,deleted,total};
}

export async function recordSync(source: LotSource, fields: Record<string,unknown>): Promise<void> {
  const {error} = await db().from(T.cursors).upsert({source,...fields},{onConflict:'source'});
  if (error) throw new Error(`recordSync: ${error.message}`);
}

export async function syncState(source: LotSource) {
  const {data,error}=await db().from(T.cursors).select('*').eq('source',source).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function getActiveCriteria(): Promise<Criteria[]> {
  const { data, error } = await db().from(T.criteria).select('*').eq('active', true);
  if (error) throw new Error(`getActiveCriteria: ${error.message}`);
  return (data ?? []) as Criteria[];
}

export async function insertMatches(pairs: { lot_id: string; criteria_id: string }[]): Promise<void> {
  if (pairs.length === 0) return;
  const { error } = await db()
    .from(T.matches)
    .upsert(pairs.map((p) => ({ ...p, notified: false })), {
      onConflict: 'lot_id,criteria_id',
      ignoreDuplicates: true,
    });
  if (error) throw new Error(`insertMatches: ${error.message}`);
}

export async function getUnnotifiedMatches(): Promise<
  { match_id: string; lot: any; criteria_name: string }[]
> {
  const { data, error } = await db()
    .from(T.matches)
    .select(`id, notified, ${T.lots}!inner(*), ${T.criteria}!inner(name,active)`)
    .eq('notified', false)
    .eq(`${T.lots}.is_active`,true).eq(`${T.lots}.hidden`,false).eq(`${T.criteria}.active`,true)
    .or(`bids_end.is.null,bids_end.gt.${new Date().toISOString()}`,{foreignTable:T.lots})
    .order('created_at').limit(200);
  if (error) throw new Error(`getUnnotifiedMatches: ${error.message}`);
  return (data ?? []).map((m: any) => ({
    match_id: m.id,
    lot: m[T.lots],
    criteria_name: m[T.criteria]?.name ?? '—',
  }));
}

export async function markNotified(matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;
  const { error } = await db().from(T.matches).update({ notified: true }).in('id', matchIds);
  if (error) throw new Error(`markNotified: ${error.message}`);
}

/** Лоти без координат (для геокодування): профільні активи, lat is null. */
export async function lotsMissingCoords(limit: number): Promise<
  { id: string; source: LotSource; title: string | null; address: string | null; region: string | null }[]
> {
  const { data, error } = await db()
    .from(T.lots)
    .select('id, source, title, address, region')
    .is('lat', null)
    .neq('asset_type', 'other')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`lotsMissingCoords: ${error.message}`);
  return (data ?? []) as any;
}

export async function saveCoords(id: string, lat: number, lng: number): Promise<void> {
  const { error } = await db().from(T.lots).update({ lat, lng }).eq('id', id);
  if (error) throw new Error(`saveCoords: ${error.message}`);
}

/** Кеш геокодування за текстом запиту (щоб не повторювати й берегти ліміт Nominatim). */
export async function getGeocodeCache(
  query: string
): Promise<{ lat: number | null; lng: number | null } | undefined> {
  const { data } = await db().from(T.geocode).select('lat, lng').eq('query', query).maybeSingle();
  return data ?? undefined;
}

export async function setGeocodeCache(query: string, lat: number | null, lng: number | null): Promise<void> {
  await db().from(T.geocode).upsert({ query, lat, lng }, { onConflict: 'query' });
}

export async function getCursor(source: LotSource): Promise<string | null> {
  const state=await syncState(source);
  return state?.cursor ?? null;
}

export async function setCursor(source: LotSource, cursor: string | null): Promise<void> {
  const { error } = await db()
    .from(T.cursors)
    .upsert({ source, cursor, last_run: new Date().toISOString() }, { onConflict: 'source' });
  if (error) throw new Error(`setCursor: ${error.message}`);
}
