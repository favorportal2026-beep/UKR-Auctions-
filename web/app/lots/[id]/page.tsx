import Link from 'next/link';
import { notFound } from 'next/navigation';
import { db } from '@/lib/supabase';
import type { Lot } from '@/lib/types';
import { ASSET_LABEL,SOURCE_LABEL,area,dateShort,money,discountLabel } from '@/lib/format';
import { SUBTYPE_LABEL } from '@/lib/filters';
import CurationButton from '../../components/CurationButton';
import CurationDrawer,{STATUS_LABEL} from '../../components/CurationDrawer';
import { hideLot,unhideLot } from '../../actions';

export const dynamic = 'force-dynamic';
function safeUrl(value:unknown):string|null {
  if (typeof value!=='string') return null;
  try { const url=new URL(value); return ['https:','http:'].includes(url.protocol)?url.href:null; } catch { return null; }
}
function local(value:unknown):string {
  if (typeof value==='string') return value;
  if (value && typeof value==='object') return String((value as Record<string,unknown>).uk_UA ?? 'Документ');
  return 'Документ';
}
export default async function LotDetail({params}:{params:{id:string}}) {
  if (!/^[a-f0-9-]{36}$/i.test(params.id)) notFound();
  const {data,error} = await db().from('lots').select('*,lot_curation(status,note),matches(criteria(id,name))').eq('id',params.id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) notFound();
  const lot=data as Lot & {raw?:{documents?:{title?:unknown;url?:unknown}[]};lot_curation:{status:string|null;note:string|null}|null;
    matches:{criteria:{id:string;name:string}|null}[]};
  const price=lot.current_price ?? lot.start_price;
  const open=lot.is_active && (!lot.bids_end || Date.parse(lot.bids_end)>Date.now());
  const detail={id:lot.id,title:lot.title ?? 'Без назви',priceLabel:money(price,lot.currency ?? 'UAH'),region:lot.region,
    image:lot.image_url,url:lot.lot_url,cadastral:lot.cadastral_number,status:lot.lot_curation?.status ?? '',note:lot.lot_curation?.note ?? ''};
  const documents=(lot.raw?.documents ?? []).map(d=>({title:local(d.title),url:safeUrl(d.url)})).filter(d=>d.url);
  return <main className="lot-detail">
    <Link href="/">← Каталог лотів</Link>
    <div className="page-head"><h1>{lot.title ?? 'Без назви'}</h1></div>
    <div className="badges"><span className="badge">{open?'Активний':'Архів'}</span>
      <span className="badge">{SOURCE_LABEL[lot.source]}</span><span className="badge">{ASSET_LABEL[lot.asset_type]}</span>
      {lot.subtype && <span className="badge">{SUBTYPE_LABEL[lot.subtype] ?? lot.subtype}</span>}
      {lot.lot_curation?.status && <span className="badge">{STATUS_LABEL[lot.lot_curation.status]}</span>}
      {lot.hidden && <span className="badge">Прихований</span>}
    </div>
    <div className="detail-grid">
      <section>
        {lot.image_url && <img className="detail-photo" src={lot.image_url} alt={lot.title ?? 'Об’єкт'} />}
        <h2>Опис</h2><p className="detail-description">{lot.description || 'Опис у джерелі відсутній.'}</p>
        {documents.length>0 && <><h2>Документи джерела</h2><ul>{documents.map((d,i)=><li key={i}><a href={d.url!} target="_blank" rel="noreferrer">{d.title} ↗</a></li>)}</ul></>}
      </section>
      <section className="detail-info">
        <div className="price">{detail.priceLabel}</div>
        {discountLabel(price,lot.valuation) && <p>{discountLabel(price,lot.valuation)}</p>}
        <dl>
          <dt>Адреса</dt><dd>{lot.address ?? lot.region ?? 'Невідома'}</dd>
          <dt>Площа</dt><dd>{lot.area_sqm!=null?area(lot.area_sqm):'Невідома'}</dd>
          <dt>Стартова ціна</dt><dd>{money(lot.start_price,lot.currency ?? 'UAH')}</dd>
          <dt>Оцінка</dt><dd>{money(lot.valuation,lot.currency ?? 'UAH')}</dd>
          <dt>Заявки до</dt><dd>{dateShort(lot.bids_end)}</dd>
          <dt>Аукціон</dt><dd>{dateShort(lot.auction_start)}</dd>
          <dt>Статус джерела</dt><dd>{lot.status ?? 'Невідомий'}</dd>
          <dt>Номер</dt><dd>{lot.source_id}</dd>
          {lot.cadastral_number && <><dt>Кадастр</dt><dd><a href={`https://map.land.gov.ua/kadastrova-karta?cadnum=${encodeURIComponent(lot.cadastral_number)}`} target="_blank" rel="noreferrer">{lot.cadastral_number} ↗</a></dd></>}
          <dt>Перевірено джерело</dt><dd>{dateShort(lot.last_seen)}</dd>
        </dl>
        <div className="btn-row"><CurationButton detail={detail} />
          <Link className="btn" href={`/map?availability=all&focus=${lot.id}`}>На мапі</Link>
          {safeUrl(lot.lot_url) && <a className="btn" href={lot.lot_url!} target="_blank" rel="noreferrer">Відкрити джерело ↗</a>}
          <form action={lot.hidden?unhideLot:hideLot}><input type="hidden" name="id" value={lot.id}/><button className="btn">{lot.hidden?'Повернути':'Приховати'}</button></form>
        </div>
        <h2>Нотатки</h2><p className="detail-description">{lot.lot_curation?.note || 'Нотаток ще немає.'}</p>
        {!!lot.matches.length && <><h2>Збережені пошуки</h2><div className="matched">{lot.matches.map(m=>m.criteria && <span className="chip" key={m.criteria.id}>{m.criteria.name}</span>)}</div></>}
      </section>
    </div>
    <CurationDrawer />
  </main>;
}
