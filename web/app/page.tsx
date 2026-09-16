import { db } from '@/lib/supabase';
import type { Criteria, Lot } from '@/lib/types';
import { ASSET_LABEL, SOURCE_LABEL, area, dateShort, discountLabel, money } from '@/lib/format';
import { applyLotFilters, parseLotFilters, SUBTYPE_LABEL, type SP } from '@/lib/filters';
import LotFilterFields from './components/LotFilterFields';
import ViewSwitcher from './components/ViewSwitcher';
import { hideLot, rematchAll, unhideLot } from './actions';

export const dynamic = 'force-dynamic';

type Row = Lot & { matches: { criteria_id: string; criteria: { id: string; name: string } | null }[] };

export default async function Dashboard({ searchParams }: { searchParams: SP }) {
  const sb = db();
  const f = parseLotFilters(searchParams);
  const crit = searchParams.crit || '';
  const matchedOnly = searchParams.matched === '1';
  const includeHidden = searchParams.hidden === '1';
  const view = searchParams.view === 'list' ? 'list' : 'grid';

  const needInner = matchedOnly || !!crit;
  const selectStr = needInner
    ? '*, matches!inner(criteria_id, criteria(id,name))'
    : '*, matches(criteria_id, criteria(id,name))';

  let query = sb.from('lots').select(selectStr).order('updated_at', { ascending: false }).limit(300);
  query = applyLotFilters(query, f);
  if (crit) query = query.eq('matches.criteria_id', crit);
  if (!includeHidden) query = query.eq('hidden', false);

  const [{ data: rowsData, error }, { data: critData }, stats] = await Promise.all([
    query,
    sb.from('criteria').select('*').order('name'),
    getStats(sb),
  ]);
  if (error) {
    return <ErrorBox message={error.message} />;
  }
  const rows = (rowsData ?? []) as unknown as Row[];
  const criteria = (critData ?? []) as Criteria[];

  return (
    <main>
      <div className="page-head">
        <h1>Лоти</h1>
        <ViewSwitcher />
        <form action={rematchAll}>
          <button className="btn btn-sm" type="submit" title="Перерахувати збіги за поточними критеріями">
            ↻ Перерахувати збіги
          </button>
        </form>
      </div>

      <section className="stats">
        <Stat n={stats.visible} l="Лотів (видимих)" />
        <Stat n={stats.land} l="Земля" />
        <Stat n={stats.realty} l="Нерухомість" />
        <Stat n={stats.matches} l="Збігів" />
      </section>

      <form className="filters" method="get">
        <div className="row">
          <LotFilterFields f={f} />
          <div className="field">
            <label>Критерій</label>
            <select name="crit" defaultValue={crit}>
              <option value="">Будь-який</option>
              {criteria.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="field check">
            <input id="m" type="checkbox" name="matched" value="1" defaultChecked={matchedOnly} />
            <label htmlFor="m">лише зі збігами</label>
          </div>
          <div className="field check">
            <input id="h" type="checkbox" name="hidden" value="1" defaultChecked={includeHidden} />
            <label htmlFor="h">показати приховані</label>
          </div>
          <div className="btn-row">
            <button className="btn btn-primary" type="submit">Фільтрувати</button>
            <a className="btn" href="/">Скинути</a>
          </div>
        </div>
      </form>

      {rows.length === 0 ? (
        <div className="empty">Лотів за фільтром немає. Спробуйте скинути фільтри або зачекайте на наступний збір.</div>
      ) : (
        <div className={`lots ${view}`}>
          {rows.map((r) => <LotCard key={r.id} row={r} />)}
        </div>
      )}
    </main>
  );
}

function LotCard({ row }: { row: Row }) {
  const price = row.current_price ?? row.start_price;
  const disc = discountLabel(price, row.valuation);
  const matched = dedupeMatches(row.matches);
  return (
    <article className={`lot${row.hidden ? ' hidden-lot' : ''}`}>
      <form action={row.hidden ? unhideLot : hideLot} className="hide-x">
        <input type="hidden" name="id" value={row.id} />
        <button className="btn btn-ghost btn-sm" type="submit" title={row.hidden ? 'Повернути' : 'Прибрати лот'}>
          {row.hidden ? '↩' : '✕'}
        </button>
      </form>

      <div className="lot-photo">
        {row.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={row.image_url} alt="" loading="lazy" />
        ) : (
          <div className="lot-photo-empty">без фото</div>
        )}
      </div>

      <div className="lot-top">
        <div className="badges">
          <span className={`badge ${row.asset_type === 'land' ? 'land' : row.asset_type === 'real_estate' ? 'realty' : ''}`}>
            {ASSET_LABEL[row.asset_type] ?? row.asset_type}
          </span>
          {row.subtype && row.subtype !== 'land' ? (
            <span className="badge">{SUBTYPE_LABEL[row.subtype] ?? row.subtype}</span>
          ) : null}
          <span className="badge">{SOURCE_LABEL[row.source] ?? row.source}</span>
          {disc ? <span className="badge disc">{disc}</span> : null}
        </div>
      </div>

      <h3>
        {row.lot_url ? (
          <a href={row.lot_url} target="_blank" rel="noreferrer">{row.title ?? 'Без назви'}</a>
        ) : (row.title ?? 'Без назви')}
      </h3>

      <div className="price">{money(price, row.currency ?? 'UAH')}</div>

      <div className="meta">
        {row.region ? <span><b>{row.region}</b></span> : null}
        {row.area_sqm != null ? <span>Площа: <b>{area(row.area_sqm)}</b></span> : null}
        {row.valuation != null ? <span>Оцінка: <b>{money(row.valuation, row.currency ?? 'UAH')}</b></span> : null}
        {row.bids_end ? <span>Заявки до: <b>{dateShort(row.bids_end)}</b></span> : null}
        {row.status ? <span>{row.status}</span> : null}
        {row.cadastral_number ? (
          <span>
            Кадастр:{' '}
            <a
              href={`https://map.land.gov.ua/kadastrova-karta?cadnum=${encodeURIComponent(row.cadastral_number)}`}
              target="_blank"
              rel="noreferrer"
              title="Відкрити ділянку в публічній кадастровій карті (ДЗК)"
            >
              <b>{row.cadastral_number}</b> ↗
            </a>
          </span>
        ) : null}
      </div>

      {matched.length ? (
        <div className="matched">
          {matched.map((m) => <span className="chip" key={m.id}>{m.name}</span>)}
        </div>
      ) : null}

      <div className="lot-actions">
        {row.lot_url ? (
          <a className="btn btn-ghost btn-sm" href={row.lot_url} target="_blank" rel="noreferrer">Відкрити лот ↗</a>
        ) : <span className="muted" style={{ fontSize: 13 }}>без посилання</span>}
      </div>
    </article>
  );
}

function dedupeMatches(ms: Row['matches']): { id: string; name: string }[] {
  const seen = new Map<string, string>();
  for (const m of ms) {
    if (m.criteria?.id) seen.set(m.criteria.id, m.criteria.name);
  }
  return [...seen].map(([id, name]) => ({ id, name }));
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="stat">
      <div className="n">{n.toLocaleString('uk-UA')}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function ErrorBox({ message }: { message: string }) {
  return (
    <main>
      <div className="notice">
        Помилка доступу до бази: {message}. Перевірте <code>SUPABASE_URL</code> та{' '}
        <code>SUPABASE_SERVICE_ROLE_KEY</code> у змінних оточення.
      </div>
    </main>
  );
}

async function getStats(sb: ReturnType<typeof db>) {
  const head = { count: 'exact' as const, head: true };
  const [visible, land, realty, matches] = await Promise.all([
    sb.from('lots').select('*', head).eq('hidden', false),
    sb.from('lots').select('*', head).eq('hidden', false).eq('asset_type', 'land'),
    sb.from('lots').select('*', head).eq('hidden', false).eq('asset_type', 'real_estate'),
    sb.from('matches').select('*', head),
  ]);
  return {
    visible: visible.count ?? 0,
    land: land.count ?? 0,
    realty: realty.count ?? 0,
    matches: matches.count ?? 0,
  };
}
