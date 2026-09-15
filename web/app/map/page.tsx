import { db } from '@/lib/supabase';
import type { Criteria, Lot } from '@/lib/types';
import { money } from '@/lib/format';
import { lotPoint } from '@/lib/geo';
import MapClient from './MapClient';
import type { MapPoint } from './LeafletMap';

export const dynamic = 'force-dynamic';

type SP = Record<string, string | undefined>;

export default async function MapPage({ searchParams }: { searchParams: SP }) {
  const sb = db();
  const source = searchParams.source || '';
  const asset = searchParams.asset || '';
  const region = (searchParams.region || '').trim();
  const crit = searchParams.crit || '';
  const matchedOnly = searchParams.matched === '1';

  const needInner = matchedOnly || !!crit;
  const selectStr = needInner ? '*, matches!inner(criteria_id)' : '*';

  let query = sb.from('lots').select(selectStr).eq('hidden', false).limit(1000);
  if (source) query = query.eq('source', source);
  if (asset) query = query.eq('asset_type', asset);
  if (region) query = query.ilike('region', `%${region}%`);
  if (crit) query = query.eq('matches.criteria_id', crit);

  const [{ data, error }, { data: critData }] = await Promise.all([
    query,
    sb.from('criteria').select('*').order('name'),
  ]);
  if (error) {
    return <div className="notice">Помилка доступу до бази: {error.message}.</div>;
  }
  const lots = (data ?? []) as unknown as Lot[];
  const criteria = (critData ?? []) as Criteria[];

  const points: MapPoint[] = [];
  let noGeo = 0;
  const seen = new Set<string>();
  for (const l of lots) {
    if (seen.has(l.id)) continue; // !inner join може дублювати
    seen.add(l.id);
    const pt = lotPoint(l);
    if (!pt) { noGeo++; continue; }
    points.push({
      id: l.id,
      lat: pt[0],
      lng: pt[1],
      title: l.title ?? 'Без назви',
      priceLabel: money(l.current_price ?? l.start_price, l.currency ?? 'UAH'),
      region: l.region,
      asset: l.asset_type,
      url: l.lot_url,
      approx: l.lat == null || l.lng == null,
    });
  }

  return (
    <main>
      <div className="page-head">
        <h1>Мапа</h1>
        <span className="muted">На мапі: {points.length}{noGeo ? ` · без гео: ${noGeo}` : ''}</span>
      </div>

      <form className="filters" method="get">
        <div className="row">
          <div className="field">
            <label>Джерело</label>
            <select name="source" defaultValue={source}>
              <option value="">Усі</option>
              <option value="prozorro">Prozorro.Sale</option>
              <option value="setam">СЕТАМ</option>
            </select>
          </div>
          <div className="field">
            <label>Тип</label>
            <select name="asset" defaultValue={asset}>
              <option value="">Усі</option>
              <option value="real_estate">Нерухомість</option>
              <option value="land">Земля</option>
              <option value="other">Інше</option>
            </select>
          </div>
          <div className="field">
            <label>Критерій</label>
            <select name="crit" defaultValue={crit}>
              <option value="">Будь-який</option>
              {criteria.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Регіон</label>
            <input name="region" defaultValue={region} placeholder="напр. Київ" />
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
        <span><i style={{ background: '#2f9e6a' }} /> земля</span>
        <span><i style={{ background: '#2b5c9b' }} /> нерухомість</span>
        <span className="muted">маркер — центр області (точних координат у джерелах немає)</span>
      </div>

      <div className="map-box">
        <MapClient points={points} />
      </div>
    </main>
  );
}
