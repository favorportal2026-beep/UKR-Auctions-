import Link from 'next/link';
import type { SP } from '@/lib/filters';

export default function Pagination({page,total,pageSize,params}: {page:number;total:number;pageSize:number;params:SP}) {
  const pages = Math.max(1,Math.ceil(total/pageSize));
  function href(n:number) {
    const query = new URLSearchParams();
    for (const [key,value] of Object.entries(params)) if (value && key!=='page') query.set(key,value);
    if (n>1) query.set('page',String(n));
    return '/?'+query.toString();
  }
  return <nav className="pagination" aria-label="Сторінки каталогу">
    {page>1 && <Link className="btn" href={href(page-1)}>← Попередня</Link>}
    <span>Сторінка {page} із {pages} · {total.toLocaleString('uk-UA')} лотів</span>
    {page<pages && <Link className="btn" href={href(page+1)}>Наступна →</Link>}
  </nav>;
}
