// Конфіг Mapbox для аукціон-мапи. Токен — публічний (pk.*), тому читається на
// клієнті через NEXT_PUBLIC_. Дані по всій Україні → центр і зум країни, а не міста.

export type MapboxBaseStyle = 'streets' | 'satellite';

export const mapboxStyleUrls = {
  // Супутник із підписами вулиць/міст (обов'язковий вид за замовчуванням).
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  streets: 'mapbox://styles/mapbox/streets-v12',
} as const satisfies Record<MapboxBaseStyle, string>;

// Користувач вимагав супутник за замовчуванням.
export const defaultMapboxBaseStyle: MapboxBaseStyle = 'satellite';

// Центр України (приблизно) і зум, щоб влізла вся країна.
export const mapboxInitialCenter: [number, number] = [31.2, 48.8];
export const mapboxInitialZoom = 5.4;

// Межі України для fitBounds/maxBounds (SW, NE), із запасом.
export const ukraineBounds: [[number, number], [number, number]] = [
  [21.5, 43.5],
  [40.5, 52.7],
];

function isPlaceholder(token: string): boolean {
  const t = token.toLowerCase();
  return (
    t.includes('replace') ||
    t.includes('your-') ||
    t.includes('placeholder') ||
    t.includes('example')
  );
}

/** Валідний публічний токен Mapbox або null (тоді мапа показує підказку). */
export function getMapboxToken(): string | null {
  const raw = (process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '').trim();
  if (!raw || !raw.startsWith('pk.') || raw.length < 20 || isPlaceholder(raw)) {
    return null;
  }
  return raw;
}
