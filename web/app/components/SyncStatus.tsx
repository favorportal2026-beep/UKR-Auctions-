import { db } from '@/lib/supabase';

type Sync = {source:string;last_success_at:string|null;last_run:string|null;run_status:string|null;
  started_at:string|null;last_error:string|null;data_date:string|null;data_url:string|null};
const labels:Record<string,string> = {prozorro:'Prozorro.Sale',setam:'СЕТАМ'};
function date(value:string|null) {
  return value ? new Date(value).toLocaleString('uk-UA',{timeZone:'Europe/Kyiv',dateStyle:'short',timeStyle:'short'}) : 'ще не збирався';
}
export default async function SyncStatus() {
  const {data,error} = await db().from('sync_state').select('source,last_success_at,last_run,run_status,started_at,last_error,data_date,data_url').order('source');
  if (error) return <div className="notice">Не вдалося перевірити оновлення джерел.</div>;
  return <section className="sync-status" aria-label="Оновлення джерел">
    {(data as Sync[] ?? []).map(s => {
      const last = s.last_success_at ?? s.last_run;
      const stale = !last || Date.now()-Date.parse(last)>(2)*86400000;
      const stalled = s.run_status==='running' && !!s.started_at && Date.now()-Date.parse(s.started_at)>3600000;
      return <div key={s.source} className={s.run_status==='failed'||stale||stalled?'sync-warning':''}>
        <strong>{labels[s.source] ?? s.source}</strong> · останній успішний збір: {date(last)} (Київ)
        {s.run_status==='running' && !stalled && ' · збирається…'}
        {s.run_status==='partial' && ' · наздоганяємо зміни'}
        {stale && ' · дані потребують оновлення'}
        {stalled && ' · збір не завершився'}
        {s.run_status==='failed' && <span> · помилка збору: {s.last_error ?? 'невідома'}</span>}
        {s.source==='setam' && s.data_date && <span> · CSV за {new Date(s.data_date).toLocaleDateString('uk-UA',{timeZone:'UTC'})}</span>}
      </div>;
    })}
  </section>;
}
