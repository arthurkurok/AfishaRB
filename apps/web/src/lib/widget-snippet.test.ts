import { describe, expect, it } from "vitest";
import { componentSnippet, embedQuery, iframeSnippet, type WidgetOptions } from "./widget-snippet";

const base: WidgetOptions = {
  municipality: "ufa",
  categories: ["theatre", "music"],
  free: false,
  pushkin: true,
  age: "",
  limit: 8,
  layout: "carousel",
  period: "weekend",
  height: 480,
  lang: "ru",
  theme: "auto",
  accent: "#B8322A",
  radius: 14,
  organization: "",
  venue: "",
};

describe("сниппет виджета", () => {
  it("веб-компонент: только заданные атрибуты, акцент по умолчанию не дублируется", () => {
    const s = componentSnippet(base, {
      widgetSrc: "https://cdn.example/afisha.js",
      apiBase: "https://api.example",
      accent: "#b8322a",
    });
    expect(s).toContain('<script src="https://cdn.example/afisha.js" type="module" async></script>');
    expect(s).toContain('municipality="ufa"');
    expect(s).toContain('categories="theatre,music"');
    expect(s).toContain('pushkin="true"');
    expect(s).toContain('period="weekend"');
    expect(s).toContain('height="480"');
    expect(s).not.toContain("accent=");
    expect(s).not.toContain("radius=");
  });

  it("iframe: адрес /embed с теми же параметрами и проверкой origin в postMessage", () => {
    const s = iframeSnippet(
      { ...base, accent: "#0F6E4F", organization: '"><x' },
      { siteUrl: "https://afisha.example", accent: "#B8322A", title: "Афиша" },
    );
    expect(s).toContain("https://afisha.example/embed?");
    expect(s).toContain('e.origin !== "https://afisha.example"');
    expect(s).not.toContain('"><x');
    expect(embedQuery(base, { accent: "#B8322A" })).toBe(
      "municipality=ufa&categories=theatre%2Cmusic&pushkin=true&layout=carousel&period=weekend&limit=8&height=480&lang=ru&theme=auto",
    );
    expect(s).toContain("min-height:480px");
  });
});
