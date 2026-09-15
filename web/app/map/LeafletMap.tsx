'use client';

import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  priceLabel: string;
  region: string | null;
  asset: string;
  url: string | null;
  approx: boolean;
};

function dotIcon(asset: string) {
  const color = asset === 'land' ? '#2f9e6a' : asset === 'real_estate' ? '#2b5c9b' : '#8a8a80';
  return L.divIcon({
    className: 'lot-pin',
    html: `<span style="background:${color}"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export default function LeafletMap({ points }: { points: MapPoint[] }) {
  return (
    <MapContainer center={[48.8, 31.2]} zoom={6} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={dotIcon(p.asset)}>
          <Popup>
            <div style={{ minWidth: 180 }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>{p.priceLabel}</div>
              <div style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 6 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                {p.region ?? '—'}{p.approx ? ' · орієнтовно (центр області)' : ''}
              </div>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 600 }}>
                  Відкрити лот ↗
                </a>
              ) : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
