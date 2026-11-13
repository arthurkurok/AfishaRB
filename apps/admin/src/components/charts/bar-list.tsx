/**
 * Ранжированные горизонтальные столбики на CSS (dataviz: одна серия — один цвет, тонкая метка ≤ 24 px,
 * скругление 4 px только на конце данных, значение у конца столбика, волосяная базовая линия).
 * Это список: скринридер читает «название — значение», цвет ничего не кодирует. Детали — во всплывающей
 * подсказке при наведении и полностью — в табличном виде карточки.
 */
import { Icon } from "@/components/ui/icons";
import styles from "./bar-list.module.css";

export interface BarItem {
  key: string;
  label: string;
  value: number;
  /** Текст значения, если нужен не просто числом */
  valueText?: string;
  /** Подсказка при наведении: дополнительные показатели */
  details?: string;
  /** Отметка (иконка + текст), например «культурная пустыня» */
  flag?: string;
}

const fmt = new Intl.NumberFormat("ru-RU");

export function BarList({ items, label, start = 1 }: { items: BarItem[]; label: string; start?: number }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ol className={styles.list} aria-label={label} start={start}>
      {items.map((item) => {
        const width = item.value > 0 ? Math.max(0.6, (item.value / max) * 100) : 0;
        const value = item.valueText ?? fmt.format(item.value);
        return (
          <li key={item.key} className={styles.row} data-flag={item.flag ? "true" : undefined}>
            <span className={styles.label}>
              <span>{item.label}</span>
              {item.flag ? (
                <span className={styles.flag}>
                  <Icon name="alert" size={14} />
                  {item.flag}
                </span>
              ) : null}
            </span>
            <span className={styles.plot}>
              <span className={styles.bar} style={{ inlineSize: `${width}%` }} aria-hidden="true" />
              <span className={`${styles.value} num`}>
                <span className="sr-only">: </span>
                {value}
              </span>
            </span>
            {item.details ? (
              <span className={styles.tip} aria-hidden="true">
                <strong className="num">{value}</strong> {item.details}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
