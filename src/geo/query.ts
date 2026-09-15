/** Побудова запитів на геокодування з тексту адреси. */
export interface GeoLot {
  source: string;
  title?: string | null;
  address?: string | null;
  region?: string | null;
}

export interface GeoQuery {
  freeform: string; // основний запит: «Вулиця Номер, Місто»
  cityForm: string; // запасний: «Місто, Область» (рівень населеного пункту)
}

const CITY_RE =
  /(?:^|[,\s])(?:м\.?|місто|смт\.?|с\.|село|с-?ще|селище)\s*([А-ЯІЇЄҐ][А-Яа-яІіЇїЄєҐґ'’\-]{2,})/;
const SKIP_PART =
  /(область|обл\.?|район|р-?н|громад|міськрад|сільрад|н-?24|поза населеним|кадастр|№|\bга\b)/i;

// Вулиця з ТИПОМ-ПРЕФІКСОМ (вул./проспект/…): «<тип> Назва[, буд.] Номер».
const STREET_PREFIX =
  /(?:вулиця|вул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бульв\.?|площа|пл\.?|шосе|узвіз|проїзд|мікрорайон|м-?н)\s*\.?\s*([А-ЯІЇЄҐа-яіїєґ'’\.\s-]{2,40}?)\s*,?\s*(?:буд\.?|будинок|б\.)?\s*№?\s*(\d+[А-ЯІЇЄҐа-яіїєґ]?)/i;
// Вулиця з ТИПОМ-СУФІКСОМ (набережна/узвіз/проїзд): «Назва <тип> Номер».
const STREET_SUFFIX =
  /([А-ЯІЇЄҐ][А-ЯІЇЄҐа-яіїєґ'’-]+)\s+(набережна|узвіз|проїзд)\s*,?\s*(?:буд\.?|б\.)?\s*№?\s*(\d+[А-ЯІЇЄҐа-яіїєґ]?)/i;
// Prozorro інколи дає НОМЕР перед вулицею: «…, 9, вулиця Словацького, …».
const STREET_NUMFIRST =
  /(\d+[А-ЯІЇЄҐа-яіїєґ]?)\s*,\s*(?:вулиця|вул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бульв\.?|площа|пл\.?|шосе)\s*\.?\s*([А-ЯІЇЄҐа-яіїєґ'’\.\s-]{2,40}?)(?:,|$)/i;

function tidy(s: string): string {
  return s.replace(/[.,]/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function streetPart(raw: string): string | null {
  const a = raw.match(STREET_PREFIX);
  if (a) return `${tidy(a[1]!)} ${a[2]}`.trim();
  const b = raw.match(STREET_SUFFIX);
  if (b) return `${tidy(b[1]!)} ${b[2]} ${b[3]}`.trim();
  const c = raw.match(STREET_NUMFIRST);
  if (c) return `${tidy(c[2]!)} ${c[1]}`.trim();
  return null;
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
    if (!part || SKIP_PART.test(part) || /\d/.test(part)) continue;
    if (/(вул|вулиц|просп|проспект|пров|провул|бульвар|набережн|шосе|площ|узвіз)/i.test(part)) continue;
    // місто одним/двома словами (враховуючи ВЕЛИКИМИ, напр. "ЛЬВІВ")
    if (/^[А-ЯІЇЄҐ][А-ЯІЇЄҐа-яіїєґ'’-]{2,}(?:\s+[А-ЯІЇЄҐ][А-ЯІЇЄҐа-яіїєґ'’-]{2,})?$/.test(part)) {
      return part.charAt(0) + part.slice(1).toLowerCase();
    }
  }
  return region ? region.replace(/\s*(область|обл\.?)/i, '').trim() : undefined;
}

export function buildGeoQuery(lot: GeoLot): GeoQuery {
  const raw = addressText(lot);
  const oblast = lot.region ?? '';
  const city = guessCity(raw, lot.region ?? null);
  const street = streetPart(raw);
  const cityForm = [city, oblast].filter(Boolean).join(', ') || 'Україна';
  const freeform = street && city ? `${street}, ${city}` : cityForm;
  return { freeform, cityForm };
}
