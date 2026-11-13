/**
 * Генерируемая обложка события без фото (07-design §8, 03-functional-spec §1.5 п. 1):
 * фон — цвет категории, узор из ромбов и завитков ҡусҡар, крупный мотив категории, кайма-орнамент.
 * Вариации детерминированы ID события: у одного события всегда одна и та же обложка.
 * Цвета — только CSS-переменные токенов.
 */
import type { CategoryCode } from "@afisha/contract";
import { kuskarCurl, kuskarPair, rhombusPath, seeded } from "./ornament";

const MOTIF: Record<CategoryCode, (cx: number, cy: number, s: number) => string> = {
  theatre: (cx, cy, s) =>
    `M${cx - s} ${cy - s * 0.6}c${s * 0.6}-${s * 0.4} ${s * 1.4}-${s * 0.4} ${s * 2} 0v${s * 0.7}c0 ${s * 0.9}-${s * 0.5} ${s * 1.5}-${s} ${s * 1.5}s-${s}-${s * 0.6}-${s}-${s * 1.5}z` +
    kuskarCurl(cx - s * 0.55, cy + s * 0.05, s * 0.32, 1) +
    kuskarCurl(cx + s * 0.55, cy + s * 0.05, s * 0.32, -1),
  music: (cx, cy, s) =>
    `M${cx - s * 0.9} ${cy + s}L${cx + s * 0.2} ${cy - s}` +
    kuskarCurl(cx + s * 0.25, cy + s * 0.1, s * 0.55, 1) +
    kuskarCurl(cx + s * 0.55, cy + s * 0.45, s * 0.8, 1),
  museum: (cx, cy, s) => rhombusPath(cx, cy, s) + rhombusPath(cx, cy, s * 0.55) + rhombusPath(cx, cy, s * 0.15),
  kids: (cx, cy, s) => {
    let d = `M${cx + s * 0.45} ${cy}a${s * 0.45} ${s * 0.45} 0 1 1-${s * 0.9} 0a${s * 0.45} ${s * 0.45} 0 1 1 ${s * 0.9} 0`;
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI / 4) * i;
      const x1 = cx + Math.cos(a) * s * 0.65;
      const y1 = cy + Math.sin(a) * s * 0.65;
      const x2 = cx + Math.cos(a) * s;
      const y2 = cy + Math.sin(a) * s;
      d += `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
    return d;
  },
  folk: (cx, cy, s) =>
    `M${cx} ${cy + s}V${cy - s * 0.5}` +
    kuskarPair(cx, cy + s * 0.35, s * 0.6) +
    kuskarPair(cx, cy - s * 0.15, s * 0.42) +
    rhombusPath(cx, cy - s * 0.75, s * 0.18),
  cinema: (cx, cy, s) =>
    rhombusPath(cx, cy, s) + `M${cx - s * 0.18} ${cy - s * 0.32}v${s * 0.64}l${s * 0.5}-${s * 0.32}z`,
  education: (cx, cy, s) =>
    `M${cx} ${cy + s * 0.8}c-${s * 1.2}-${s * 0.8}-${s * 1.6}-${s * 1.3}-${s * 1.4}-${s * 1.9}a${s * 0.5} ${s * 0.5} 0 0 1 ${s * 1.4} -${s * 0.1}a${s * 0.5} ${s * 0.5} 0 0 1 ${s * 1.4} ${s * 0.1}c${s * 0.2} ${s * 0.6}-${s * 0.2} ${s * 1.1}-${s * 1.4} ${s * 1.9}z` +
    kuskarPair(cx, cy - s * 0.2, s * 0.32),
};

export function CategoryArt({
  category,
  seed,
  className,
  title,
}: {
  category: CategoryCode;
  seed: string;
  className?: string;
  /** Если задан — иллюстрация озвучивается скринридером, иначе декоративна. */
  title?: string;
}) {
  const rnd = seeded(seed);
  const W = 320;
  const H = 180;
  const step = 40 + Math.round(rnd() * 12);
  const offset = Math.round(rnd() * step);
  const motifX = 200 + Math.round(rnd() * 60);
  const motifY = 78 + Math.round(rnd() * 16);
  const motifSize = 44 + Math.round(rnd() * 10);

  // Фоновая сетка: ромбы и пары завитков в шахматном порядке.
  let rhombi = "";
  let curls = "";
  for (let row = 0, y = 12; y < H + step; row++, y += step * 0.6) {
    for (let x = -offset + (row % 2 ? step / 2 : 0); x < W + step; x += step) {
      if ((row + Math.round(x / step)) % 3 === 0) curls += kuskarPair(x, y + 6, 7);
      else rhombi += rhombusPath(Math.round(x), Math.round(y), 5);
    }
  }
  // Кайма снизу: ряд ромбов (как орнамент по краю одежды).
  let border = "";
  for (let x = 8; x < W; x += 16) border += rhombusPath(x, H - 9, 4);

  const fill = `var(--color-category-${category})`;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      <rect width={W} height={H} style={{ fill }} />
      <path d={rhombi} style={{ fill: "var(--color-on-category)", fillOpacity: 0.1 }} />
      <path
        d={curls}
        style={{
          fill: "none",
          stroke: "var(--color-on-category)",
          strokeOpacity: 0.16,
          strokeWidth: 2,
          strokeLinecap: "round",
        }}
      />
      <circle cx={motifX} cy={motifY} r={motifSize * 1.25} style={{ fill: "var(--color-honey)", fillOpacity: 0.9 }} />
      <path
        d={MOTIF[category](motifX, motifY, motifSize)}
        style={{
          fill: "none",
          stroke: fill,
          strokeWidth: 5,
          strokeLinecap: "round",
          strokeLinejoin: "round",
        }}
      />
      <path d={border} style={{ fill: "var(--color-honey)" }} />
    </svg>
  );
}
