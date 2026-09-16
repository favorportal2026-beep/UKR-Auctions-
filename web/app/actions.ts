'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import { matchAll } from '@/lib/match';
import type { Criteria, Lot } from '@/lib/types';

/** Зберегти курацію об'єкта: статус (review/shortlist/bidding/'') + нотатку. */
export async function saveCuration(input: { lot_id: string; status: string; note: string }) {
  const lot_id = String(input.lot_id ?? '');
  if (!lot_id) return;
  const status = input.status ? String(input.status) : null;
  const note = input.note ? String(input.note) : null;
  const { error } = await db()
    .from('lot_curation')
    .upsert({ lot_id, status, note, updated_at: new Date().toISOString() }, { onConflict: 'lot_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/');
}

export async function hideLot(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const { error } = await db().from('lots').update({ hidden: true }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
}

export async function unhideLot(formData: FormData) {
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const { error } = await db().from('lots').update({ hidden: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
}

/**
 * Перерахувати збіги для ВСІХ лотів за поточними активними критеріями.
 * Додає нові пари, прибирає застарілі; зберігає стан notified для наявних.
 * Потрібно після редагування критеріїв (колектор матчить лише нові/змінені лоти).
 */
export async function rematchAll() {
  const sb = db();
  const [{ data: lots }, { data: criteria }, { data: existing }] = await Promise.all([
    sb.from('lots').select('*'),
    sb.from('criteria').select('*'),
    sb.from('matches').select('id, lot_id, criteria_id'),
  ]);

  const lotsArr = (lots ?? []) as Lot[];
  const critArr = (criteria ?? []) as Criteria[];

  const desired = new Set<string>();
  const desiredPairs: { lot_id: string; criteria_id: string }[] = [];
  for (const lot of lotsArr) {
    for (const cid of matchAll(lot, critArr)) {
      const key = `${lot.id}:${cid}`;
      if (!desired.has(key)) {
        desired.add(key);
        desiredPairs.push({ lot_id: lot.id, criteria_id: cid });
      }
    }
  }

  const existingArr = (existing ?? []) as { id: string; lot_id: string; criteria_id: string }[];
  const existingKeys = new Set(existingArr.map((m) => `${m.lot_id}:${m.criteria_id}`));

  const toInsert = desiredPairs
    .filter((p) => !existingKeys.has(`${p.lot_id}:${p.criteria_id}`))
    .map((p) => ({ ...p, notified: false }));
  const toDelete = existingArr
    .filter((m) => !desired.has(`${m.lot_id}:${m.criteria_id}`))
    .map((m) => m.id);

  for (let i = 0; i < toInsert.length; i += 500) {
    const { error } = await sb.from('matches').upsert(toInsert.slice(i, i + 500), {
      onConflict: 'lot_id,criteria_id',
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
  }
  for (let i = 0; i < toDelete.length; i += 500) {
    const { error } = await sb.from('matches').delete().in('id', toDelete.slice(i, i + 500));
    if (error) throw new Error(error.message);
  }

  revalidatePath('/');
  revalidatePath('/criteria');
}
