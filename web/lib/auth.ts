import 'server-only';
import { cookies } from 'next/headers';

export function requireAccess() {
  const password = process.env.APP_PASSWORD;
  if (password && cookies().get('ua_auth')?.value !== password) throw new Error('Потрібно увійти');
}
