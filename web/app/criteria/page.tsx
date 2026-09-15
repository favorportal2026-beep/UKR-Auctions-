import { db } from '@/lib/supabase';
import type { Criteria } from '@/lib/types';
import { rematchAll } from '../actions';
import { addCriterion, deleteCriterion, updateCriterion } from './actions';

export const dynamic = 'force-dynamic';

const EMPTY: Criteria = {
  id: '', name: '', active: true, asset_types: ['real_estate', 'land'],
  regions: [], selling_methods: [], keywords: [],
  price_min: null, price_max: null, area_min: null, area_max: null,
  max_price_to_valuation: null, created_at: '',
};

export default async function CriteriaPage() {
  const { data, error } = await db().from('criteria').select('*').order('created_at', { ascending: true });
  if (error) {
    return <div className="notice">Помилка: {error.message}</div>;
  }
  const criteria = (data ?? []) as Criteria[];

  return (
    <main>
      <div className="page-head">
        <h1>Критерії</h1>
        <form action={rematchAll}>
          <button className="btn btn-sm" type="submit">↻ Перерахувати збіги</button>
        </form>
      </div>

      <div className="notice">
        Порожнє поле = «будь-яке». Після зміни критеріїв натисніть <b>«Перерахувати збіги»</b>,
        щоб застосувати їх до вже зібраних лотів (колектор інакше матчить лише нові/змінені).
      </div>

      <CriterionCard c={EMPTY} isNew />

      <div className="crit-list" style={{ marginTop: 18 }}>
        {criteria.map((c) => <CriterionCard key={c.id} c={c} />)}
      </div>
    </main>
  );
}

function CriterionCard({ c, isNew = false }: { c: Criteria; isNew?: boolean }) {
  const action = isNew ? addCriterion : updateCriterion;
  return (
    <div className="crit">
      <form action={action}>
        {!isNew ? <input type="hidden" name="id" value={c.id} /> : null}
        <div className="crit-head">
          <input name="name" defaultValue={c.name} placeholder="Назва критерію" style={{ fontSize: 16, fontWeight: 650, flex: 1, minWidth: 200 }} required />
          <label className="field check">
            <input type="checkbox" name="active" defaultChecked={c.active} /> активний
          </label>
        </div>

        <div className="crit-grid">
          <div className="field">
            <label>Тип активу</label>
            <div className="btn-row">
              <label className="field check"><input type="checkbox" name="asset_types" value="real_estate" defaultChecked={c.asset_types.includes('real_estate')} /> нерух.</label>
              <label className="field check"><input type="checkbox" name="asset_types" value="land" defaultChecked={c.asset_types.includes('land')} /> земля</label>
            </div>
          </div>
          <div className="field">
            <label>Регіони (через кому)</label>
            <input name="regions" defaultValue={c.regions.join(', ')} placeholder="Київ, Полтав" />
          </div>
          <div className="field">
            <label>Ключові слова</label>
            <input name="keywords" defaultValue={c.keywords.join(', ')} placeholder="квартир, ділянк" />
          </div>
          <div className="field">
            <label>Методи продажу</label>
            <input name="selling_methods" defaultValue={c.selling_methods.join(', ')} placeholder="land, setam" />
          </div>
          <div className="field">
            <label>Ціна від</label>
            <input name="price_min" type="number" step="any" defaultValue={c.price_min ?? ''} />
          </div>
          <div className="field">
            <label>Ціна до</label>
            <input name="price_max" type="number" step="any" defaultValue={c.price_max ?? ''} />
          </div>
          <div className="field">
            <label>Площа від (м²)</label>
            <input name="area_min" type="number" step="any" defaultValue={c.area_min ?? ''} />
          </div>
          <div className="field">
            <label>Площа до (м²)</label>
            <input name="area_max" type="number" step="any" defaultValue={c.area_max ?? ''} />
          </div>
          <div className="field">
            <label>Ціна/оцінка ≤ (0.7 = −30%)</label>
            <input name="max_price_to_valuation" type="number" step="any" min="0" max="1" defaultValue={c.max_price_to_valuation ?? ''} />
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: 12 }}>
          <button className="btn btn-primary btn-sm" type="submit">{isNew ? 'Додати критерій' : 'Зберегти'}</button>
        </div>
      </form>

      {!isNew ? (
        <form action={deleteCriterion} style={{ marginTop: -34, display: 'flex', justifyContent: 'flex-end' }}>
          <input type="hidden" name="id" value={c.id} />
          <button className="btn btn-ghost btn-sm btn-danger" type="submit">Видалити</button>
        </form>
      ) : null}
    </div>
  );
}
