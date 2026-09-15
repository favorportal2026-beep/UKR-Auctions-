import 'dotenv/config';

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Відсутня змінна оточення: ${name} (див. .env.example)`);
  return v;
}

function opt(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
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
    startDate: opt('PROZORRO_START_DATE', '2026-09-01'),
  },
  setam: {
    // Дефолт — останній відомий помісячний CSV-ресурс СЕТАМ на data.gov.ua
    // (dataset c360d1ef…, снапшот 2026-09). Оновлювати щомісяця новим resource URL
    // або перевизначати через змінну SETAM_CSV_URL. Див. CLAUDE.md.
    csvUrl: opt(
      'SETAM_CSV_URL',
      'https://data.gov.ua/dataset/c360d1ef-4eee-4158-812f-ede20c4cc943/resource/940e7a39-eaba-4532-a48a-edf7e0d3177c/download/auctions-14-09-2026.csv'
    ),
  },
  telegram: {
    botToken: opt('TELEGRAM_BOT_TOKEN'),
    chatId: opt('TELEGRAM_CHAT_ID'),
  },
  collect: {
    pageLimit: Number(opt('COLLECT_PAGE_LIMIT', '100')),
    maxPages: Number(opt('COLLECT_MAX_PAGES', '50')),
  },
};

/** Конфіг для дій, що не пишуть у БД/Telegram (dry-run) — не вимагає всіх ключів. */
export function safeConfig() {
  return config;
}
