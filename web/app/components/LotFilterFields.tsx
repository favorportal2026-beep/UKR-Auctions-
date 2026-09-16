import { SUBTYPE_OPTIONS, DEADLINE_OPTIONS, type LotFilters } from '@/lib/filters';

// Спільні поля фільтрів (мапа + дашборд). Рендериться всередині GET-форми;
// сторінка додає власні поля (критерій/лише збіги/приховані) і кнопки.
export default function LotFilterFields({ f }: { f: LotFilters }) {
  return (
    <>
      <div className="field">
        <label>Джерело</label>
        <select name="source" defaultValue={f.source}>
          <option value="">Усі</option>
          <option value="prozorro">Prozorro.Sale</option>
          <option value="setam">СЕТАМ</option>
        </select>
      </div>
      <div className="field">
        <label>Тип</label>
        <select name="asset" defaultValue={f.asset}>
          <option value="">Усі</option>
          <option value="real_estate">Нерухомість</option>
          <option value="land">Земля</option>
          <option value="other">Інше</option>
        </select>
      </div>
      <div className="field">
        <label>Підтип</label>
        <select name="subtype" defaultValue={f.subtype}>
          <option value="">Будь-який</option>
          {SUBTYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Ціна, ₴ (від / до)</label>
        <div className="range">
          <input name="price_min" type="number" min="0" inputMode="numeric" placeholder="від" defaultValue={f.priceMin ?? ''} />
          <input name="price_max" type="number" min="0" inputMode="numeric" placeholder="до" defaultValue={f.priceMax ?? ''} />
        </div>
      </div>
      <div className="field">
        <label>Площа, м² (від / до)</label>
        <div className="range">
          <input name="area_min" type="number" min="0" inputMode="numeric" placeholder="від" defaultValue={f.areaMin ?? ''} />
          <input name="area_max" type="number" min="0" inputMode="numeric" placeholder="до" defaultValue={f.areaMax ?? ''} />
        </div>
      </div>
      <div className="field">
        <label>Дедлайн подання</label>
        <select name="deadline" defaultValue={f.deadline}>
          {DEADLINE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Регіон</label>
        <input name="region" defaultValue={f.region} placeholder="напр. Київ" />
      </div>
      <div className="field">
        <label>Пошук</label>
        <input name="q" defaultValue={f.q} placeholder="квартира, ділянка…" />
      </div>
    </>
  );
}
