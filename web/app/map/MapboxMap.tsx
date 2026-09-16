'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import {
  defaultMapboxBaseStyle,
  mapboxInitialCenter,
  mapboxInitialZoom,
  mapboxStyleUrls,
  ukraineBounds,
  type MapboxBaseStyle,
} from '@/lib/mapbox/config';

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  priceLabel: string; // повна ціна для попапа
  pill: string; // компактна ціна для плашки (₴96k)
  source: string;
  region: string | null;
  asset: string;
  url: string | null;
  approx: boolean;
};

const SOURCE_ID = 'lots';
const CLUSTER_LAYER = 'favor-clusters';
const CLUSTER_COUNT_LAYER = 'favor-cluster-count';
const UNCLUSTERED_HIT = 'favor-unclustered'; // невидимий шар-«ціль» для sync DOM-плашок

// Шар полігонів областей (клік = фільтр по region).
const OBLAST_SOURCE = 'favor-oblasts';
const OBLAST_FILL = 'favor-oblast-fill';
const OBLAST_LINE = 'favor-oblast-line';
const OBLAST_GEOJSON_URL = '/geo/ua-oblasts.geojson';
const GOLD = '#c8991f';

function oblastFillColor(selected: string | null) {
  if (!selected) return '#1f6f4a' as unknown as string;
  return ['case', ['==', ['get', 'region'], selected], GOLD, '#1f6f4a'] as unknown as string;
}
function oblastFillOpacity(selected: string | null) {
  if (!selected) return 0.06 as unknown as number;
  return ['case', ['==', ['get', 'region'], selected], 0.32, 0.05] as unknown as number;
}
function oblastLineWidth(selected: string | null) {
  if (!selected) return 0.8 as unknown as number;
  return ['case', ['==', ['get', 'region'], selected], 2.6, 0.8] as unknown as number;
}

// Кольори за типом активу (ті самі, що на дашборді/легенді).
const COLOR_LAND = '#1f8f5a';
const COLOR_REALTY = '#e8620c';
const COLOR_OTHER = '#6b6a63';

function assetClass(asset: string): string {
  return asset === 'land' ? 'c-land' : asset === 'real_estate' ? 'c-realty' : 'c-other';
}

function toFeatureCollection(points: MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
      .map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
        properties: {
          id: p.id,
          title: p.title,
          priceLabel: p.priceLabel,
          pill: p.pill,
          source: p.source,
          region: p.region,
          asset: p.asset,
          url: p.url,
          approx: p.approx ? 1 : 0,
        },
      })),
  };
}

function popupHtml(p: {
  priceLabel: string;
  title: string;
  region: string | null;
  approx: number;
  url: string | null;
}): string {
  const region = p.region ?? '—';
  const approx = p.approx ? ' · орієнтовно (центр області)' : '';
  const link = p.url
    ? `<a href="${p.url}" target="_blank" rel="noreferrer" style="font-size:13px;font-weight:700;color:#1f6f4a">Відкрити лот ↗</a>`
    : '';
  return (
    `<div style="min-width:190px">` +
    `<div style="font-weight:800;font-size:15px;margin-bottom:4px">${p.priceLabel}</div>` +
    `<div style="font-size:13px;line-height:1.35;margin-bottom:6px">${p.title}</div>` +
    `<div style="font-size:12px;color:#666;margin-bottom:6px">${region}${approx}</div>` +
    link +
    `</div>`
  );
}

export default function MapboxMap({
  points,
  token,
  selectedRegion = null,
}: {
  points: MapPoint[];
  token: string | null;
  selectedRegion?: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const pointsRef = useRef<MapPoint[]>(points);
  const oblastsRef = useRef<GeoJSON.FeatureCollection | null>(null);
  const selectedRegionRef = useRef<string | null>(selectedRegion);
  const [style, setStyle] = useState<MapboxBaseStyle>(defaultMapboxBaseStyle);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  pointsRef.current = points;
  selectedRegionRef.current = selectedRegion;

  // Клік по області → виставити/зняти фільтр region (зберігаючи решту фільтрів).
  function toggleRegion(region: string) {
    const params = new URLSearchParams(searchParams.toString());
    if ((params.get('region') || '') === region) {
      params.delete('region');
    } else {
      params.set('region', region);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Ініціалізація мапи (один раз).
  useEffect(() => {
    if (!token || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapboxStyleUrls[defaultMapboxBaseStyle],
      center: mapboxInitialCenter,
      zoom: mapboxInitialZoom,
      maxBounds: [
        [ukraineBounds[0][0] - 3, ukraineBounds[0][1] - 3],
        [ukraineBounds[1][0] + 3, ukraineBounds[1][1] + 3],
      ],
      attributionControl: true,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');

    map.on('load', () => {
      addOblastLayer(map);
      addLotsLayers(map);
    });
    // Після зміни базового стилю шари треба додати знову.
    map.on('style.load', () => {
      addOblastLayer(map);
      addLotsLayers(map);
    });
    map.on('render', () => syncMarkers(map));
    map.on('moveend', () => syncMarkers(map));

    // Полігони областей — статичний ассет; тягнемо один раз.
    fetch(OBLAST_GEOJSON_URL)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: GeoJSON.FeatureCollection | null) => {
        if (!data) return;
        oblastsRef.current = data;
        if (mapRef.current) addOblastLayer(mapRef.current);
      })
      .catch(() => {});

    return () => {
      markersRef.current.forEach((m) => m.remove());
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Перемикання базового стилю (супутник ↔ вулиці).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (map.isStyleLoaded()) {
      map.setStyle(mapboxStyleUrls[style]);
    } else {
      map.once('idle', () => map.setStyle(mapboxStyleUrls[style]));
    }
  }, [style]);

  // Оновлення даних джерела при зміні набору точок.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
    if (src) {
      src.setData(toFeatureCollection(points));
      syncMarkers(map);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points]);

  // Перемалювати підсвітку вибраної області.
  useEffect(() => {
    const map = mapRef.current;
    if (map) repaintOblasts(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRegion]);

  // Полігони областей: заливка (клік = фільтр) + обведення. Під кластерами.
  function addOblastLayer(map: mapboxgl.Map) {
    const data = oblastsRef.current;
    if (!data || !map.isStyleLoaded()) return;
    const sel = selectedRegionRef.current;
    if (!map.getSource(OBLAST_SOURCE)) {
      map.addSource(OBLAST_SOURCE, { type: 'geojson', data });
    }
    // Полігони мають бути ПІД кластерами лотів (щоб не перекривали й не крали кліки).
    const below = map.getLayer(CLUSTER_LAYER) ? CLUSTER_LAYER : undefined;
    if (!map.getLayer(OBLAST_FILL)) {
      map.addLayer(
        {
          id: OBLAST_FILL,
          type: 'fill',
          source: OBLAST_SOURCE,
          paint: { 'fill-color': oblastFillColor(sel), 'fill-opacity': oblastFillOpacity(sel) },
        },
        below,
      );
    }
    if (!map.getLayer(OBLAST_LINE)) {
      map.addLayer(
        {
          id: OBLAST_LINE,
          type: 'line',
          source: OBLAST_SOURCE,
          paint: { 'line-color': '#ffffff', 'line-opacity': 0.55, 'line-width': oblastLineWidth(sel) },
        },
        below,
      );
    }
    map.on('click', OBLAST_FILL, (e) => {
      // Якщо під курсором кластер — хай виграє він (зум), а не фільтр області.
      if (
        map.getLayer(CLUSTER_LAYER) &&
        map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] }).length > 0
      ) {
        return;
      }
      const region = e.features?.[0]?.properties?.region;
      if (typeof region === 'string' && region) toggleRegion(region);
    });
    map.on('mouseenter', OBLAST_FILL, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', OBLAST_FILL, () => (map.getCanvas().style.cursor = ''));
  }

  function repaintOblasts(map: mapboxgl.Map) {
    if (!map.getLayer(OBLAST_FILL)) return;
    const sel = selectedRegionRef.current;
    map.setPaintProperty(OBLAST_FILL, 'fill-color', oblastFillColor(sel));
    map.setPaintProperty(OBLAST_FILL, 'fill-opacity', oblastFillOpacity(sel));
    map.setPaintProperty(OBLAST_LINE, 'line-width', oblastLineWidth(sel));
  }

  function addLotsLayers(map: mapboxgl.Map) {
    if (!map.getSource(SOURCE_ID)) {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: toFeatureCollection(pointsRef.current),
        cluster: true,
        clusterRadius: 52,
        clusterMaxZoom: 13,
      });
    }
    if (!map.getLayer(CLUSTER_LAYER)) {
      map.addLayer({
        id: CLUSTER_LAYER,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        paint: {
          'circle-color': '#1f6f4a',
          'circle-opacity': 0.9,
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 2,
          'circle-radius': ['step', ['get', 'point_count'], 16, 25, 20, 100, 26, 500, 34],
        },
      });
    }
    if (!map.getLayer(CLUSTER_COUNT_LAYER)) {
      map.addLayer({
        id: CLUSTER_COUNT_LAYER,
        type: 'symbol',
        source: SOURCE_ID,
        filter: ['has', 'point_count'],
        layout: {
          'text-field': ['get', 'point_count_abbreviated'],
          'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Bold'],
          'text-size': 13,
        },
        paint: { 'text-color': '#ffffff' },
      });
    }
    // Невидимий circle-шар для одиночних точок: сам маркер малюємо DOM-плашкою
    // (price-tag), але шар потрібен, щоб querySourceFeatures давав розкластеровані.
    if (!map.getLayer(UNCLUSTERED_HIT)) {
      map.addLayer({
        id: UNCLUSTERED_HIT,
        type: 'circle',
        source: SOURCE_ID,
        filter: ['!', ['has', 'point_count']],
        paint: { 'circle-radius': 0, 'circle-opacity': 0 },
      });
    }

    // Клік по кластеру → наблизити.
    map.on('click', CLUSTER_LAYER, (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] })[0];
      const clusterId = f?.properties?.cluster_id;
      const src = map.getSource(SOURCE_ID) as mapboxgl.GeoJSONSource;
      if (clusterId == null || !src) return;
      src.getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err || zoom == null) return;
        const geom = f.geometry as GeoJSON.Point;
        map.easeTo({ center: geom.coordinates as [number, number], zoom });
      });
    });
    map.on('mouseenter', CLUSTER_LAYER, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', CLUSTER_LAYER, () => (map.getCanvas().style.cursor = ''));

    syncMarkers(map);
  }

  // Синхронізує DOM-плашки-цінники з розкластерованими точками у в'юпорті.
  function syncMarkers(map: mapboxgl.Map) {
    if (!map.getLayer(UNCLUSTERED_HIT) || !map.isStyleLoaded()) return;
    const feats = map.querySourceFeatures(SOURCE_ID, {
      filter: ['!', ['has', 'point_count']],
    });
    const seen = new Set<string>();
    for (const f of feats) {
      const props = f.properties as Record<string, unknown>;
      const id = String(props.id ?? '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (markersRef.current.has(id)) continue;

      const geom = f.geometry as GeoJSON.Point;
      const el = document.createElement('div');
      const dim = Number(props.approx) ? ' pt-approx' : '';
      el.className = `price-tag ${assetClass(String(props.asset ?? ''))}${dim}`;
      const badge = String(props.source) === 'prozorro' ? 'P' : 'С';
      el.innerHTML =
        `<span class="pt-badge">${badge}</span><span class="pt-price">${String(props.pill ?? '')}</span>`;

      const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat(geom.coordinates as [number, number])
        .setPopup(
          new mapboxgl.Popup({ offset: 16, closeButton: false }).setHTML(
            popupHtml({
              priceLabel: String(props.priceLabel ?? ''),
              title: String(props.title ?? ''),
              region: (props.region as string) ?? null,
              approx: Number(props.approx) || 0,
              url: (props.url as string) ?? null,
            }),
          ),
        )
        .addTo(map);
      markersRef.current.set(id, marker);
    }
    // Прибрати плашки, яких уже немає у в'юпорті (згорнулись у кластер / поза екраном).
    for (const [id, marker] of markersRef.current) {
      if (!seen.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }
  }

  if (!token) {
    return (
      <div className="notice" style={{ margin: 16 }}>
        Мапа Mapbox не налаштована: додайте змінну оточення{' '}
        <code>NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN</code> (публічний токен, що починається з{' '}
        <code>pk.</code>) у Vercel → Settings → Environment Variables і зробіть Redeploy.
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', height: '100%', width: '100%' }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      <div className="map-style-switch">
        <button
          type="button"
          className={style === 'satellite' ? 'active' : ''}
          onClick={() => setStyle('satellite')}
        >
          Супутник
        </button>
        <button
          type="button"
          className={style === 'streets' ? 'active' : ''}
          onClick={() => setStyle('streets')}
        >
          Схема
        </button>
      </div>
    </div>
  );
}
