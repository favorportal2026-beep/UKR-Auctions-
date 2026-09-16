import { db } from '@/lib/supabase';
import type { Criteria, Lot } from '@/lib/types';
import { money, moneyCompact } from '@/lib/format';
import { lotPoint } from '@/lib/geo';
import MapClient from './MapClient';
import type { MapPoint } from './MapboxMap';
import { getMapboxToken } from '@/lib/mapbox/config';
import RegionPanel, { type RegionItem } from './RegionPanel';
import ResultsPanel, { type LotCard } from './ResultsPanel';
import { OBLASTS, normalizeRegion } from '@/lib/geo/oblasts';
import { applyLotFilters, parseLotFilters, type SP } from '@/lib/filters';
import LotFilterFields from '../components/LotFilterFields';

export const dynamic = 'force-dynamic';

export default async function MapPage({ searchParams }: { searchParams: SP }) {
  const sb = db();
  const f = parseLotFilters(searchParams);
  const region = f.region;
  const crit = searchParams.crit || '';
  const matchedOnly = searchParams.matched === '1';

  const needInner = matchedOnly || !!crit;
  const selectStr = needInner ? '*, matches!inner(criteria_id)' : '*';

  let query = sb.from('lots').select(selectStr).eq('hidden', false).limit(2000);
  query = applyLotFilters(query, f);
  if (crit) query = query.eq('matches.criteria_id', crit);

  const [{ data, error }, { data: critData }, { data: rcData }] = await Promise.all([
    query,
    sb.from('criteria').select('*').order('name'),
    sb.rpc('region_counts'),
  ]);
  if (error) {
    return <div className="notice">Помилка доступу до бази: {error.message}.</div>;
  }
  const lots = (data ?? []) as unknown as Lot[];
  const criteria = (critData ?? []) as Criteria[];

  // Лічильники по областях: зводимо «сирі» region до стему й сумуємо.
  const countByStem = new Map<string, number>();
  for (const row of (rcData ?? []) as { region: string; n: number }[]) {
    const stem = normalizeRegion(row.region);
    if (stem) countByStem.set(stem, (countByStem.get(stem) ?? 0) + Number(row.n));
  }
  const regionItems: RegionItem[] = OBLASTS.map((o) => ({
    stem: o.stem,
    name: o.name,
    count: countByStem.get(o.stem) ?? 0,
  }));

  const points: MapPoint[] = [];
  const cards: LotCard[] = [];
  let noGeo = 0;
  const seen = new Set<string>();
  for (const l of lots) {
    if (seen.has(l.id)) continue; // !inner join може дублювати
    seen.add(l.id);
    const pt = lotPoint(l);
    const price = l.current_price ?? l.start_price;
    if (pt) {
      points.push({
        id: l.id,
        lat: pt[0],
        lng: pt[1],
        title: l.title ?? 'Без назви',
        priceLabel: money(price, l.currency ?? 'UAH'),
        pill: moneyCompact(price),
        source: l.source,
        region: l.region,
        asset: l.asset_type,
        url: l.lot_url,
        approx: l.lat == null || l.lng == null,
      });
    } else {
      noGeo++;
    }
    cards.push({
      id: l.id,
      title: l.title ?? 'Без назви',
      price,
      currency: l.currency ?? 'UAH',
      region: l.region,
      area_sqm: l.area_sqm,
      asset: l.asset_type,
      subtype: l.subtype,
      source: l.source,
      url: l.lot_url,
      bids_end: l.bids_end,
      lat: pt ? pt[0] : null,
      lng: pt ? pt[1] : null,
    });
  }

  return (
    <main className="map-workspace">
      <div className="page-head">
        <h1>Мапа</h1>
        <span className="muted">На мапі: {points.length}{noGeo ? ` · без гео: ${noGeo}` : ''}</span>
      </div>

      <form className="filters" method="get">
        <div className="row">
          <LotFilterFields f={f} />
          <div className="field">
            <label>Критерій</label>
            <select name="crit" defaultValue={crit}>
              <option value="">Будь-який</option>
              {criteria.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field check">
            <input id="m" type="checkbox" name="matched" value="1" defaultChecked={matchedOnly} />
            <label htmlFor="m">лише зі збігами</label>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" type="submit">Показати</button>
            <a className="btn" href="/map">Скинути</a>
          </div>
        </div>
      </form>

      <div className="map-legend">
        <span><i style={{ background: '#e8620c' }} /> нерухомість</span>
        <span><i style={{ background: '#1f8f5a' }} /> земля</span>
        <span className="muted">бейдж: P — Prozorro, С — СЕТАМ · бліда плашка = орієнтовно (центр області) · клік по області = фільтр</span>
      </div>

      <RegionPanel items={regionItems} selected={region || null} />

      <div className="map-results-layout">
        <div className="map-box">
          <MapClient points={points} token={getMapboxToken()} selectedRegion={region || null} />
        </div>
        <ResultsPanel lots={cards} />
      </div>
    </main>
  );
}
