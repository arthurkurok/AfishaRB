/**
 * ИИ-помощник кабинета: «вставьте текст анонса или пост VK — заполним форму» (docs/05-ai-agent.md §10).
 * Даты, цены и возраст извлекаются правилами; GigaChat (если доступен) — название, категория, краткое описание.
 * Результат — ЧЕРНОВИК: сотрудник проверяет и подтверждает, автоматической публикации нет.
 */
import { z } from "zod";
import { getGateway, maskPii, parseBudget, parseDates } from "../assistant/index.js";
import { classify } from "../catalog/index.js";

const LlmDraft = z.object({
  title: z.string(),
  summary: z.string(),
  categories: z.array(z.string()),
  age_rating: z.number().nullable(),
  time: z.string().nullable(),
});

export async function extractDraft(text: string, now = new Date()) {
  const t = text.toLowerCase().replaceAll("ё", "е");
  const date = parseDates(t, now);
  const price = parseBudget(t.replace(/(цена|стоимость|билет\p{L}*)[:\s]*/gu, "до "));
  const time = text.match(/(?<!\d)([01]?\d|2[0-3])[:.]([0-5]\d)(?!\d)/);
  const age = text.match(/(?<!\d)(0|6|12|16|18)\s?\+/);
  const firstLine =
    text
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l.length > 5) ?? "";
  const { categories } = classify([], [], firstLine, text, age ? Number(age[1]) : null);
  const draft = {
    title: (text.match(/[«"]([^»"]{3,80})[»"]/)?.[1] ?? firstLine).slice(0, 120),
    summary: text.replace(/\s+/g, " ").trim().slice(0, 280),
    categories,
    date_from: date?.from ?? null,
    date_to: date?.to ?? null,
    time: time ? `${time[1]!.padStart(2, "0")}:${time[2]}` : null,
    age_rating: age ? Number(age[1]) : null,
    is_free: price.free,
    price_min: price.budget,
    confidence: { date: date ? 0.9 : 0, time: time ? 0.9 : 0, age: age ? 0.95 : 0, title: 0.6, categories: 0.6 },
    mode: "rules" as "rules" | "llm",
    warnings: [] as string[],
  };
  if (!draft.age_rating)
    draft.warnings.push("Укажите возрастной знак (0+, 6+, 12+, 16+, 18+) — без него событие не публикуется (436-ФЗ).");
  if (!draft.date_from) draft.warnings.push("Не удалось найти дату — укажите её вручную.");
  const gw = getGateway();
  if (gw.available()) {
    try {
      const r = await gw.chat({
        tier: "fast",
        temperature: 0,
        maxTokens: 400,
        json: {
          name: "event_draft",
          description: "Черновик карточки культурного события по тексту анонса",
          schema: {
            type: "object",
            properties: {
              title: { type: "string", description: "Название события без даты и места" },
              summary: { type: "string", description: "Краткое описание до 280 символов, только по тексту анонса" },
              categories: {
                type: "array",
                items: { type: "string", enum: ["theatre", "music", "museum", "kids", "folk", "cinema", "education"] },
              },
              age_rating: {
                type: "number",
                description: "Возрастной знак, только если указан в тексте: 0, 6, 12, 16, 18",
              },
              time: { type: "string", description: "Время начала ЧЧ:ММ, только если указано" },
            },
            required: ["title", "summary", "categories", "age_rating", "time"],
          },
        },
        messages: [
          {
            role: "system",
            content:
              "Извлеки поля карточки события строго из текста анонса. Ничего не придумывай: если поля нет в тексте — оставь пустым.",
          },
          { role: "user", content: maskPii(text).slice(0, 4000) },
        ],
      });
      const x = LlmDraft.safeParse(r.json);
      if (x.success) {
        draft.title = x.data.title || draft.title;
        draft.summary = x.data.summary || draft.summary;
        if (x.data.categories.length) draft.categories = x.data.categories as typeof draft.categories;
        // Возраст и время — только если подтверждаются текстом (правила), иначе оставляем пустым
        if (!draft.age_rating && x.data.age_rating !== null && text.includes(`${x.data.age_rating}+`))
          draft.age_rating = x.data.age_rating;
        if (!draft.time && x.data.time && text.includes(x.data.time)) draft.time = x.data.time;
        draft.mode = "llm";
        draft.confidence.title = 0.85;
        draft.confidence.categories = 0.85;
      }
    } catch {
      draft.warnings.push("ИИ временно недоступен — поля заполнены по правилам.");
    }
  }
  return draft;
}
