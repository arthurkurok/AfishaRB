/**
 * Геометрия «Живого орнамента» (07-design §1, §6): ҡусҡар (завиток-«рога») и ромб.
 * Функции возвращают строки SVG-путей — их используют обложки, кайма, навигатор-зонтик и Mini App.
 */

/** Ромб с центром (cx, cy) и полудиагональю r. */
export function rhombusPath(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z`;
}

/**
 * Один завиток ҡусҡар: стебель поднимается и закручивается внутрь спиралью.
 * (x, y) — основание, s — размер, dir = 1 (вправо) или −1 (влево).
 */
export function kuskarCurl(x: number, y: number, s: number, dir: 1 | -1 = 1): string {
  const p = (dx: number, dy: number) => `${+(x + dx * s * dir).toFixed(2)} ${+(y + dy * s).toFixed(2)}`;
  return `M${p(0, 0)}C${p(0, -0.9)} ${p(0.75, -1.15)} ${p(1, -0.6)}C${p(1.2, -0.15)} ${p(0.75, 0.1)} ${p(0.55, -0.15)}C${p(0.4, -0.35)} ${p(0.6, -0.5)} ${p(0.72, -0.38)}`;
}

/** Пара завитков-«рогов» ҡусҡар, симметричных относительно оси. */
export function kuskarPair(cx: number, y: number, s: number): string {
  return `${kuskarCurl(cx, y, s, 1)}${kuskarCurl(cx, y, s, -1)}`;
}

/** Детерминированный генератор псевдослучайных чисел из строки (вариации обложек одного события стабильны). */
export function seeded(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return ((h >>> 0) % 10_000) / 10_000;
  };
}

/** Срез ҡусҡар в правом верхнем углу постера: вогнутый срез (заливка цветом поверхности) и завиток-продолжение. */
export const CORNER_CUT_PATH = "M40 0H6C6 19 21 34 40 34Z";
export const CORNER_CURL_PATH = "M24 30.2C20 36.5 11.5 36.5 11.5 30.5C11.5 25.5 18 25.2 18.2 29.4";
