"use client";
/**
 * Форма импорта (ТЗ 6.1): файл выбирается или перетаскивается в зону, «Импортировать» записывает,
 * «Проверить без записи» — сухой прогон. Результат — счётчики и таблица отклонённых строк с причинами;
 * состояние кнопки и итог — в живых областях, фокус после загрузки не теряется.
 */
import { type DragEvent, useId, useRef, useState, useTransition } from "react";
import { Icon } from "@/components/ui/icons";
import { StatRow, StatTile } from "@/components/ui/stat-tile";
import { TableWrap } from "@/components/ui/table-wrap";
import { importEvents } from "@/lib/actions/import";
import type { ImportReport } from "@/lib/admin-types";
import styles from "./import-form.module.css";

const ACCEPT = ".csv,.json";
const NAME_OK = /\.(csv|json)$/i;
/** В таблице показываем первые 50 причин — дальше список перестаёт быть обозримым. */
const SHOW_REJECTED = 50;

export function ImportForm() {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [pending, startTransition] = useTransition();

  const pick = (f: File | null) => {
    setReport(null);
    if (!f) {
      setFailure(null);
      return;
    }
    if (!NAME_OK.test(f.name)) {
      setFile(null);
      setFailure(`«${f.name}»: поддерживаются файлы .csv и .json`);
      return;
    }
    setFailure(null);
    setFile(f);
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    pick(e.dataTransfer.files?.[0] ?? null);
  };

  const submit = (dryRun: boolean) => {
    if (!file) {
      setFailure("Выберите файл CSV или JSON");
      inputRef.current?.focus();
      return;
    }
    startTransition(async () => {
      const res = await importEvents(file, dryRun);
      if (res.ok) {
        setReport(res.report);
        setFailure(null);
      } else {
        setReport(null);
        setFailure(res.message);
      }
    });
  };

  const disabled = pending || !file;
  return (
    <div className="stack">
      <form
        className="card stack"
        aria-labelledby={`${uid}-title`}
        onSubmit={(e) => {
          e.preventDefault();
          submit(false);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <h2 id={`${uid}-title`}>Файл со списком событий</h2>
        <div className={`${styles.dropzone} ${dragging ? styles.dropzoneActive : ""}`}>
          <Icon name="download" size={28} />
          <label htmlFor={`${uid}-file`} className={styles.fileLabel}>
            <span>Перетащите файл сюда или выберите на компьютере</span>
            <span className="caption">CSV или JSON, до 5 МБ</span>
          </label>
          <input
            ref={inputRef}
            id={`${uid}-file`}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          {file ? (
            <p className={styles.chosen}>
              <Icon name="check" size={16} />
              <span>
                <strong>{file.name}</strong> ·{" "}
                {(file.size / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} КБ
              </span>
            </p>
          ) : null}
        </div>

        {failure ? (
          <p className="notice notice--error" role="alert">
            <Icon name="alert" />
            <span>{failure}</span>
          </p>
        ) : null}

        <p className="caption" aria-live="polite">
          {pending ? "Загружаем и обрабатываем…" : report ? "Готово. Результат ниже." : ""}
        </p>

        <div className={styles.buttons}>
          <button type="submit" className="btn btn--primary" disabled={disabled} aria-busy={pending || undefined}>
            Импортировать
          </button>
          <button type="button" className="btn btn--secondary" disabled={disabled} onClick={() => submit(true)}>
            Проверить без записи
          </button>
        </div>
      </form>

      {report ? <ImportReportView report={report} /> : null}
    </div>
  );
}

function ImportReportView({ report }: { report: ImportReport }) {
  const shown = report.rejected.slice(0, SHOW_REJECTED);
  const hidden = report.rejected.length - shown.length;
  return (
    <section className="card stack" aria-labelledby="import-report-title">
      <h2 id="import-report-title">{report.dry_run ? "Проверка без записи" : "Отчёт импорта"}</h2>
      <p className="caption">
        {report.filename ?? "файл"} · {report.format === "csv" ? "CSV" : "JSON"} · строк в файле: {report.total}
      </p>
      <StatRow label="Итоги по строкам">
        <StatTile label="Добавлено" value={report.added} meter={report.total ? report.added / report.total : null} />
        <StatTile
          label="Обновлено"
          value={report.updated}
          meter={report.total ? report.updated / report.total : null}
        />
        <StatTile
          label="Без изменений"
          value={report.unchanged}
          meter={report.total ? report.unchanged / report.total : null}
        />
        <StatTile
          label="Отклонено"
          value={report.rejected.length}
          meter={report.total ? report.rejected.length / report.total : null}
        />
      </StatRow>

      {report.rejected.length > 0 ? (
        <TableWrap label="Отклонённые строки">
          <table className="table">
            <caption>Отклонённые строки: номер строки в файле и причина</caption>
            <thead>
              <tr>
                <th scope="col" className="num">
                  Строка
                </th>
                <th scope="col">Причина</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.row}>
                  <td className="num">{r.row}</td>
                  <td>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {hidden > 0 ? (
            <p className={`${styles.more} caption`}>…и ещё {hidden} — полный перечень в отчёте CLI или API</p>
          ) : null}
        </TableWrap>
      ) : (
        <p className="notice notice--ok">
          <Icon name="check" />
          <span>Отклонённых строк нет — все строки файла обработаны.</span>
        </p>
      )}
    </section>
  );
}
