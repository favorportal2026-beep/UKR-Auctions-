import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const metadata = { title: 'Вхід — Моніторинг аукціонів' };

async function login(formData: FormData) {
  'use server';
  const pw = process.env.APP_PASSWORD ?? '';
  const entered = String(formData.get('password') ?? '');
  if (pw && entered === pw) {
    cookies().set('ua_auth', pw, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });
    redirect('/');
  }
  redirect('/login?e=1');
}

export default function LoginPage({ searchParams }: { searchParams: { e?: string } }) {
  return (
    <main className="login-wrap">
      <form action={login} className="login-card">
        <h1>Моніторинг аукціонів</h1>
        <p className="muted">Введіть пароль доступу.</p>
        <input type="password" name="password" placeholder="Пароль" autoFocus required />
        {searchParams.e ? <p className="err">Невірний пароль.</p> : null}
        <button type="submit">Увійти</button>
      </form>
    </main>
  );
}
