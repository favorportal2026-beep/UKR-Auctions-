'use server';

import { revalidatePath } from 'next/cache';
import { requireAccess } from '@/lib/auth';
import { db } from '@/lib/supabase';
import { money } from '@/lib/format';

export async function loadCuration(id: string) {
  requireAccess();
  const client = db();
  const [{data,error},{data:curation,error:curationError}] = await Promise.all([
    client.from('lots').select('id,title,current_price,start_price,currency,region,image_url,lot_url,cadastral_number').eq('id',id).single(),
    client.from('lot_curation').select('status,note').eq('lot_id',id).maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  if (curationError) throw new Error(curationError.message);
  return {id:data.id,title:data.title ?? 'Без назви',priceLabel:money(data.current_price ?? data.start_price,data.currency ?? 'UAH'),
    region:data.region,image:data.image_url,url:data.lot_url,cadastral:data.cadastral_number,
    status:curation?.status ?? '',note:curation?.note ?? ''};
}

/** Зберегти курацію об'єкта: статус (review/shortlist/bidding/'') + нотатку. */
export async function saveCuration(input: { lot_id: string; status: string; note: string }) {
  requireAccess();
  const lot_id = String(input.lot_id ?? '');
  if (!lot_id) return;
  const status = input.status ? String(input.status) : null;
  if (status && !['review','shortlist','bidding'].includes(status)) throw new Error('Невідомий статус');
  if (String(input.note ?? '').length > 20000) throw new Error('Нотатка надто довга');
  const note = input.note ? String(input.note) : null;
  const { error } = await db()
    .from('lot_curation')
    .upsert({ lot_id, status, note, updated_at: new Date().toISOString() }, { onConflict: 'lot_id' });
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/map');
  revalidatePath('/lots/[id]','page');
}

export async function hideLot(formData: FormData) {
  requireAccess();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const { error } = await db().from('lots').update({ hidden: true }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/map');
  revalidatePath('/lots/[id]','page');
}

export async function unhideLot(formData: FormData) {
  requireAccess();
  const id = String(formData.get('id') ?? '');
  if (!id) return;
  const { error } = await db().from('lots').update({ hidden: false }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/map');
  revalidatePath('/lots/[id]','page');
}

/**
 * Перерахувати збіги для ВСІХ лотів за поточними активними критеріями.
 * Додає нові пари, прибирає застарілі; зберігає стан notified для наявних.
 * Потрібно після редагування критеріїв (колектор матчить лише нові/змінені лоти).
 */
export async function rematchAll() {
  requireAccess();
  const {error} = await db().rpc('ua_rematch_lots');
  if (error) throw new Error(error.message);
  revalidatePath('/');
  revalidatePath('/map');
  revalidatePath('/lots/[id]','page');
  revalidatePath('/criteria');
}
