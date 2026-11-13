import { Icon } from "./icons";

/** Ссылка на выгрузку таблицы в CSV (файл формирует сервер, токен в браузер не попадает). */
export function CsvLink({ href, title }: { href: string; title: string }) {
  return (
    <a href={href} download className="btn btn--secondary btn--small" aria-label={`Скачать «${title}» в CSV`}>
      <Icon name="download" size={18} />
      CSV
    </a>
  );
}
