'use client';

import { openCuration, type CurationDetail } from './CurationDrawer';

// Кнопка на картці лота, що відкриває бічну панель курації.
export default function CurationButton({ detail }: { detail: CurationDetail }) {
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => openCuration(detail)}>
      Деталі / нотатки
    </button>
  );
}
