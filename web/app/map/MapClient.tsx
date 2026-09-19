'use client';

import dynamic from 'next/dynamic';
import type { MapPoint } from './MapboxMap';

// Mapbox GL потребує window — вантажимо лише на клієнті (без SSR).
const MapboxMap = dynamic(() => import('./MapboxMap'), {
  ssr: false,
  loading: () => <div className="map-loading">Завантаження мапи…</div>,
});

export default function MapClient({
  points,
  token,
  selectedRegion,
  focusId,
}: {
  points: MapPoint[];
  token: string | null;
  selectedRegion?: string | null;
  focusId?: string | null;
}) {
  return <MapboxMap points={points} token={token} selectedRegion={selectedRegion} focusId={focusId} />;
}
