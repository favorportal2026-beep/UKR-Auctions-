'use client';

import dynamic from 'next/dynamic';
import type { MapPoint } from './LeafletMap';

// Leaflet потребує window — вантажимо лише на клієнті (без SSR).
const LeafletMap = dynamic(() => import('./LeafletMap'), {
  ssr: false,
  loading: () => <div className="map-loading">Завантаження мапи…</div>,
});

export default function MapClient({ points }: { points: MapPoint[] }) {
  return <LeafletMap points={points} />;
}
