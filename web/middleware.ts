import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Необов'язковий пароль-гейт. Якщо задано APP_PASSWORD — усі сторінки, крім /login,
 * вимагають cookie з паролем. Порожній APP_PASSWORD = гейту немає (відкрито).
 * Простий спільний секрет для приватності URL (не повноцінна авторизація).
 */
export function middleware(req: NextRequest) {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith('/login')) return NextResponse.next();
  if (req.cookies.get('ua_auth')?.value === pw) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // не чіпаємо статику Next і favicon
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
