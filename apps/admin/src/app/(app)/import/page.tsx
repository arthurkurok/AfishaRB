/**
 * Импорт афиши из файла (ТЗ 6.1): CSV или JSON, роль «Министерство». Загрузка идёт через Admin API
 * (POST /admin/import). Отчёт показывает добавленные, обновлённые, без изменений и отклонённые строки
 * с причинами; повторная загрузка того же файла дубликатов не создаёт.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ImportForm } from "@/components/import/import-form";
import { TableWrap } from "@/components/ui/table-wrap";
import { requireSession } from "@/lib/session";

export const metadata: Metadata = { title: "Импорт афиши" };

const COLUMNS: Array<[string, string, boolean]> = [
  ["title", "название события", true],
  ["category", "категория: концерт, спектакль, выставка, фестиваль, кино, экскурсия, мастер-класс, другое…", false],
  ["tags", "теги через «;»: музыка; для всей семьи", false],
  ["date_start", "дата начала: 2027-03-14T18:00:00+05:00 или 14.03.2027 18:00", true],
  ["date_end", "дата окончания (необязательно)", false],
  ["duration_min", "длительность в минутах, если нет даты окончания", false],
  ["city", "город или район", true],
  ["venue", "площадка", true],
  ["address", "адрес", false],
  ["lat / lon", "координаты", false],
  ["description", "описание — абзацы разделяйте пустой строкой", false],
  ["price_min / price_max", "цена текстом: «от 300 до 800», «вход свободный»", false],
  ["is_free", "да / нет", false],
  ["age_limit", "возрастной знак: 0, 6, 12, 16, 18 — обязателен по 436-ФЗ", true],
  ["language", "ru или ba", false],
  ["org_link", "ссылка на организатора", false],
  ["source_url", "ссылка на источник", false],
  ["status", "опубликовано (по умолчанию), черновик или отменено", false],
];

export default async function ImportPage() {
  const session = await requireSession("/import");
  if (session.role !== "ministry") redirect("/cabinet");

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Импорт афиши</h1>
          <p className="muted">
            Загрузите список событий одним файлом — CSV или JSON. Отчёт покажет, что добавилось, что обновилось и какие
            строки отклонены с причинами.
          </p>
        </div>
      </div>

      <div className="grid-2">
        <ImportForm />

        <div className="stack">
          <section className="card stack" aria-labelledby="import-help-title">
            <h2 id="import-help-title">Как подготовить файл</h2>
            <ul className="rhombus-list stack">
              <li>
                Первая строка CSV — заголовки колонок; разделитель запятая или точка с запятой, текст в кавычках может
                содержать запятые и переводы строк. JSON — массив объектов или {"{events: […]}"}
              </li>
              <li>
                Обязательные поля: <strong>title, date_start, city, venue, age_limit</strong>. Строка без возрастного
                знака отклоняется (436-ФЗ) — в причине будет написано.
              </li>
              <li>
                Даты — ISO 8601 или «ДД.ММ.ГГГГ ЧЧ:ММ»; без времени дата начала считается с 00:00, окончания — до
                23:59:59. Без смещения — часовой пояс региона (+05:00, Уфа).
              </li>
              <li>
                Цены — текстом: «от 300 до 800», «вход свободный». Повторная загрузка того же файла не создаёт
                дубликатов: строки попадут в «без изменений».
              </li>
              <li>
                «Проверить без записи» показывает отчёт, ничего не меняя. Черновики уходят в модерацию, «отменено» гасит
                сеансы события.
              </li>
            </ul>
          </section>

          <details className="card">
            <summary>Все колонки файла</summary>
            <TableWrap label="Колонки файла импорта">
              <table className="table">
                <thead>
                  <tr>
                    <th scope="col">Колонка</th>
                    <th scope="col">Что указать</th>
                    <th scope="col">Обязательна</th>
                  </tr>
                </thead>
                <tbody>
                  {COLUMNS.map(([name, hint, required]) => (
                    <tr key={name}>
                      <td>
                        <code>{name}</code>
                      </td>
                      <td>{hint}</td>
                      <td>{required ? "да" : "нет"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          </details>
        </div>
      </div>
    </>
  );
}
