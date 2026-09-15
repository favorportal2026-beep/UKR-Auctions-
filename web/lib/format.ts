// Хелпери форматування (українська локаль).

export function money(v: number | null, currency = 'UAH'): string {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('uk-UA', {
      style: 'currency',
      currency: currency || 'UAH',
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${Math.round(v).toLocaleString('uk-UA')} ${currency}`;
  }
}

export function area(v: number | null): string {
  if (v == null) return '—';
  if (v >= 10_000) return `${(v / 10_000).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} га`;
  return `${v.toLocaleString('uk-UA', { maximumFractionDigits: 1 })} м²`;
}

export function dateShort(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

/** Дисконт стартова/оцінка у відсотках, напр. 0.7 → "-30%". null якщо оцінки немає. */
export function discountLabel(price: number | null, valuation: number | null): string | null {
  if (price == null || valuation == null || valuation <= 0) return null;
  const ratio = price / valuation;
  const off = Math.round((1 - ratio) * 100);
  if (off <= 0) return null;
  return `-${off}% від оцінки`;
}

export const ASSET_LABEL: Record<string, string> = {
  real_estate: 'Нерухомість',
  land: 'Земля',
  other: 'Інше',
};

export const SOURCE_LABEL: Record<string, string> = {
  prozorro: 'Prozorro.Sale',
  setam: 'СЕТАМ',
};
