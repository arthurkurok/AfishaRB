import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="container page">
      <div className="card stack" style={{ maxWidth: 640 }}>
        <h1>Такой страницы нет</h1>
        <p className="muted">Возможно, ссылка устарела.</p>
        <div>
          <Link href="/" className="btn btn--primary">
            На главную рабочего места
          </Link>
        </div>
      </div>
    </main>
  );
}
