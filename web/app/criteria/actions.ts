'use server';

import { revalidatePath } from 'next/cache';
import { db } from '@/lib/supabase';
import type { AssetType } from '@/lib/types';

function arr(v: FormDataEntryValue | null): string[] {
  return String(v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
function n(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const x = Number(s);
  return isNaN(x) ? null : x;
}
function assetTypes(fd: FormData): AssetType[] {
  return fd.getAll('asset_types').map((x) => String(x)) as AssetType[];
}

function payload(fd: FormData) {
  return {
    name: String(fd.get('name') ?? '').trim() || 'Без назви',
    active: fd.get('active') != null,
    asset_types: assetTypes(fd),
    regions: arr(fd.get('regions')),
    selling_methods: arr(fd.get('selling_methods')),
    keywords: arr(fd.get('keywords')),
    price_min: n(fd.get('price_min')),
    price_max: n(fd.get('price_max')),
    area_min: n(fd.get('area_min')),
    area_max: n(fd.get('area_max')),
    max_price_to_valuation: n(fd.get('max_price_to_valuation')),
  };
}

export async function addCriterion(fd: FormData) {
  const { error } = await db().from('criteria').insert(payload(fd));
  if (error) throw new Error(error.message);
  revalidatePath('/criteria');
}

export async function updateCriterion(fd: FormData) {
  const id = String(fd.get('id') ?? '');
  if (!id) return;
  const { error } = await db().from('criteria').update(payload(fd)).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/criteria');
  revalidatePath('/');
}

export async function deleteCriterion(fd: FormData) {
  const id = String(fd.get('id') ?? '');
  if (!id) return;
  const { error } = await db().from('criteria').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/criteria');
  revalidatePath('/');
}

export async function toggleActive(fd: FormData) {
  const id = String(fd.get('id') ?? '');
  const active = fd.get('active') === '1';
  if (!id) return;
  const { error } = await db().from('criteria').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/criteria');
  revalidatePath('/');
}
