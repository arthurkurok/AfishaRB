/**
 * ВРЕМЕННЫЕ плейсхолдеры маскота — пчелы Бал (docs/07-design.md §3).
 * Геометрия без жёлто-чёрных полос: медовое тело и коралловый поясок-ҡусҡар, крылья с прожилками-ромбами.
 * Владелец заменит файлы assets/mascot-<emotion>.svg готовыми иллюстрациями (docs/13-owner-tasks.md, Б2):
 * после замены генератор нужно перестать вызывать для них (удалить эмоцию из EMOTIONS) — UI подхватит файлы как есть.
 * Цвета берутся только из tokens.json.
 */
import { colorTokens } from "./lib.mjs";

export const EMOTIONS = [
  "greeting",
  "thinking",
  "found",
  "clarify",
  "not-found",
  "celebrate",
  "night",
  "network-error",
  "loading",
  "reminder",
  "achievement",
  "thanks",
];

const rhombus = (cx, cy, r, fill, extra = "") =>
  `<path d="M${cx} ${cy - r}L${cx + r} ${cy}L${cx} ${cy + r}L${cx - r} ${cy}Z" fill="${fill}"${extra}/>`;

function palette(tokens) {
  const c = Object.fromEntries(colorTokens(tokens).map((t) => [t.name, t.light]));
  return {
    honey: c["color-honey"],
    coral: c["color-accent"],
    ink: c["color-ink"],
    ink2: c["color-ink-2"],
    white: c["color-surface"],
    meadow: c["color-meadow"],
    blue: c["color-focus"],
    line: c["color-line"],
    ochre: c["color-category-museum"],
  };
}

function bee(p, { eyes = "open", arms = "down" } = {}) {
  const wing = (cx, rot) =>
    `<g transform="rotate(${rot} ${cx} 66)"><ellipse cx="${cx}" cy="66" rx="26" ry="38" fill="${p.white}" fill-opacity=".8" stroke="${p.ink2}" stroke-width="2"/>` +
    `<path d="M${cx} 40L${cx + 10} 62L${cx} 84L${cx - 10} 62Z" fill="none" stroke="${p.line}" stroke-width="2"/></g>`;
  const eye = (x) =>
    eyes === "closed"
      ? `<path d="M${x - 6} 74q6 5 12 0" fill="none" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/>`
      : `<ellipse cx="${x}" cy="72" rx="6" ry="8" fill="${p.ink}"/><circle cx="${x + (eyes === "up" ? 1 : 2)}" cy="${eyes === "up" ? 67 : 69}" r="2.2" fill="${p.white}"/>`;
  const armsSvg = {
    down: `<path d="M60 126q-10 8-8 18M140 126q10 8 8 18" fill="none" stroke="${p.ink2}" stroke-width="4" stroke-linecap="round"/>`,
    wave: `<path d="M60 126q-10 8-8 18M140 122q14-10 18-30" fill="none" stroke="${p.ink2}" stroke-width="4" stroke-linecap="round"/>`,
    spread: `<path d="M60 124q-16-2-24-14M140 124q16-2 24-14" fill="none" stroke="${p.ink2}" stroke-width="4" stroke-linecap="round"/>`,
    hold: `<path d="M60 126q4 14 22 16M140 126q-4 14-22 16" fill="none" stroke="${p.ink2}" stroke-width="4" stroke-linecap="round"/>`,
  }[arms];
  return [
    wing(76, -28),
    wing(124, 28),
    `<ellipse cx="100" cy="130" rx="40" ry="46" fill="${p.honey}"/>`,
    // Поясок-ҡусҡар вместо полос: волна с двумя завитками.
    `<path d="M62 124q19 14 38 0t38 0" fill="none" stroke="${p.coral}" stroke-width="6" stroke-linecap="round"/>`,
    `<path d="M81 140c-6 0-6-8 0-8s6 10-3 10" fill="none" stroke="${p.coral}" stroke-width="3" stroke-linecap="round"/>`,
    `<path d="M119 140c6 0 6-8 0-8s-6 10 3 10" fill="none" stroke="${p.coral}" stroke-width="3" stroke-linecap="round"/>`,
    armsSvg,
    `<path d="M90 46L80 22M110 46l10-24" stroke="${p.ink2}" stroke-width="3" stroke-linecap="round"/>`,
    rhombus(80, 20, 6, p.coral),
    rhombus(120, 20, 6, p.coral),
    `<circle cx="100" cy="74" r="30" fill="${p.honey}"/>`,
    eye(89),
    eye(111),
    `<circle cx="80" cy="84" r="4" fill="${p.coral}" fill-opacity=".35"/><circle cx="120" cy="84" r="4" fill="${p.coral}" fill-opacity=".35"/>`,
  ].join("");
}

function emotion(name, p) {
  const smile = `<path d="M92 86q8 7 16 0" fill="none" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/>`;
  const flat = `<path d="M93 89h14" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/>`;
  const spiral = (dash) =>
    `<path d="M30 170c-20-40 10-80 50-70s40 60 10 60-20-30 0-30" fill="none" stroke="${p.ochre}" stroke-width="3" stroke-linecap="round"${dash ? ' stroke-dasharray="2 8"' : ""}/>`;
  switch (name) {
    case "greeting":
      return bee(p, { arms: "wave" }) + smile;
    case "thinking":
      return spiral(true) + bee(p, { eyes: "up" }) + flat;
    case "found":
      return (
        bee(p, { arms: "hold" }) +
        smile +
        `<rect x="74" y="132" width="52" height="40" rx="6" fill="${p.white}" stroke="${p.coral}" stroke-width="3"/>` +
        rhombus(100, 152, 10, p.coral)
      );
    case "clarify":
      return (
        `<g transform="rotate(-8 100 100)">${bee(p)}${flat}</g>` +
        [
          [156, 30],
          [166, 38],
          [168, 50],
          [160, 60],
          [152, 70],
          [152, 84],
        ]
          .map(([x, y]) => rhombus(x, y, 5, p.blue))
          .join("") +
        rhombus(152, 100, 6, p.blue)
      );
    case "not-found":
      return (
        bee(p, { arms: "spread" }) +
        `<path d="M92 90q8-6 16 0" fill="none" stroke="${p.ink}" stroke-width="3" stroke-linecap="round"/>` +
        rhombus(166, 104, 9, p.meadow)
      );
    case "celebrate":
      return (
        [
          [30, 40, p.coral],
          [170, 36, p.meadow],
          [40, 110, p.blue],
          [166, 120, p.coral],
          [56, 176, p.meadow],
          [150, 176, p.blue],
        ]
          .map(([x, y, c]) => rhombus(x, y, 7, c))
          .join("") +
        bee(p, { arms: "spread" }) +
        smile
      );
    case "night":
      return (
        `<path d="M100 8l64 37v74l-64 37-64-37V45z" fill="none" stroke="${p.honey}" stroke-width="4"/>` +
        bee(p, { eyes: "closed" }) +
        rhombus(150, 40, 5, p.blue) +
        rhombus(162, 26, 4, p.blue)
      );
    case "network-error":
      return (
        bee(p) +
        flat +
        `<path d="M146 60a20 20 0 0 1 24 0M140 50a32 32 0 0 1 36 0" fill="none" stroke="${p.ink2}" stroke-width="3" stroke-linecap="round"/>` +
        `<path d="M144 36l30 30" stroke="${p.coral}" stroke-width="4" stroke-linecap="round"/>`
      );
    case "loading":
      return spiral(true) + bee(p) + smile;
    case "reminder":
      return (
        bee(p, { arms: "wave" }) +
        smile +
        `<path d="M160 70a12 12 0 0 1 12 12v12l4 6h-32l4-6V82a12 12 0 0 1 12-12z" fill="${p.honey}" stroke="${p.ink2}" stroke-width="2"/>` +
        `<circle cx="160" cy="104" r="3" fill="${p.ink2}"/>`
      );
    case "achievement":
      return (
        bee(p, { arms: "hold" }) +
        smile +
        `<circle cx="100" cy="152" r="20" fill="${p.honey}" stroke="${p.coral}" stroke-width="3"/>` +
        rhombus(100, 152, 11, p.coral) +
        rhombus(100, 152, 5, p.white)
      );
    case "thanks":
      return (
        bee(p, { arms: "hold" }) +
        smile +
        `<path d="M100 172c-14-10-22-18-22-27a10 10 0 0 1 22-4 10 10 0 0 1 22 4c0 9-8 17-22 27z" fill="${p.coral}"/>`
      );
    default:
      throw new Error(`Неизвестная эмоция маскота: ${name}`);
  }
}

/** Возвращает пары [имя файла, SVG] для каталога assets/. */
export function renderAssets(tokens) {
  const p = palette(tokens);
  return EMOTIONS.map((name) => [
    `mascot-${name}.svg`,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">` +
      `<title>Пчела Бал (${name})</title><!-- Временный плейсхолдер. Сгенерирован scripts/mascot.mjs; заменить ассетом владельца. -->` +
      `${emotion(name, p)}</svg>\n`,
  ]);
}
