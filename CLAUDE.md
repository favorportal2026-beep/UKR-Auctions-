# CLAUDE.md — контекст проєкту для Claude Code

Це проєкт-система **моніторингу державних аукціонів України** за заданими
критеріями. Аналог власного інструмента користувача по UK, але для України.
Фокус MVP: **нерухомість і земля**. Джерела: **Prozorro.Sale (API)** та **СЕТАМ (CSV)**.

Мова коментарів і UI — українська. Користувач: Alex (Oleksandr Nechepurenko).

---

## Стек (зафіксовано)

- **TypeScript** (ESM, Node ≥ 20), запуск через `tsx`.
- **Supabase (Postgres)** — сховище лотів, критеріїв, збігів, курсорів.
- **GitHub Actions cron** — планувальник збору (MVP). Масштабування пізніше —
  **Google Cloud** (Cloud Scheduler + Cloud Run).
- **Telegram-бот** — сповіщення про нові збіги.
- **Vercel + Next.js** — веб-додаток (фаза 2, ще не створено).

---

## Архітектура (pipeline)

```
collectors (адаптери) → normalize (єдина модель Lot) → upsert у Supabase
   → criteria engine (matching) → matches → Telegram notify
```

Ключові файли:
- `src/types.ts` — доменні типи (`NormalizedLot`, `Criteria`).
- `src/collectors/base.ts` — інтерфейс `Collector`, `fetchJson/fetchText`.
- `src/collectors/prozorro.ts` — адаптер Prozorro.Sale (курсор `byDateModified`).
- `src/collectors/setam.ts` — адаптер СЕТАМ (CSV, гнучкий мапінг колонок).
- `src/collectors/classify.ts` — класифікація активу (нерухомість/земля).
- `src/criteria/engine.ts` — логіка збігу лот×критерій.
- `src/db/supabase.ts` — upsert/дедуп, курсори, matches.
- `src/notify/telegram.ts` — формат і надсилання.
- `src/pipeline.ts` / `src/cli.ts` — оркестрація і CLI.
- `supabase/schema.sql` — схема БД.
- `.github/workflows/collect.yml` — cron.

---

## Джерела даних (результати дослідження)

### 1) Prozorro.Sale — відкрите API (ЦБД / OpenProcurement)

Єдина централізована система; 40+ майданчиків показують ті самі лоти. Тягнемо
напряму з ЦБД, майданчики не потрібні.

- **ЦБД-New (актуальна), базовий URL:** `https://procedure.prozorro.sale/api`
- **Окремий інстанс для активів банків-банкрутів (ФГВФО):**
  `https://dgf-procedure.prozorro.sale/api`
- **Курсорний фід за датою зміни:**
  `GET /search/byDateModified/{ISO-date}?limit=100`
  → повертає повні процедури, відсортовані за `dateModified`. Наступна сторінка:
  беремо останній `dateModified` + 1 мс.
- **Envelope:** OpenProcurement — `{ data: [...], next_page?: {...} }`.
- **Класифікація активів:** поле `sellingMethod` (напр. `landSell-english`,
  `basicSell-*`, `bankruptcy-*`) + класифікатор **CAV-PS** у `items[].classification`
  та `items[].additionalClassifications`.
- Legacy ЦБД-1 (за потреби історії): `https://public.api.ea.openprocurement.org`
  (пагінація по 100 id).

⚠️ **ВІДКРИТЕ ЗАВДАННЯ — звірити мапінг полів.** Точні назви/структуру
(`value.amount`, `items[].quantity/unit`, `auctionPeriod.startDate`,
`tenderPeriod.endDate`, `address`) підтвердити на першій реальній відповіді.
Коди CAV-PS для нерухомості й землі — закріпити у `classify.ts` замість
евристичних префіксів. Використати `npm run collect -- --source=prozorro --dry-run`.

### 2) СЕТАМ — арештоване/конфісковане майно (окрема система)

ДП при Мін'юсті. Примусовий продаж (часто найбільший дисконт). **JSON-API немає**,
але є **відкриті дані**:

- Портал: `https://data.gov.ua/organization/derzhavne-pidpryiemstvo-setam`
- Набір: **«Повідомлення про торги … та їх результати»**, формат **CSV**,
  ліцензія CC-BY 4.0.
- Сторінка набору: `https://data.gov.ua/dataset/eda4e3cf-0dda-46a1-a78a-ee264ebbfe97`

⚠️ **ВІДКРИТЕ ЗАВДАННЯ — закріпити колонки CSV.** Точні заголовки невідомі до
першого завантаження. `setam.ts` має гнучкий резолвер за ключовими словами і
друкує знайдені заголовки. Кроки:
1. Взяти актуальний **resource URL** CSV зі сторінки набору → у `SETAM_CSV_URL`.
2. Запустити `npm run collect -- --source=setam --dry-run`.
3. За логом заголовків закріпити точний мапінг у `COLUMN_HINTS`/`resolveColumns`.

---

## Модель критеріїв (фільтрація)

Таблиця `criteria` (див. `schema.sql`). Порожнє поле = «будь-яке». Підтримує:
тип активу, регіони (частковий збіг), методи продажу, ключові слова,
діапазони ціни й площі, і **max_price_to_valuation** (знижка від оцінки, напр.
`0.7` = стартова ціна ≤ 70% оцінки). Логіка — `src/criteria/engine.ts`.

---

## Команди

```bash
npm install
npm run typecheck
npm run collect                              # усі джерела + сповіщення
npm run collect -- --source=prozorro --dry-run
npm run collect -- --source=setam --dry-run
npm run match                                # лише розсилка по наявних збігах
```

Секрети локально — `.env` (див. `.env.example`); у CI — GitHub Secrets
(ті самі імена), використовуються у `.github/workflows/collect.yml`.

---

## Дорожня карта

- **Фаза 1 (MVP, цей репозиторій):** колектори Prozorro + СЕТАМ, БД, критерії,
  Telegram-сповіщення, cron. → закрити два «відкриті завдання» вище.
- **Фаза 2:** веб-додаток (Next.js на Vercel) — дашборд збігів, редактор критеріїв,
  self-service курація (кнопка ✕ прибрати лот), фільтри. Дизайн — через design-скіли
  (без «AI-slop»: виразна типографіка, реальна арт-дирекція).
- **Фаза 3 (ідеї):** гео-фільтр на мапі, історія цін лота, оцінка BRRR-потенціалу,
  експорт у CRM (NetHunt/Pipedrive), додати агрегатори/приватні аукціони.

## Стиль/принципи

- Адаптери ізолюють специфіку джерела; решта коду працює лише з `NormalizedLot`.
- Нормалізація завжди захищена (optional chaining) — джерела змінюють формат.
- Дедуп і «нове vs змінене» — у БД за `(source, source_id)`.
- Нічого не ламати мовчки: невідомі заголовки/поля — логувати.
