/** Пока сервер собирает данные — короткое состояние загрузки (объявляется скринридеру). */
export default function Loading() {
  return (
    <p role="status" className="muted">
      Загружаем данные…
    </p>
  );
}
