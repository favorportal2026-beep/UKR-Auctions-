'use client';

import { useEffect, useState } from 'react';
import { money, area, dateShort, ASSET_LABEL } from '@/lib/format';
import { SUBTYPE_LABEL } from '@/lib/filters';

export type LotCard = {
  id: string;
  title: string;
  price: number | null;
  currency: string;
  region: string | null;
  area_sqm: number | null;
  asset: string;
  subtype: string | null;
  source: string;
  url: string | null;
  bids_end: string | null;
  lat: number | null;
  lng: number | null;
};

type View = 'grid' | 'list';
const LS_KEY = 'ua-results-view';

function assetClass(asset: string): string {
  return asset === 'land' ? 'c-land' : asset === 'real_estate' ? 'c-realty' : 'c-other';
}

// Показати лот на мапі: подія, яку слухає MapboxMap (flyTo + попап).
function focusLot(c: LotCard) {
  if (c.lat == null || c.lng == null) return;
  window.dispatchEvent(
    new CustomEvent('favor-focus-lot', {
      detail: {
        lat: c.lat,
        lng: c.lng,
        title: c.title,
        priceLabel: money(c.price, c.currency),
        region: c.region,
        url: c.url,
      },
    }),
  );
}

export default function ResultsPanel({ lots }: { lots: LotCard[] }) {
  const [view, setView] = useState<View>('list');

  useEffect(() => {
    try {
      const v = localStorage.getItem(LS_KEY);
      if (v === 'grid' || v === 'list') setView(v);
    } catch {
      /* ignore */
    }
  }, []);

  function setViewPersist(v: View) {
    setView(v);
    try {
      localStorage.setItem(LS_KEY, v);
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className="results-panel">
      <div className="results-head">
        <span className="results-count">Знайдено {lots.length}</span>
        <div className="view-toggle" role="group" aria-label="Вигляд">
          <button
            type="button"
            className={view === 'list' ? 'active' : ''}
            onClick={() => setViewPersist('list')}
            aria-pressed={view === 'list'}
            title="Список"
          >
            ☰ Список
          </button>
          <button
            type="button"
            className={view === 'grid' ? 'active' : ''}
            onClick={() => setViewPersist('grid')}
            aria-pressed={view === 'grid'}
            title="Сітка"
          >
            ▦ Сітка
          </button>
        </div>
      </div>

      <div className={`results-list ${view}`}>
        {lots.map((c) => (
          <article key={c.id} className={`lot-card ${assetClass(c.asset)}`}>
            <div className="lot-card-body">
              <div className="lot-price">{money(c.price, c.currency)}</div>
              <div className="lot-title">{c.title || 'Без назви'}</div>
              <div className="lot-meta">
                <span>{c.region ?? '—'}</span>
                {c.area_sqm != null ? <span>· {area(c.area_sqm)}</span> : null}
              </div>
              <div className="lot-tags">
                <span className="lot-tag">{c.source === 'prozorro' ? 'Prozorro' : 'СЕТАМ'}</span>
                <span className="lot-tag">
                  {c.subtype ? SUBTYPE_LABEL[c.subtype] ?? c.subtype : ASSET_LABEL[c.asset] ?? c.asset}
                </span>
                {c.bids_end ? <span className="lot-tag">до {dateShort(c.bids_end)}</span> : null}
              </div>
              <div className="lot-actions">
                <button
                  type="button"
                  className="lot-btn"
                  onClick={() => focusLot(c)}
                  disabled={c.lat == null || c.lng == null}
                >
                  На мапі
                </button>
                {c.url ? (
                  <a className="lot-btn primary" href={c.url} target="_blank" rel="noreferrer">
                    Відкрити лот ↗
                  </a>
                ) : null}
              </div>
            </div>
          </article>
        ))}
        {lots.length === 0 ? <div className="muted" style={{ padding: 12 }}>Немає лотів за фільтрами.</div> : null}
      </div>
    </aside>
  );
}
