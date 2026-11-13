/** Фавикон: ромб «Афиша РБ» в цветах токенов (SVG, масштабируется для PWA). */
import { colors } from "@afisha/design-tokens";

export const dynamic = "force-static";

export function GET() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 1 31 16 16 31 1 16Z" fill="${colors["color-accent"].light}"/><path d="M16 10 22 16 16 22 10 16Z" fill="${colors["color-honey"].light}"/></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}
