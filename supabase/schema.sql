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
  selling_method text,                            -- напр. landSell, basicSell, bankruptcy...
  status         text,
  region         text,                            -- область/місто
  address        text,
  lat            double precision,
  lng            double precision,
  area_sqm       numeric,                         -- площа (м² або переведено)
  start_price    numeric,
  current_price  numeric,
  currency       text default 'UAH',
  valuation      numeric,                         -- оціночна вартість (де є)
  auction_start  timestamptz,                     -- дата/час аукціону
  bids_end       timestamptz,                     -- дедлайн подачі заяв
  raw            jsonb,                           -- сирий об'єкт джерела
  first_seen     timestamptz not null default now(),
  last_seen      timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (source, source_id)
);

create index if not exists idx_lots_asset_type   on lots (asset_type);
create index if not exists idx_lots_region       on lots (region);
create index if not exists idx_lots_status       on lots (status);
create index if not exists idx_lots_bids_end     on lots (bids_end);
create index if not exists idx_lots_updated_at   on lots (updated_at desc);

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

-- Приклад стартового критерію (можна видалити):
-- insert into criteria (name, asset_types, regions, price_max, keywords)
-- values ('Квартири Київ до 2 млн', '{real_estate}', '{Київ}', 2000000, '{квартира}');
