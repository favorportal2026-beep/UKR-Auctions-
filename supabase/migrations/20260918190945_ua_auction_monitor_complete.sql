-- ============================================================
-- UA Auction Monitor — схема бази (Supabase / Postgres)
-- Виконати у Supabase → SQL Editor.
-- ============================================================

-- Тип активу, який ми відстежуємо (MVP: нерухомість + земля).
do $$ begin
  create type asset_type as enum ('real_estate', 'land', 'other');
exception when duplicate_object then null; end $$;

-- Джерело даних.
do $$ begin
  create type lot_source as enum ('prozorro', 'setam');
exception when duplicate_object then null; end $$;

-- ── Лоти ────────────────────────────────────────────────────
create table if not exists lots (
  id             uuid primary key default gen_random_uuid(),
  source         lot_source  not null,
  source_id      text        not null,           -- id/auctionId у джерелі
  lot_url        text,
  title          text,
  description    text,
  asset_type     asset_type  not null default 'other',
  subtype        text,                            -- підтип: land/apartment/house/premises/building/garage/unfinished/complex/other
  selling_method text,                            -- напр. landSell, basicSell, bankruptcy...
  status         text,
  region         text,                            -- область/місто
  address        text,
  lat            double precision,
  lng            double precision,
  area_sqm       numeric,                         -- площа (м² або переведено)
  cadastral_number text,                          -- кадастровий номер (для землі)
  image_url      text,                            -- перше фото (Prozorro illustration)
  start_price    numeric,
  current_price  numeric,
  currency       text default 'UAH',
  valuation      numeric,                         -- оціночна вартість (де є)
  auction_start  timestamptz,                     -- дата/час аукціону
  bids_end       timestamptz,                     -- дедлайн подачі заяв
  hidden         boolean not null default false,  -- курація: прибрано у веб-дашборді
  raw            jsonb,                           -- сирий об'єкт джерела
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists idx_lots_asset_type   on lots (asset_type);
create index if not exists idx_lots_subtype       on lots (subtype);
create index if not exists idx_lots_cadastre      on lots (cadastral_number);
create index if not exists idx_lots_region       on lots (region);
create index if not exists idx_lots_status       on lots (status);
create index if not exists idx_lots_bids_end     on lots (bids_end);
create index if not exists idx_lots_updated_at   on lots (updated_at desc);
create index if not exists idx_lots_hidden       on lots (hidden);

-- Для наявних БД (де таблиця вже створена без hidden):
alter table lots add column if not exists hidden boolean not null default false;

-- ── Критерії (збережені пошуки) ─────────────────────────────
create table if not exists criteria (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  active              boolean not null default true,
  asset_types         asset_type[] default '{real_estate,land}',
  regions             text[]   default '{}',      -- порожньо = будь-який
  selling_methods     text[]   default '{}',
  keywords            text[]   default '{}',      -- пошук у title/description
  price_min           numeric,
  price_max           numeric,
  area_min            numeric,
  area_max            numeric,
  -- максимальне співвідношення стартова_ціна / оцінка (напр. 0.7 = знижка ≥30%)
  max_price_to_valuation numeric,
  created_at          timestamptz not null default now()
);

-- ── Збіги лот×критерій ──────────────────────────────────────
create table if not exists matches (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references lots(id) on delete cascade,
  criteria_id  uuid not null references criteria(id) on delete cascade,
  notified     boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (lot_id, criteria_id)
);

create index if not exists idx_matches_notified on matches (notified);

-- ── Стан синхронізації (курсори по джерелах) ────────────────
create table if not exists sync_state (
  source     lot_source primary key,
  cursor     text,                                -- напр. останній dateModified
  last_run   timestamptz,
  note       text
);

-- ── Кеш геокодування (адреса → координати) ──────────────────
create table if not exists geocode_cache (
  query      text primary key,                    -- нормалізований текст запиту
  lat        double precision,                    -- null = геокодер не знайшов
  lng        double precision,
  created_at timestamptz not null default now()
);

-- ── Безпека (RLS) ───────────────────────────────────────────
-- Ці таблиці — лише для бекенду (колектор пише service_role-ключем, який
-- обходить RLS). Вмикаємо RLS без політик, щоб anon/authenticated НЕ мали
-- доступу. Для веб-додатка (Фаза 2) додати явні політики під потрібні ролі.
alter table lots          enable row level security;
alter table criteria      enable row level security;
alter table matches       enable row level security;
alter table sync_state    enable row level security;
alter table geocode_cache enable row level security;

-- Приклад стартового критерію (можна видалити):
-- insert into criteria (name, asset_types, regions, price_max, keywords)
-- values ('Квартири Київ до 2 млн', '{real_estate}', '{Київ}', 2000000, '{квартира}');

-- Доповнення українського монітора. Не змінює таблиці UK-проєкту.
alter table public.lots add column if not exists subtype text;
alter table public.lots add column if not exists cadastral_number text;
alter table public.lots add column if not exists image_url text;
alter table public.lots add column if not exists price_to_valuation numeric
  generated always as (case when valuation > 0 then current_price / valuation end) stored;
alter table public.lots add column if not exists is_active boolean
  generated always as (coalesce(
    (source = 'prozorro' and status in ('active_tendering','active_auction','active_enquiries','active_rectification'))
    or (source = 'setam' and status = 'Реєстрація учасників'), false)) stored;
create index if not exists idx_lots_active on public.lots(is_active, hidden, bids_end);
create index if not exists idx_lots_discount on public.lots(price_to_valuation);

create table if not exists public.lot_curation (
  lot_id uuid primary key references public.lots(id) on delete cascade,
  status text,
  note text,
  updated_at timestamptz not null default now()
);
create index if not exists idx_lot_curation_status on public.lot_curation(status);
alter table public.lot_curation enable row level security;

alter table public.sync_state add column if not exists started_at timestamptz;
alter table public.sync_state add column if not exists last_success_at timestamptz;
alter table public.sync_state add column if not exists run_status text;
alter table public.sync_state add column if not exists last_error text;
alter table public.sync_state add column if not exists collected_count integer;
alter table public.sync_state add column if not exists data_url text;
alter table public.sync_state add column if not exists data_date timestamptz;
alter table public.sync_state add column if not exists refresh_cursor text;
update public.sync_state set last_success_at = last_run where last_success_at is null;

-- Один транзакційний перерахунок, незалежний від ліміту REST API.
create or replace function public.ua_lot_matches(l public.lots, c public.criteria)
returns boolean language sql stable security invoker set search_path = public as $$
 select c.active and not l.hidden and l.is_active and (l.bids_end is null or l.bids_end > now())
 and (coalesce(cardinality(c.asset_types),0)=0 or l.asset_type=any(c.asset_types))
 and (coalesce(cardinality(c.regions),0)=0 or exists
   (select 1 from unnest(c.regions) r where strpos(lower(coalesce(l.region,'')||' '||coalesce(l.address,'')),lower(r))>0))
 and (coalesce(cardinality(c.selling_methods),0)=0 or exists
   (select 1 from unnest(c.selling_methods) m where strpos(lower(coalesce(l.selling_method,'')),lower(m))>0))
 and (coalesce(cardinality(c.keywords),0)=0 or exists
   (select 1 from unnest(c.keywords) k where strpos(lower(coalesce(l.title,'')||' '||coalesce(l.description,'')),lower(k))>0))
 and (c.price_min is null or coalesce(l.start_price,l.current_price)>=c.price_min)
 and (c.price_max is null or coalesce(l.start_price,l.current_price)<=c.price_max)
 and (c.area_min is null or l.area_sqm>=c.area_min)
 and (c.area_max is null or l.area_sqm<=c.area_max)
 and (c.max_price_to_valuation is null or
   (l.valuation>0 and coalesce(l.start_price,l.current_price)/l.valuation<=c.max_price_to_valuation));
$$;

create or replace function public.ua_rematch_lots(p_lot_ids uuid[] default null)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare inserted_count integer; deleted_count integer;
begin
 perform pg_advisory_xact_lock(88472106);
 insert into public.matches(lot_id,criteria_id,notified)
 select l.id,c.id,false from public.lots l cross join public.criteria c
 where (p_lot_ids is null or l.id=any(p_lot_ids)) and public.ua_lot_matches(l,c)
 on conflict (lot_id,criteria_id) do nothing;
 get diagnostics inserted_count = row_count;
 delete from public.matches m
 where (p_lot_ids is null or m.lot_id=any(p_lot_ids)) and not exists
   (select 1 from public.lots l join public.criteria c on c.id=m.criteria_id
    where l.id=m.lot_id and coalesce(public.ua_lot_matches(l,c),false));
 get diagnostics deleted_count = row_count;
 return jsonb_build_object('inserted',inserted_count,'deleted',deleted_count,
   'total',(select count(*) from public.matches));
end;
$$;

-- Прибираємо SECURITY DEFINER зі старого лічильника; права лише серверу.
create or replace function public.region_counts()
returns table(region text,n bigint) language sql stable security invoker set search_path = public as $$
 select l.region,count(*)::bigint from public.lots l
 where not l.hidden and l.is_active and (l.bids_end is null or l.bids_end>now()) and l.region is not null
 group by l.region;
$$;
revoke all on function public.ua_lot_matches(public.lots,public.criteria) from public,anon,authenticated;
revoke all on function public.ua_rematch_lots(uuid[]) from public,anon,authenticated;
revoke all on function public.region_counts() from public,anon,authenticated;
grant execute on function public.ua_lot_matches(public.lots,public.criteria) to service_role;
grant execute on function public.ua_rematch_lots(uuid[]) to service_role;
grant execute on function public.region_counts() to service_role;
grant select,insert,update,delete on public.lots,public.criteria,public.matches,
 public.sync_state,public.geocode_cache,public.lot_curation to service_role;
notify pgrst, 'reload schema';
