/**
 * Индекс полноты данных учреждения 0–100 с подсказками (03-functional-spec §7, «Качество данных»):
 * что заполнить, чтобы карточки поднялись в выдаче, и какие карточки дополнить первыми.
 */
import { Icon } from "@/components/ui/icons";
import type { CabinetQuality } from "@/lib/cabinet";
import { siteEventUrl } from "@/lib/config";
import { QUALITY_LEVEL_LABEL, qualityLevel } from "@/lib/quality";
import styles from "./quality-panel.module.css";

export function QualityPanel({ quality }: { quality: CabinetQuality }) {
  const { index } = quality;
  const level = index === null ? null : qualityLevel(index);
  return (
    <section className="card stack" aria-labelledby="quality-title">
      <h2 id="quality-title">Полнота данных</h2>
      {index === null || level === null ? (
        <p className="muted">Пока нечего оценить: у учреждения нет ближайших событий.</p>
      ) : (
        <div className={styles.score}>
          <p className={styles.value}>
            <strong>{index}</strong>
            <span className="muted"> из 100</span>
          </p>
          <div className={styles.meterWrap}>
            <span className={styles.meter} data-level={level} aria-hidden="true">
              <span style={{ inlineSize: `${index}%` }} />
            </span>
            <span className="caption">
              Уровень: <strong>{QUALITY_LEVEL_LABEL[level]}</strong>.{" "}
              {quality.source === "pulse"
                ? `По всем событиям учреждения (данные «Пульса культуры»${quality.pulseRow ? `: без фото — ${quality.pulseRow.no_image}, без цены — ${quality.pulseRow.no_price}` : ""}).`
                : `Оценка по ${quality.sample} ближайшим событиям.`}
            </span>
          </div>
        </div>
      )}

      {quality.hints.length ? (
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <h3>Что улучшить</h3>
          <ul className="rhombus-list stack" style={{ gap: "var(--space-2)" }}>
            {quality.hints.map((h) => (
              <li key={h.key}>{h.text}</li>
            ))}
          </ul>
        </div>
      ) : index !== null ? (
        <p className="notice notice--ok">
          <Icon name="check" /> Карточки ближайших событий заполнены полностью.
        </p>
      ) : null}

      {quality.weakest.length ? (
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <h3>Дополнить в первую очередь</h3>
          <ul className={styles.weak}>
            {quality.weakest.map((w) => (
              <li key={w.id}>
                <a href={siteEventUrl(w.id)} target="_blank" rel="noreferrer">
                  {w.title}
                  <span className="sr-only"> (откроется в новой вкладке)</span>
                </a>
                <span className="caption">
                  {w.score !== null ? `индекс ${w.score} · ` : ""}нет: {w.missing.map((m) => m.label).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="caption">
        Индекс считает API по каждой карточке: возрастной знак, фото, описание, цена, ссылка на билеты, доступная среда,
        координаты площадки, название на башкирском и длительность.
      </p>
    </section>
  );
}
