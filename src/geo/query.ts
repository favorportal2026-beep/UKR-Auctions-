/** Побудова запитів на геокодування з тексту адреси. */
export interface GeoLot {
  source: string;
  title?: string | null;
  address?: string | null;
  region?: string | null;
}

export interface GeoQuery {
  freeform: string; // повний очищений запит (вулиця + номер + місто + область)
  cityForm: string; // запасний: лише місто/область (рівень населеного пункту)
}

// Шумові фрагменти, що заважають геокодеру.
const NOISE = [
  /предмет іпотеки[:.]?/gi, /іпотека[:.]?/gi, /добровільний продаж[:.]?/gi,
  /голландський аукціон[:.]?/gi, /за адресою[:]?/gi, /що знаходиться/gi,
  /яка розташована на/gi, /загальною площею[^,]*/gi, /житлов[ао]ю? площ[аеіую][^,]*/gi,
  /заг\.?\s*пл\.?[^,]*/gi, /кадастровий номер[^,]*/gi, /к[\/.]?\s*н\.?[:.]?\s*[\d:]+/gi,
  /кн[:.]?\s*[\d:]+/gi, /площею[^,]*/gi, /квартира\s*№?\s*[\d\-/]+/gi, /кв\.?\s*[\d\-/]+/gi,
  /будинок/gi, /буд\.?/gi, /\bб\.\s*/gi, /\d+[,\s]*поверх[^,]*/gi,
];

const CITY_RE =
  /(?:^|[,\s])(?:м\.?|місто|смт\.?|с\.|село|с-?ще|селище)\s*([А-ЯІЇЄҐ][А-Яа-яІіЇїЄєҐґ'’\-]{2,})/;
const SKIP_PART = /(область|обл\.?|район|р-н|громад|міськрад|сільрад|н24|н-24|поза населеним)/i;

function clean(s: string): string {
  let t = ` ${s} `;
  for (const re of NOISE) t = t.replace(re, ' ');
  return t.replace(/\s{2,}/g, ' ').replace(/(\s*,\s*)+/g, ', ').replace(/^[\s,]+|[\s,]+$/g, '').trim();
}

function addressText(lot: GeoLot): string {
  if (lot.source === 'setam') {
    const t = lot.title ?? '';
    const m = t.match(/за адресою[:\s]+(.+)$/i);
    return (m ? m[1] : (lot.address && lot.address !== lot.region ? lot.address : t)) || lot.region || '';
  }
  return lot.address ?? lot.title ?? lot.region ?? '';
}

/** Місто: спершу за префіксом (м./с./смт), інакше — перша «не-область» кома-частина. */
function guessCity(raw: string, region: string | null): string | undefined {
  const m = raw.match(CITY_RE);
  if (m) return m[1];
  for (const part of raw.split(',').map((s) => s.trim())) {
    if (!part || SKIP_PART.test(part)) continue;
    if (/(вул|вулиц|просп|проспект|пров|провул|бульвар|набережн|шосе|площ)/i.test(part)) continue;
    if (/[А-ЯІЇЄҐ][а-яіїєґ']{2,}/.test(part) && !/\d/.test(part)) return part;
  }
  return region ? region.replace(/\s*(область|обл\.?)/i, '').trim() : undefined;
}

export function buildGeoQuery(lot: GeoLot): GeoQuery {
  const raw = addressText(lot);
  const cleaned = clean(raw);
  const oblast = lot.region ?? '';
  const city = guessCity(raw, lot.region ?? null);
  return {
    freeform: [cleaned, 'Україна'].filter(Boolean).join(', '),
    cityForm: [city, oblast, 'Україна'].filter(Boolean).join(', '),
  };
}
