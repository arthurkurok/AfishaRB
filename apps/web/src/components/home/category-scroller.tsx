/**
 * Навигатор категорий (ADR-017 — постерный редизайн): горизонтальная лента карточек-категорий
 * с иконкой и цветом; на десктопе — одна строка со скроллом, на мобильном — свайп.
 * Для скринридера — обычный список ссылок.
 */
import type { Category, CategoryCode } from "@afisha/contract";
import type { Translate } from "@afisha/i18n";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/brand/category-icon";
import type { Hrefs } from "@/lib/hrefs";
import { CATEGORY_CODES } from "@/lib/search-params";
import styles from "./category-scroller.module.css";

export function CategoryScroller({
  categories,
  t,
  hrefs,
  title,
}: {
  categories: Category[];
  t: Translate;
  hrefs: Hrefs;
  title?: string;
}) {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  const codes: CategoryCode[] = CATEGORY_CODES.filter((c) => byCode.has(c) || categories.length === 0);
  return (
    <nav className={styles.nav} aria-labelledby={title ? "categories-title" : undefined}>
      {title ? <h2 className="sr-only">{title}</h2> : null}
      <ul className={styles.list}>
        {codes.map((code) => {
          const c = byCode.get(code);
          const label = c?.title ?? t(`categories.${code}`);
          const style = { "--cat": `var(--color-category-${code})` } as CSSProperties;
          return (
            <li key={code} style={style}>
              <Link href={hrefs.search({ categories: [code] })} className={styles.item}>
                <span className={styles.icon}>
                  <CategoryIcon code={code} />
                </span>
                <span className={styles.name}>{label}</span>
                {c?.count ? <span className={styles.count}>{c.count}</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
