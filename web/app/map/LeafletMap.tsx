'use client';

import { LayersControl, MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  priceLabel: string;
  pill: string;
  source: string;
  region: string | null;
  asset: string;
  url: string | null;
  approx: boolean;
};

// Маркер-«цінник» (як у референсі): плашка з ціною + хвостик + бейдж джерела.
function priceIcon(p: MapPoint) {
  const cls = p.asset === 'land' ? 'c-land' : p.asset === 'real_estate' ? 'c-realty' : 'c-other';
  const badge = p.source === 'prozorro' ? 'P' : 'С';
  const dim = p.approx ? ' pt-approx' : '';
  return L.divIcon({
    className: 'price-pin',
    html:
      `<div class="price-tag ${cls}${dim}">` +
      `<span class="pt-badge">${badge}</span>` +
      `<span class="pt-price">${p.pill}</span>` +
      `</div>`,
  });
}

const ESRI_IMAGERY =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const ESRI_LABELS =
  'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}';

export default function LeafletMap({ points }: { points: MapPoint[] }) {
  return (
    <MapContainer center={[48.8, 31.2]} zoom={6} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
      <LayersControl position="topright">
        <LayersControl.BaseLayer checked name="Супутник">
          <TileLayer url={ESRI_IMAGERY} attribution="Tiles &copy; Esri, Maxar, Earthstar Geographics" maxZoom={19} />
        </LayersControl.BaseLayer>
        <LayersControl.BaseLayer name="Схема (OSM)">
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            maxZoom={19}
          />
        </LayersControl.BaseLayer>
        <LayersControl.Overlay checked name="Підписи (вулиці/міста)">
          <TileLayer url={ESRI_LABELS} maxZoom={19} />
        </LayersControl.Overlay>
      </LayersControl>

      {points.map((p) => (
        <Marker key={p.id} position={[p.lat, p.lng]} icon={priceIcon(p)}>
          <Popup>
            <div style={{ minWidth: 190 }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 4 }}>{p.priceLabel}</div>
              <div style={{ fontSize: 13, lineHeight: 1.35, marginBottom: 6 }}>{p.title}</div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 6 }}>
                {p.region ?? '—'}
                {p.approx ? ' · орієнтовно (центр області)' : ''}
              </div>
              {p.url ? (
                <a href={p.url} target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700 }}>
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
