'use client';

import { useState } from 'react';
import type { MapPoint } from './MapboxMap';

// Мобільний bottom-sheet зі списком лотів мапи. Тап по рядку → політ до піна
// (MapboxMap слухає подію favor-focus-lot). На десктопі прихований (CSS).
export default function MapBottomSheet({ points }: { points: MapPoint[] }) {
  const [open, setOpen] = useState(false);
  const list = points.slice(0, 300); // ліміт для плавності на телефоні

  function focus(p: MapPoint) {
    window.dispatchEvent(
      new CustomEvent('favor-focus-lot', {
        detail: { lat: p.lat, lng: p.lng, title: p.title, priceLabel: p.priceLabel, region: p.region, url: p.url },
      }),
    );
    setOpen(false); // згорнути, щоб побачити мапу
  }

  return (
    <div className={`map-sheet${open ? ' open' : ''}`}>
      <button type="button" className="map-sheet-head" onClick={() => setOpen((v) => !v)}>
        <span className="map-sheet-grip" />
        <span>{points.length} об'єктів на мапі</span>
        <span className="map-sheet-caret">{open ? '▼' : '▲'}</span>
      </button>
      <div className="map-sheet-list">
        {list.map((p) => (
          <button key={p.id} type="button" className="map-sheet-row" onClick={() => focus(p)}>
            <span className={`sheet-dot ${p.asset === 'land' ? 'c-land' : p.asset === 'real_estate' ? 'c-realty' : 'c-other'}`} />
            <span className="sheet-main">
              <span className="sheet-price">{p.priceLabel}</span>
              <span className="sheet-title">{p.title}</span>
              <span className="sheet-region">{p.region ?? '—'}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
