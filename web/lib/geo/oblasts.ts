import { foldSearchText } from '@/lib/search/searchFold';

// 27 адмінодиниць. stem — те, що йде у фільтр ?region= та влучає в lots.region
// через ilike (матчить «…область» і «…обл.»); name — підпис у панелі.
export type Oblast = { stem: string; name: string };

export const OBLASTS: Oblast[] = [
  { stem: 'Вінницька', name: 'Вінницька' },
  { stem: 'Волинська', name: 'Волинська' },
  { stem: 'Дніпропетровська', name: 'Дніпропетровська' },
  { stem: 'Донецька', name: 'Донецька' },
  { stem: 'Житомирська', name: 'Житомирська' },
  { stem: 'Закарпатська', name: 'Закарпатська' },
  { stem: 'Запорізька', name: 'Запорізька' },
  { stem: 'Івано-Франківська', name: 'Івано-Франківська' },
  { stem: 'Київська', name: 'Київська' },
  { stem: 'Кіровоградська', name: 'Кіровоградська' },
  { stem: 'Луганська', name: 'Луганська' },
  { stem: 'Львівська', name: 'Львівська' },
  { stem: 'Миколаївська', name: 'Миколаївська' },
  { stem: 'Одеська', name: 'Одеська' },
  { stem: 'Полтавська', name: 'Полтавська' },
  { stem: 'Рівненська', name: 'Рівненська' },
  { stem: 'Сумська', name: 'Сумська' },
  { stem: 'Тернопільська', name: 'Тернопільська' },
  { stem: 'Харківська', name: 'Харківська' },
  { stem: 'Херсонська', name: 'Херсонська' },
  { stem: 'Хмельницька', name: 'Хмельницька' },
  { stem: 'Черкаська', name: 'Черкаська' },
  { stem: 'Чернівецька', name: 'Чернівецька' },
  { stem: 'Чернігівська', name: 'Чернігівська' },
  { stem: 'Київ', name: 'м. Київ' },
  { stem: 'Севастополь', name: 'м. Севастополь' },
  { stem: 'Крим', name: 'АР Крим' },
];

// Стеми, відсортовані від найдовшого — щоб «Київська» матчилось раніше за «Київ».
const STEMS_BY_LEN = [...OBLASTS].sort(
  (a, b) => foldSearchText(b.stem).length - foldSearchText(a.stem).length,
);

/** Зводить «сире» region лота ("Львівська обл."/"м.Київ") до стему області. */
export function normalizeRegion(raw: string | null | undefined): string | null {
  const f = foldSearchText(raw);
  if (!f) return null;
  for (const o of STEMS_BY_LEN) {
    if (f.includes(foldSearchText(o.stem))) return o.stem;
  }
  return null;
}
