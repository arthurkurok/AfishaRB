import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Page } from "@playwright/test";
import { newSession, type Role, seal } from "../src/lib/session-crypto";

export const API = process.env.ADMIN_API_BASE ?? "http://localhost:8000";
export const ADMIN_TOKEN = process.env.E2E_ADMIN_TOKEN ?? "dev-admin-token";
export const SECRET = process.env.ADMIN_SESSION_SECRET ?? "e2e-session-secret-for-playwright-only-0001";
const here = dirname(fileURLToPath(import.meta.url));
export const FIXTURES_FILE = resolve(here, ".fixtures.json");
export const CREATED_FILE = resolve(here, ".created.json");

export interface Fixtures {
  run: string;
  org: { id: string; name: string; query: string };
  venue: { id: string; name: string };
  cabinetEvent: { id: string; title: string; occurrenceId: string; date: string };
  dedup: { a: string; b: string; titleA: string; titleB: string; taskId: string | null };
}

export function fixtures(): Fixtures {
  return JSON.parse(readFileSync(FIXTURES_FILE, "utf8")) as Fixtures;
}

/** Вход без формы: зашифрованная сессия с тем же секретом, что у тестового сервера (форму проверяет auth.spec). */
export async function signIn(context: BrowserContext, role: Role = "ministry", token = ADMIN_TOKEN) {
  const baseURL = new URL(process.env.ADMIN_BASE_URL ?? `http://localhost:${process.env.ADMIN_PORT ?? 3001}`);
  await context.addCookies([
    {
      name: "afisha_admin_session",
      value: seal(newSession(token, role), SECRET),
      domain: baseURL.hostname,
      path: "/",
      httpOnly: true,
      sameSite: "Strict",
    },
  ]);
}

/** axe-core: WCAG 2.0/2.1/2.2 A и AA. Нарушения выводятся списком для отчёта. */
export async function expectAccessible(page: Page, opts: { include?: string; exclude?: string[] } = {}) {
  let builder = new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]);
  if (opts.include) builder = builder.include(opts.include);
  for (const sel of opts.exclude ?? []) builder = builder.exclude(sel);
  const result = await builder.analyze();
  const summary = result.violations.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes
        .map((n) => n.target.join(" "))
        .slice(0, 3)
        .join(" | ")}`,
  );
  expect(summary, summary.join("\n")).toEqual([]);
  return result;
}

/** Нет горизонтальной прокрутки страницы (WCAG 1.4.10, ширина 320–390 CSS px). */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "горизонтальная прокрутка страницы").toBeLessThanOrEqual(1);
}

export async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return (await res.json()) as T;
}
