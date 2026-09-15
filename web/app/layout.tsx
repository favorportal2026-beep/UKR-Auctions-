import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'Моніторинг аукціонів України',
  description: 'Prozorro.Sale + СЕТАМ — нерухомість і земля за вашими критеріями.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk">
      <body>
        <header className="site-header">
          <div className="wrap header-inner">
            <Link href="/" className="brand">
              <span className="brand-mark">◆</span> Аукціони<span className="brand-dim">.UA</span>
            </Link>
            <nav className="nav">
              <Link href="/">Лоти</Link>
              <Link href="/criteria">Критерії</Link>
            </nav>
          </div>
        </header>
        <div className="wrap main">{children}</div>
        <footer className="site-footer">
          <div className="wrap">
            Моніторинг держаукціонів України · Prozorro.Sale + СЕТАМ · дані оновлює cron-збирач
          </div>
        </footer>
      </body>
    </html>
  );
}
