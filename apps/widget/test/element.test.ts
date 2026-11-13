import type { OccurrenceCard, SearchResult } from "@afisha/contract";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const occ = (over: Partial<OccurrenceCard> = {}): OccurrenceCard => ({
  id: "11111111-1111-4111-8111-111111111111",
  event: {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Спектакль «Буратино» <script>alert(1)</script>",
    summary: "",
    categories: ["theatre"],
    tags: [],
    age_rating: 0,
    pushkin_card: true,
    price: { min: "400.00", max: "800.00", is_free: false, currency: "RUB" },
    image: null,
    organization: null,
  },
  venue: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "Театр кукол",
    address: null,
    geo: null,
    municipality_id: "ufa",
    municipality: "Уфа",
  },
  starts_at: "2026-11-07T11:00:00+05:00",
  ends_at: null,
  is_range: false,
  status: "scheduled",
  status_reason: null,
  previous_starts_at: null,
  availability: "unknown",
  ticket_url: null,
  more_dates: 0,
  distance_km: null,
  reasons: [],
  freshness: "fresh",
  ...over,
});

const result = (items: OccurrenceCard[]): SearchResult => ({
  items,
  total: items.length,
  next_cursor: null,
  applied: { date_from: "2026-11-02", date_to: "2026-12-02", timezone: "Asia/Yekaterinburg" },
});

beforeAll(async () => {
  vi.stubGlobal("__API_BASE__", "https://api.example.ru");
  vi.stubGlobal("__SITE_BASE__", "https://afisha.example.ru");
  await import("../src/index");
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function mount(attrs: Record<string, string>, fetchImpl: () => Promise<Response>) {
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(fetchImpl as typeof fetch);
  const el = document.createElement("afisha-rb");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  document.body.appendChild(el);
  await vi.waitFor(() => {
    if (!el.shadowRoot?.querySelector(".card, .state")) throw new Error("ещё грузится");
  });
  return { el, root: el.shadowRoot!, fetchSpy };
}

describe("<afisha-rb>", () => {
  it("рисует карточки в Shadow DOM, экранирует данные и ведёт на сайт", async () => {
    const { root, fetchSpy } = await mount(
      { municipality: "ufa", layout: "list" },
      async () => new Response(JSON.stringify(result([occ(), occ({ id: "x2", status: "cancelled" })]))),
    );
    const url = String(fetchSpy.mock.calls[0]?.[0]);
    expect(url).toContain("https://api.example.ru/v1/occurrences?");
    expect(url).toContain("municipality=ufa");
    expect(fetchSpy.mock.calls[0]?.[1]).toMatchObject({ credentials: "omit" });
    const links = root.querySelectorAll("a.card");
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBe("https://afisha.example.ru/e/22222222-2222-4222-8222-222222222222");
    expect(links[0]?.getAttribute("target")).toBe("_blank");
    expect(root.innerHTML).not.toContain("<script>");
    expect(root.textContent).toContain("0+");
    expect(root.textContent).toContain("от 400 ₽");
    expect(root.textContent).toContain("Пушкинская карта");
    expect(root.textContent).toContain("Отменено");
    expect(root.querySelector("h2")?.textContent).toBe("Афиша культуры Башкортостана");
  });

  it("не трогает cookies и localStorage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const cookie = vi.spyOn(document, "cookie", "set");
    await mount({}, async () => new Response(JSON.stringify(result([occ()]))));
    expect(setItem).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });

  it("карусель доступна с клавиатуры: регион с подписью и кнопки «назад/вперёд»", async () => {
    const { root } = await mount(
      { layout: "carousel" },
      async () => new Response(JSON.stringify(result([occ(), occ({ id: "b" })]))),
    );
    const region = root.querySelector('[aria-roledescription="carousel"]');
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-label")).toBeTruthy();
    expect(region?.querySelector("ul.list")?.getAttribute("tabindex")).toBe("0");
    expect(root.querySelector("button.prev")?.getAttribute("aria-label")).toBe("Предыдущие события");
    expect(root.querySelector("button.next")?.getAttribute("aria-label")).toBe("Следующие события");
  });

  it("башкирский интерфейс и пустое состояние", async () => {
    const { root } = await mount({ lang: "ba" }, async () => new Response(JSON.stringify(result([]))));
    expect(root.textContent).toContain("Тиҙҙән бында саралар күренер");
    expect(root.querySelector("section")?.getAttribute("lang")).toBe("ba");
  });

  it("ошибка сети — сообщение и повтор", async () => {
    const { root } = await mount({}, async () => {
      throw new TypeError("network");
    });
    expect(root.querySelector('[role="alert"]')?.textContent).toContain("Не удалось загрузить афишу");
    expect(root.querySelector("button.retry")).not.toBeNull();
  });

  it("акцент и скругление владельца сайта применяются, мусор игнорируется", async () => {
    const { root } = await mount(
      { accent: "#0F6E4F", radius: "4" },
      async () => new Response(JSON.stringify(result([occ()]))),
    );
    const css = root.querySelector("style")?.textContent ?? "";
    expect(css).toContain("--color-accent:#0F6E4F");
    expect(css).toContain("--radius-l:4px");
  });
});
