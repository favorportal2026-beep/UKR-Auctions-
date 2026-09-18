'use client';

import { useEffect, useRef, useState } from 'react';
import { loadCuration, saveCuration } from '../actions';

export type CurationDetail = {
  id: string;
  title: string;
  priceLabel: string;
  region: string | null;
  image: string | null;
  url: string | null;
  cadastral: string | null;
  status: string; // '' | review | shortlist | bidding
  note: string;
};

const STATUSES: { value: string; label: string }[] = [
  { value: 'review', label: 'Розглянути' },
  { value: 'shortlist', label: 'Шорт-ліст' },
  { value: 'bidding', label: 'Торгуюсь' },
];

export const STATUS_LABEL: Record<string, string> = {
  review: 'Розглянути',
  shortlist: 'Шорт-ліст',
  bidding: 'Торгуюсь',
};

// Відкриття панелі — подією (одна панель на сторінку; кнопки на картках шлють подію).
export function openCuration(detail: CurationDetail | {id:string}) {
  window.dispatchEvent(new CustomEvent('open-curation', { detail }));
}

export default function CurationDrawer() {
  const [d, setD] = useState<CurationDetail | null>(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [error,setError]=useState('');
  const [loading,setLoading]=useState(false);
  const generation=useRef(0);
  const [pending,setPending]=useState(false);

  useEffect(() => {
    async function onOpen(e: Event) {
      const detail=(e as CustomEvent).detail as {id:string};
      const current=++generation.current;
      setLoading(true);setError('');setSaved(false);setPending(false);setD(null);
      try {
        const loaded=await loadCuration(detail.id);
        if (generation.current!==current) return;
        setD(loaded);setStatus(loaded.status);setNote(loaded.note);
      } catch {
        if (generation.current===current) setError('Не вдалося завантажити об’єкт. Спробуйте ще раз.');
      } finally { if (generation.current===current) setLoading(false); }
    }
    function onClick(e:MouseEvent) {
      const button=(e.target as Element).closest('[data-curation]');
      const id=button?.getAttribute('data-curation');
      if (id) openCuration({id});
    }
    function onKey(e:KeyboardEvent) { if (e.key==='Escape') close(); }
    window.addEventListener('open-curation',onOpen);
    document.addEventListener('click',onClick);
    window.addEventListener('keydown',onKey);
    return ()=>{generation.current++;window.removeEventListener('open-curation',onOpen);document.removeEventListener('click',onClick);window.removeEventListener('keydown',onKey);};
  }, []);

  function close() { generation.current++;setD(null);setLoading(false);setPending(false);setError(''); }

  async function persist(nextStatus: string, nextNote: string) {
    if (!d) return;
    setSaved(false);setError('');
    const current=generation.current;
    setPending(true);
      try {
        await saveCuration({lot_id:d.id,status:nextStatus,note:nextNote});
        if (current===generation.current) setSaved(true);
      } catch { if (current===generation.current) setError('Не вдалося зберегти. Спробуйте ще раз.'); }
      finally {if (current===generation.current) setPending(false);}
  }

  function pickStatus(v: string) {
    const next = status === v ? '' : v; // повторний клік знімає
    setStatus(next);
    persist(next, note);
  }

  if (!d) return loading || error ? <>
    <div className="drawer-backdrop" onClick={close}/><aside className="curation-drawer" role="dialog" aria-modal="true" aria-label="Курація об’єкта">
      <button type="button" className="cd-close" onClick={close} aria-label="Закрити">✕</button>
      <p role="status">{loading?'Завантаження…':error}</p>
    </aside></> : null;

  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="curation-drawer" role="dialog" aria-modal="true" aria-label="Курація об'єкта">
        <div className="cd-head">
          <strong>Об'єкт</strong>
          <button type="button" className="cd-close" onClick={close} aria-label="Закрити">
            ✕
          </button>
        </div>

        {d.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="cd-photo" src={d.image} alt="" />
        ) : null}

        <div className="cd-price">{d.priceLabel}</div>
        <div className="cd-title">{d.title}</div>
        <div className="cd-region">{d.region ?? '—'}</div>
        {d.cadastral ? <div className="cd-cadastr">Кадастр: {d.cadastral}</div> : null}

        <div className="cd-section-label">Статус</div>
        <div className="cd-statuses">
          {STATUSES.map((s) => (
            <button
              key={s.value}
              type="button"
              className={`cd-status s-${s.value}${status === s.value ? ' active' : ''}`}
              disabled={pending}
              onClick={() => pickStatus(s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="cd-section-label">Нотатки</div>
        <textarea
          className="cd-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ваші думки, ціна-стеля, ризики, контакти…"
          rows={6}
        />
        {error && <p role="alert" className="err">{error}</p>}
        <div className="cd-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => persist(status, note)} disabled={pending}>
            {pending ? 'Збереження…' : 'Зберегти нотатку'}
          </button>
          {saved && !pending ? <span className="cd-saved">✓ Збережено</span> : null}
          <a className="btn btn-sm" href={`/lots/${d.id}`}>Деталі об’єкта</a>
          {d.url ? (
            <a className="btn btn-sm" href={d.url} target="_blank" rel="noreferrer">
              Відкрити лот ↗
            </a>
          ) : null}
        </div>
      </aside>
    </>
  );
}
