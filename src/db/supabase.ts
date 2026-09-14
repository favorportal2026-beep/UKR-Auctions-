import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config.js';
import type { Criteria, LotSource, NormalizedLot } from '../types.js';

let _client: SupabaseClient | null = null;

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
 * змінилась ціна/статус — саме їх варто перевіряти на збіги/сповіщення.
 */
export async function upsertLots(lots: NormalizedLot[]): Promise<{ id: string; lot: NormalizedLot; isNew: boolean }[]> {
  if (lots.length === 0) return [];
  const client = db();
  const changed: { id: string; lot: NormalizedLot; isNew: boolean }[] = [];

  // Дізнаємось, що вже є (щоб визначити new vs changed).
  const keys = lots.map((l) => l.source_id);
  const source = lots[0]!.source;
  const { data: existing } = await client
    .from('lots')
    .select('id, source_id, current_price, status')
    .eq('source', source)
    .in('source_id', keys);

  const prev = new Map((existing ?? []).map((r) => [r.source_id, r]));

  const now = new Date().toISOString();
  const payload = lots.map((l) => ({
    ...l,
    last_seen: now,
    updated_at: now,
  }));

  const { data, error } = await client
    .from('lots')
    .upsert(payload, { onConflict: 'source,source_id' })
    .select('id, source_id');

  if (error) throw new Error(`upsertLots: ${error.message}`);

  const idBySourceId = new Map((data ?? []).map((r) => [r.source_id, r.id]));

  for (const l of lots) {
    const before = prev.get(l.source_id);
    const id = idBySourceId.get(l.source_id);
    if (!id) continue;
    if (!before) {
      changed.push({ id, lot: l, isNew: true });
    } else if (before.current_price !== l.current_price || before.status !== l.status) {
      changed.push({ id, lot: l, isNew: false });
    }
  }
  return changed;
}

export async function getActiveCriteria(): Promise<Criteria[]> {
  const { data, error } = await db().from('criteria').select('*').eq('active', true);
  if (error) throw new Error(`getActiveCriteria: ${error.message}`);
  return (data ?? []) as Criteria[];
}

export async function insertMatches(pairs: { lot_id: string; criteria_id: string }[]): Promise<void> {
  if (pairs.length === 0) return;
  const { error } = await db()
    .from('matches')
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
    .from('matches')
    .select('id, notified, lots(*), criteria(name)')
    .eq('notified', false)
    .limit(200);
  if (error) throw new Error(`getUnnotifiedMatches: ${error.message}`);
  return (data ?? []).map((m: any) => ({
    match_id: m.id,
    lot: m.lots,
    criteria_name: m.criteria?.name ?? '—',
  }));
}

export async function markNotified(matchIds: string[]): Promise<void> {
  if (matchIds.length === 0) return;
  const { error } = await db().from('matches').update({ notified: true }).in('id', matchIds);
  if (error) throw new Error(`markNotified: ${error.message}`);
}

export async function getCursor(source: LotSource): Promise<string | null> {
  const { data } = await db().from('sync_state').select('cursor').eq('source', source).maybeSingle();
  return data?.cursor ?? null;
}

export async function setCursor(source: LotSource, cursor: string | null): Promise<void> {
  const { error } = await db()
    .from('sync_state')
    .upsert({ source, cursor, last_run: new Date().toISOString() }, { onConflict: 'source' });
  if (error) throw new Error(`setCursor: ${error.message}`);
}
