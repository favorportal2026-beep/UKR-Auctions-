'use client';

import { useEffect, useState, useTransition } from 'react';
import { saveCuration } from '../actions';

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
export function openCuration(detail: CurationDetail) {
  window.dispatchEvent(new CustomEvent('open-curation', { detail }));
}

export default function CurationDrawer() {
  const [d, setD] = useState<CurationDetail | null>(null);
  const [status, setStatus] = useState('');
  const [note, setNote] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as CurationDetail;
      setD(detail);
      setStatus(detail.status || '');
      setNote(detail.note || '');
      setSaved(false);
    }
    window.addEventListener('open-curation', onOpen as EventListener);
    return () => window.removeEventListener('open-curation', onOpen as EventListener);
  }, []);

  function close() {
    setD(null);
  }

  function persist(nextStatus: string, nextNote: string) {
    if (!d) return;
    setSaved(false);
    startTransition(async () => {
      await saveCuration({ lot_id: d.id, status: nextStatus, note: nextNote });
      setSaved(true);
    });
  }

  function pickStatus(v: string) {
    const next = status === v ? '' : v; // повторний клік знімає
    setStatus(next);
    persist(next, note);
  }

  if (!d) return null;

  return (
    <>
      <div className="drawer-backdrop" onClick={close} />
      <aside className="curation-drawer" role="dialog" aria-label="Курація об'єкта">
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
        <div className="cd-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => persist(status, note)} disabled={pending}>
            {pending ? 'Збереження…' : 'Зберегти нотатку'}
          </button>
          {saved && !pending ? <span className="cd-saved">✓ Збережено</span> : null}
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
