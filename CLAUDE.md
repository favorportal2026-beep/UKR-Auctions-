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

✅ **ЗВІРЕНО НА РЕАЛЬНІЙ ВІДПОВІДІ API (2026-09):** мапінг полів у `prozorro.ts`
закріплено за фактичною структурою:
- Відповідь — **голий JSON-масив** процедур `[ {...}, ... ]`, відсортований за
  `dateModified` **за зростанням**. Конверта `{ data, next_page }` **немає**
  (код читає обидва формати захищено). Курсор = останній `dateModified` + 1мс.
- Рядкові поля **локалізовані**: `{ "uk_UA": "..." }` (`title`, `description`,
  `items[].address.*`, `items[].unit.name`, `classification.description`,
  `sellingEntity.name`) — дістаємо через `loc()`.
- Ідентифікатор — `auctionId` (напр. `LAE001-UA-20260803-09138`).
- Ціна — `value.amount`, валюта `value.currency`.
- **Оцінка** — `expertMonetaryValuation.amount` (експертна/ринкова), fallback
  `normativeMonetaryValuation.amount`. Поля `valuation` в API **немає**.
- **Адреса активу** — `items[].address` (region/locality/streetAddress);
  fallback `sellingEntity.address` (це орган-продавець, а не актив).
- **Площа** — `items[].quantity` + `items[].unit.code`: `HAR`=гектар→×10000 м²,
  `MTK`=м². Інші (TNE/H87/LO/MTR/E50…) площею не вважаємо.
- Періоди — `auctionPeriod.startDate`, `tenderPeriod.endDate`. Посилання — `auctionUrl`.
- **Коди CAV** (scheme `CAV`) закріплено у `classify.ts`: `04*`=«Нерухоме майно»
  (04000000-8, 04210000-3, 04232000-3), `05*`=«Цілісний майновий комплекс»
  → **real_estate**; `06*`=«Земельні ділянки» (06121000-6, 06112000-0, 06128000-5)
  → **land**. Код класифікатора має пріоритет над `sellingMethod`, бо `basicSell`/
  `commercialSell` застосовують і до авто, меблів, брухту.

Перевірити: `npm run collect -- --source=prozorro --dry-run` (потрібен доступ до
`procedure.prozorro.sale`; у деяких CI/пісочницях вихід у мережу обмежено).

### 2) СЕТАМ — арештоване/конфісковане майно (окрема система)

ДП при Мін'юсті. Примусовий продаж (часто найбільший дисконт). **JSON-API немає**,
але є **відкриті дані**:

- Портал: `https://data.gov.ua/organization/derzhavne-pidpryiemstvo-setam`
- Набір: **«Повідомлення про торги … та їх результати»**, формат **CSV**,
  ліцензія CC-BY 4.0.
- Сторінка набору (dataset UUID): `https://data.gov.ua/dataset/c360d1ef-4eee-4158-812f-ede20c4cc943`
  (старе посилання `eda4e3cf-…` веде сюди ж). Ресурси — помісячні файли
  `auctions-DD-MM-YYYY.csv`; беремо найсвіжіший resource URL.

✅ **КОЛОНКИ CSV ЗВІРЕНО (2026-09):** заголовки (роздільник — **кома**, UTF-8 з BOM):
`Назва, Стан, Категорія, Місцезнаходження, Переможець, Номер лота,
Стартова ціна, Ціна продажу, Провадження`. Закріплено у `setam.ts`
(`EXACT_COLUMNS`; резолвер за підказками лишили як страховку). Особливості:
- **Немає** колонок URL, оцінки та дат → `lot_url` будуємо з «Номер лота»
  (`https://setam.net.ua/realization/{id}`), `valuation`/`auction_start`/`bids_end` = null.
- «Категорія» — **контрольований словник**; мапу категорій → тип активу закріплено
  у `classify.ts` (`classifySetam` + `SETAM_CATEGORY_MAP`): нерухомість =
  Житлова/Комерційна/Промислова нерухомість, Нежитлове приміщення, Будівлі,
  Гаражі/стоянки, Недобудована; земля = Земельні ділянки. Категорію «Інше»
  класифікуємо за текстом назви.
- «Ціна продажу» заповнена лише для завершених торгів → `current_price` = ціна
  продажу, інакше стартова.

Перевірка: вписати свіжий resource URL у `SETAM_CSV_URL` і запустити
`npm run collect -- --source=setam --dry-run`.

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
  Telegram-сповіщення, cron. → обидва «відкриті завдання» вище **закрито**
  (мапінг полів Prozorro та колонки CSV СЕТАМ звірено на реальних даних 2026-09).
- **Фаза 2 (розпочато):** веб-додаток — каталог `web/` (Next.js App Router).
  Дашборд лотів із фільтрами, курація (✕ ховає лот через `lots.hidden`), редактор
  критеріїв, кнопка «↻ Перерахувати збіги». Доступ до Supabase — ЛИШЕ з сервера
  (`service_role`), тому дані не публічні; необов'язковий пароль-гейт `APP_PASSWORD`.
  Деплой — Vercel (Root Directory = `web`). Деталі — `web/README.md`.
  TODO: гео-фільтр, збереження стану курації по користувачах, аутентифікація.
- **Фаза 3 (ідеї):** гео-фільтр на мапі, історія цін лота, оцінка BRRR-потенціалу,
  експорт у CRM (NetHunt/Pipedrive), додати агрегатори/приватні аукціони.

## Стиль/принципи

- Адаптери ізолюють специфіку джерела; решта коду працює лише з `NormalizedLot`.
- Нормалізація завжди захищена (optional chaining) — джерела змінюють формат.
- Дедуп і «нове vs змінене» — у БД за `(source, source_id)`.
- Нічого не ламати мовчки: невідомі заголовки/поля — логувати.
