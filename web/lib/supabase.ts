import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Серверний клієнт Supabase (service_role). Використовується ЛИШЕ на сервері
 * (server components / server actions) — ключ у браузер не потрапляє, тому RLS
 * лишається закритим, а дані — приватними. Той самий проєкт, що й колектор.
 */
let _client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!_client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error(
        'Відсутні SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (див. web/.env.local.example).'
      );
    }
    _client = createClient(url, key, { auth: { persistSession: false } });
  }
  return _client;
}
