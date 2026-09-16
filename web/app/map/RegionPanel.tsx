'use client';

import { useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { foldSearchText } from '@/lib/search/searchFold';

export type RegionItem = { stem: string; name: string; count: number };

export default function RegionPanel({
  items,
  selected,
}: {
  items: RegionItem[];
  selected: string | null;
}) {
  const [q, setQ] = useState('');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filtered = useMemo(() => {
    const f = foldSearchText(q);
    const base = items
      .filter((it) => it.count > 0 || it.stem === selected)
      .sort((a, b) => b.count - a.count);
    if (!f) return base;
    return base.filter((it) => foldSearchText(it.name).includes(f));
  }, [items, q, selected]);

  function pick(stem: string) {
    const params = new URLSearchParams(searchParams.toString());
    if ((params.get('region') || '') === stem) params.delete('region');
    else params.set('region', stem);
    const s = params.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  function clear() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('region');
    const s = params.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  return (
    <div className="region-panel">
      <div className="region-panel-head">
        <span className="region-panel-title">Області</span>
        {selected ? (
          <button type="button" className="region-clear" onClick={clear}>
            Очистити ✕
          </button>
        ) : null}
      </div>
      <input
        className="region-search"
        placeholder="Пошук області…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="region-chips">
        {filtered.map((it) => (
          <button
            key={it.stem}
            type="button"
            className={`region-chip${it.stem === selected ? ' active' : ''}`}
            onClick={() => pick(it.stem)}
            title={it.name}
          >
            <span className="region-chip-name">{it.name}</span>
            <span className="region-chip-count">{it.count}</span>
          </button>
        ))}
        {filtered.length === 0 ? <span className="muted">нічого не знайдено</span> : null}
      </div>
    </div>
  );
}
