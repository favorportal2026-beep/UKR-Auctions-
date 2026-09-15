// Груба геолокація лота за областю (точних координат у джерелах немає).
// Маркер ставимо в центр області + детермінований джитер, щоб не злипались.

type Centroid = { stem: string; c: [number, number] };

// Центри областей України (approx). Порядок важливий: місто Київ перевіряємо
// окремо перед областю.
const OBLASTS: Centroid[] = [
  { stem: 'вінниц', c: [49.23, 28.47] },
  { stem: 'волин', c: [50.75, 25.32] },
  { stem: 'луцьк', c: [50.75, 25.32] },
  { stem: 'дніпро', c: [48.46, 35.04] },
  { stem: 'донец', c: [48.02, 37.8] },
  { stem: 'житомир', c: [50.25, 28.66] },
  { stem: 'закарпат', c: [48.62, 22.29] },
  { stem: 'ужгород', c: [48.62, 22.29] },
  { stem: 'запор', c: [47.84, 35.14] },
  { stem: 'франків', c: [48.92, 24.71] },
  { stem: 'кіровоград', c: [48.51, 32.26] },
  { stem: 'кропивниц', c: [48.51, 32.26] },
  { stem: 'луган', c: [48.57, 39.31] },
  { stem: 'львів', c: [49.84, 24.03] },
  { stem: 'миколаїв', c: [46.98, 31.99] },
  { stem: 'одес', c: [46.48, 30.72] },
  { stem: 'полтав', c: [49.59, 34.55] },
  { stem: 'рівн', c: [50.62, 26.25] },
  { stem: 'сум', c: [50.91, 34.8] },
  { stem: 'тернопіл', c: [49.55, 25.59] },
  { stem: 'харків', c: [49.99, 36.23] },
  { stem: 'херсон', c: [46.64, 32.61] },
  { stem: 'хмельниц', c: [49.42, 26.98] },
  { stem: 'черкас', c: [49.44, 32.06] },
  { stem: 'чернівец', c: [48.29, 25.94] },
  { stem: 'чернігів', c: [51.49, 31.29] },
  { stem: 'севастопол', c: [44.62, 33.53] },
  { stem: 'крим', c: [44.95, 34.1] },
  { stem: 'сімферопол', c: [44.95, 34.1] },
];

const KYIV_CITY: [number, number] = [50.4501, 30.5234];
const KYIV_OBLAST: [number, number] = [50.05, 30.76];

/** Центр області за рядком region/address. null — якщо не розпізнали. */
export function regionCentroid(region: string | null, address?: string | null): [number, number] | null {
  const h = `${region ?? ''} ${address ?? ''}`.toLowerCase();
  if (!h.trim()) return null;
  // Київ: місто vs область
  if (h.includes('київськ')) return KYIV_OBLAST;
  if (h.includes('київ')) return KYIV_CITY;
  for (const o of OBLASTS) if (h.includes(o.stem)) return o.c;
  return null;
}

/** Детермінований джитер (±~0.22°) за id, щоб маркери в одній області не злипались. */
export function jitter(id: string): [number, number] {
  let x = 0;
  for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0;
  const a = ((x % 1000) / 1000 - 0.5) * 0.44;
  const b = (((Math.floor(x / 1000)) % 1000) / 1000 - 0.5) * 0.44;
  return [a, b];
}

/** Координати маркера лота (центр області + джитер) або null. */
export function lotPoint(
  lot: { id: string; region: string | null; address?: string | null; lat: number | null; lng: number | null }
): [number, number] | null {
  if (lot.lat != null && lot.lng != null) return [lot.lat, lot.lng];
  const c = regionCentroid(lot.region, lot.address ?? null);
  if (!c) return null;
  const [da, db] = jitter(lot.id);
  return [c[0] + da, c[1] + db];
}
