#!/usr/bin/env node
// Снимает фикстуры для тестов AfishaKit из живого API (реальные данные РБ).
// Тесты декодирования проверяют, что сгенерированные типы совпадают с тем, что реально отдаёт
// сервер, а не только с контрактом.
//
// Запуск: node Scripts/capture-fixtures.mjs [http://localhost:8000]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? process.env.AFISHA_API ?? "http://localhost:8000";
const out = join(dirname(fileURLToPath(import.meta.url)), "..", "AfishaKit", "Tests", "AfishaKitTests", "Fixtures");
mkdirSync(out, { recursive: true });

async function get(path) {
  const res = await fetch(base + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

async function post(path, body) {
  const res = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.json();
}

function save(name, data) {
  writeFileSync(join(out, name), `${JSON.stringify(data, null, 2)}\n`);
  console.log(`✓ ${name}`);
}

const today = await get("/v1/occurrences?when=today&limit=10&lang=ru");
save("search-today.json", today);
const week = await get("/v1/occurrences?when=week&municipality=ufa&limit=20&lang=ru");
save("search-week-ufa.json", week);
save("search-weekend-ba.json", await get("/v1/occurrences?when=weekend&limit=10&lang=ba"));
save("search-free-kids.json", await get("/v1/occurrences?when=week&free=true&categories=kids&limit=10"));

// Паспорт события: берём событие с несколькими сеансами, если есть
const candidates = [...week.items, ...today.items];
const multi = candidates.find((c) => c.more_dates > 0) ?? candidates[0];
save("event-detail.json", await get(`/v1/events/${multi.event.id}?lang=ru`));
save("event-detail-ba.json", await get(`/v1/events/${candidates[1]?.event.id ?? multi.event.id}?lang=ba`));

save("categories-ru.json", await get("/v1/categories?lang=ru"));
save("categories-ba.json", await get("/v1/categories?lang=ba"));
save("municipalities-ba.json", await get("/v1/municipalities?lang=ba"));
save("stats.json", await get("/v1/stats"));

// Выдача Гида: отвечаем на уточнения первым вариантом, пока не придут карточки
let reply = await post("/v1/assistant", { text: "куда сходить с ребёнком 5 лет на неделе в Уфе до 1000 рублей за билет", lang: "ru" });
for (let i = 0; i < 3 && reply.kind === "clarify"; i++) {
  reply = await post("/v1/assistant", { conversation_id: reply.conversation_id, patch: reply.clarify.options[0].patch, lang: "ru" });
}
save("assistant-results.json", reply);
save("assistant-clarify.json", await post("/v1/assistant", { text: "сходить с ребёнком в субботу", lang: "ru" }));
save("assistant-help.json", await post("/v1/assistant", { text: "привет", lang: "ru" }));
save("assistant-offtopic.json", await post("/v1/assistant", { text: "какая завтра погода", lang: "ru" }));

const notFound = await fetch(`${base}/v1/events/00000000-0000-7000-8000-000000000000`);
save("problem-404.json", await notFound.json());
