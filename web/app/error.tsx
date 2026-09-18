'use client';
export default function ErrorPage({reset}:{reset:()=>void}) {
  return <main><div className="notice">Не вдалося завантажити дані. Спробуйте ще раз.</div><button className="btn" onClick={reset}>Повторити</button></main>;
}
