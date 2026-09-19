import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Відсутня змінна оточення: ${name} (див. .env.example)`);
  return v;
}

function opt(name: string, fallback = ''): string {
  // GitHub Actions передає ПОРОЖНІ рядки для незаданих секретів, тому порожнє
  // трактуємо як відсутнє (інакше fallback не спрацював би: '' ?? x === '').
  const v = process.env[name];
  return v == null || v === '' ? fallback : v;
}

export const config = {
  // Ліниві геттери: ключі Supabase вимагаються лише при реальному доступі до БД
  // (див. db()), тому --dry-run працює без них. Пор. safeConfig() нижче.
  supabase: {
    get url() {
      return req('SUPABASE_URL');
    },
    get serviceKey() {
      return req('SUPABASE_SERVICE_ROLE_KEY');
    },
  },
  prozorro: {
    apiBase: opt('PROZORRO_API_BASE', 'https://procedure.prozorro.sale/api'),
    dgfApiBase: opt('PROZORRO_DGF_API_BASE', 'https://dgf-procedure.prozorro.sale/api'),
    // Стартова дата першого забору (далі рухається курсор із БД). Для «лише
    // активні» беремо недавнє вікно; за потреби глибше — задати PROZORRO_START_DATE.
    startDate: opt('PROZORRO_START_DATE', '2026-08-01'),
    refreshLimit: Number(opt('PROZORRO_REFRESH_LIMIT','200')),
  },
  setam: {
    // Порожньо = автоматичний вибір найсвіжішого CSV через каталог CKAN.
    csvUrl: opt('SETAM_CSV_URL'),
  },
  telegram: {
    botToken: opt('TELEGRAM_BOT_TOKEN'),
    chatId: opt('TELEGRAM_CHAT_ID'),
  },
  geo: {
    // Сервер геокодування (OSM Nominatim). Можна замінити на власний інстанс.
    nominatimBase: opt('NOMINATIM_BASE', 'https://nominatim.openstreetmap.org'),
    // Скільки лотів геокодувати за один запуск (≤1 req/s → ~1.5с/лот).
    // ~400 вкладається у 30-хв воркфлоу; повний backfill — за кілька запусків.
    maxPerRun: Number(opt('GEOCODE_MAX_PER_RUN', '400')),
  },
  collect: {
    pageLimit: Number(opt('COLLECT_PAGE_LIMIT', '100')),
    // Стеля сторінок за один запуск (захист від rate limit; реальний обмежувач —
    // 20-хв таймаут воркфлоу). Досить, щоб тижневий інкремент наздогнав дельту.
    maxPages: Number(opt('COLLECT_MAX_PAGES', '200')),
  },
};

/** Конфіг для дій, що не пишуть у БД/Telegram (dry-run) — не вимагає всіх ключів. */
export function safeConfig() {
  return config;
}
