/** Маскирование персональных данных перед отправкой в LLM (09-compliance §2.2, приказ ФСТЭК № 117 п. 60). */
const RULES: [RegExp, string][] = [
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[EMAIL]"],
  [/(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}/g, "[PHONE]"],
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD]"],
  [/\b\d{2}\s?\d{2}\s?\d{6}\b/g, "[DOC]"],
  [/\b\d{3}-\d{3}-\d{3}\s?\d{2}\b/g, "[SNILS]"],
  [/(?:кв\.?|квартира)\s*\d+/giu, "[ADDR]"],
  [/(?:меня зовут|я\s*[-—]?)\s+([А-ЯЁ][а-яё]+)(?:\s+[А-ЯЁ][а-яё]+)?/gu, "меня зовут [NAME]"],
];

export function maskPii(text: string): string {
  let out = text;
  for (const [rx, repl] of RULES) out = out.replace(rx, repl);
  return out;
}
