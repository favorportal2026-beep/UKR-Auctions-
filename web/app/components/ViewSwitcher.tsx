'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import Link from 'next/link';

// Три окремі режими перегляду лотів: Мапа (/map), Список (/?view=list),
// Сітка (/?view=grid). Фільтри зберігаються при перемиканні.
export default function ViewSwitcher() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMap = pathname.startsWith('/map');
  const view = searchParams.get('view') || 'grid';

  function withParams(base: string, setView?: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('view');
    params.delete('page');
    if (setView) params.set('view', setView);
    const s = params.toString();
    return s ? `${base}?${s}` : base;
  }

  const active = isMap ? 'map' : view === 'list' ? 'list' : 'grid';

  return (
    <div className="view-switcher" role="group" aria-label="Режим перегляду">
      <Link className={`vs-btn${active === 'map' ? ' active' : ''}`} href={withParams('/map')}>
        🗺 Мапа
      </Link>
      <Link className={`vs-btn${active === 'list' ? ' active' : ''}`} href={withParams('/', 'list')}>
        ☰ Список
      </Link>
      <Link className={`vs-btn${active === 'grid' ? ' active' : ''}`} href={withParams('/', 'grid')}>
        ▦ Сітка
      </Link>
    </div>
  );
}
