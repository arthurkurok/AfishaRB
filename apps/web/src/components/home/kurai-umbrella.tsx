/**
 * Навигатор категорий «зонтик курая» (07-design §7, 03-functional-spec §1.1): лучи соцветия расходятся
 * из одной точки, на концах — иконки категорий в ромбах. Это НЕ семилепестковый цветок в круге (госсимволика РБ).
 * На узком контейнере — горизонтальная лента «лучей». Для скринридера — обычный список ссылок.
 */
import type { Category, CategoryCode } from "@afisha/contract";
import type { Translate } from "@afisha/i18n";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryIcon } from "@/brand/category-icon";
import { rhombusPath } from "@/brand/ornament";
import { formatRub } from "@/lib/format";
import type { Hrefs } from "@/lib/hrefs";
import { CATEGORY_CODES } from "@/lib/search-params";
import styles from "./kurai-umbrella.module.css";

const W = 1000;
const H = 540;
const OX = 500;
const OY = 520;
const R = 380;

function geometry(i: number, n: number) {
  const angle = ((160 - (140 / (n - 1)) * i) * Math.PI) / 180;
  const x = OX + R * Math.cos(angle);
  const y = OY - R * Math.sin(angle) * 1.02;
  // Луч чуть изогнут — как живой стебель соцветия.
  const bend = (i - (n - 1) / 2) * 14;
  const cx = OX + (x - OX) * 0.5 - bend;
  const cy = OY + (y - OY) * 0.55;
  const seedX = OX + (x - OX) * 0.62;
  const seedY = OY + (y - OY) * 0.62;
  return { x, y, d: `M${OX} ${OY}Q${cx.toFixed(1)} ${cy.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`, seedX, seedY };
}

export function KuraiUmbrella({
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
    <nav className={styles.nav} aria-labelledby="kurai-title">
      <div className={styles.head}>
        <h2 id="kurai-title">{title ?? t("categories.umbrellaTitle")}</h2>
        <p className="caption">{t("categories.umbrellaHint")}</p>
      </div>
      <div className={styles.stage}>
        <svg className={styles.stem} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
          <path d={`M${OX} ${OY}V${H}`} />
          <path d={rhombusPath(OX, OY, 9)} className={styles.origin} />
        </svg>
        <ul className={styles.list}>
          {codes.map((code, i) => {
            const g = geometry(i, codes.length);
            const cat = byCode.get(code);
            const style = {
              "--x": `${(g.x / W) * 100}%`,
              "--y": `${(g.y / H) * 100}%`,
              "--cat": `var(--color-category-${code})`,
            } as CSSProperties;
            return (
              <li key={code} className={styles.item} style={style}>
                <svg className={styles.ray} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
                  <path d={g.d} />
                  <path d={rhombusPath(g.seedX, g.seedY, 6)} className={styles.seed} />
                </svg>
                <Link href={hrefs.search({ categories: [code] })} className={styles.link}>
                  <span className={styles.node}>
                    <CategoryIcon code={code} size={28} />
                  </span>
                  <span className={styles.label}>{cat?.title ?? t(`categories.${code}`)}</span>
                  {cat?.count ? <span className={styles.count}>{formatRub(cat.count)}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
