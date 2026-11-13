/**
 * Схематичная карта республики: ромбы в центрах муниципалитетов, размер — число предстоящих событий.
 * Подложка — выпуклая оболочка центров (без политической раскраски, 07-design §7). Декоративна:
 * доступная альтернатива — список муниципалитетов рядом.
 */
import type { Municipality } from "@afisha/contract";
import { rhombusPath } from "@/brand/ornament";
import styles from "./muni-map.module.css";

type Pt = [number, number];

function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Pt[] = [];
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

export function MuniMap({
  municipalities,
  hrefFor,
  highlight,
  labelTop = 8,
  interactive = true,
}: {
  municipalities: Municipality[];
  hrefFor: (id: string) => string;
  highlight?: string;
  labelTop?: number;
  /** false — карта внутри ссылки: маркеры без собственных ссылок. */
  interactive?: boolean;
}) {
  const withGeo = municipalities.filter((m): m is Municipality & { center: [number, number] } => !!m.center);
  if (!withGeo.length) return null;
  const k = Math.cos((54 * Math.PI) / 180);
  const xs = withGeo.map((m) => m.center[1] * k);
  const ys = withGeo.map((m) => -m.center[0]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const spanX = Math.max(...xs) - minX || 1;
  const spanY = Math.max(...ys) - minY || 1;
  const W = 600;
  const pad = 40;
  const scale = (W - pad * 2) / spanX;
  const H = Math.round(spanY * scale + pad * 2);
  const project = (m: { center: [number, number] }): Pt => [
    pad + (m.center[1] * k - minX) * scale,
    pad + (-m.center[0] - minY) * scale,
  ];
  const outline = hull(withGeo.map(project));
  const maxUp = Math.max(1, ...withGeo.map((m) => m.upcoming ?? 0));
  const labelled = new Set(
    [...withGeo]
      .sort((a, b) => (b.upcoming ?? 0) - (a.upcoming ?? 0))
      .slice(0, labelTop)
      .map((m) => m.id),
  );
  return (
    <svg className={styles.map} viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false">
      <path className={styles.land} d={`M${outline.map((p) => p.map((v) => v.toFixed(1)).join(" ")).join("L")}Z`} />
      {withGeo.map((m) => {
        const [x, y] = project(m);
        const r = 4 + Math.sqrt((m.upcoming ?? 0) / maxUp) * 16;
        const body = (
          <>
            <path d={rhombusPath(+x.toFixed(1), +y.toFixed(1), +r.toFixed(1))} />
            {labelled.has(m.id) || m.id === highlight ? (
              <text x={x} y={y + r + 14} textAnchor="middle">
                {m.name}
              </text>
            ) : null}
          </>
        );
        return interactive ? (
          <a
            key={m.id}
            href={hrefFor(m.id)}
            tabIndex={-1}
            className={styles.marker}
            data-active={m.id === highlight || undefined}
          >
            {body}
          </a>
        ) : (
          <g key={m.id} className={styles.marker} data-active={m.id === highlight || undefined}>
            {body}
          </g>
        );
      })}
    </svg>
  );
}
