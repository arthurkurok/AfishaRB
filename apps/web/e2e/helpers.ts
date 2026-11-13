import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

export const API = process.env.API_BASE ?? "http://localhost:8000";

/** axe-core: WCAG 2.0/2.1/2.2 A и AA. Нарушения выводятся списком для отчёта. */
export async function expectAccessible(page: Page, opts: { include?: string; exclude?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (opts.include) builder = builder.include(opts.include);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const result = await builder.analyze();
  const summary = result.violations.map(
    (v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes[0]?.target}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
  return result;
}

/** Событие с ближайшими сеансами — для проверки паспорта (данные реальные, ID берём из API). */
export async function pickEventId(
  request: APIRequestContext,
  query = "when=month&categories=theatre&municipality=ufa&limit=5",
) {
  const res = await request.get(`${API}/v1/occurrences?${query}`);
  expect(res.ok()).toBeTruthy();
  const data = (await res.json()) as { items: { event: { id: string; image: unknown } }[] };
  const withImage = data.items.find((i) => i.event.image) ?? data.items[0];
  expect(withImage, "в API нет событий для теста").toBeTruthy();
  return withImage!.event.id;
}

/** Нет горизонтальной прокрутки (ПП 102 / WCAG 1.4.10: масштаб 200 % и ширина 320 CSS px). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "горизонтальная прокрутка страницы").toBeLessThanOrEqual(1);
}
