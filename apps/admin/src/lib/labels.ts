/**
 * Подписи из общего словаря packages/i18n (статусы, категории, теги) — те же формулировки, что на сайте,
 * в боте и в приложениях. Подключается только русский словарь: админка — рабочий инструмент на русском.
 */
import type { CategoryCode, OccurrenceStatus } from "@afisha/contract";
import { type Messages, translator } from "@afisha/i18n";
import ru from "@afisha/i18n/ru.json";

export const t = translator("ru", ru as Messages);

export type BadgeKind = Exclude<OccurrenceStatus, "scheduled"> | "few_left";

export const CATEGORY_CODES: CategoryCode[] = ["theatre", "music", "museum", "kids", "folk", "cinema", "education"];

export function categoryLabel(code: string): string {
  return (CATEGORY_CODES as string[]).includes(code) ? t(`categories.${code as CategoryCode}`) : code;
}

/** Бейдж статуса (форма + цвет + текст, 07-design §4.3). Для «по плану» бейджа нет — `null`. */
export function statusBadge(o: {
  status: OccurrenceStatus;
  availability?: string;
}): { kind: BadgeKind; label: string } | null {
  if (o.status === "scheduled") {
    if (o.availability === "sold_out") return { kind: "sold_out", label: t("status.sold_out") };
    if (o.availability === "few_left") return { kind: "few_left", label: t("status.few_left") };
    return null;
  }
  return { kind: o.status, label: t(`status.${o.status}`) };
}

export function statusText(status: OccurrenceStatus): string {
  return t(`status.${status}`);
}

/** Виды задач модерации (03-functional-spec §8). Незнакомый вид показывается как есть. */
const TASK_KIND: Record<string, string> = {
  dedup_review: "Возможные дубли",
  vanished: "Исчезнувшие события",
  validation: "Ошибки в данных источника",
  low_trust: "Новые события с низким доверием",
  source_error: "Ошибки источников",
  report: "Жалобы пользователей",
};

export function taskKindLabel(kind: string): string {
  return TASK_KIND[kind] ?? kind;
}

/** Причины жалоб и обратной связи: report.reason и feedback_<kind> (POST /v1/feedback). */
const REPORT_REASON: Record<string, string> = {
  cancelled: "Событие отменено",
  wrong_time: "Неверные дата или время",
  wrong_price: "Неверная цена",
  wrong_place: "Неверное место",
  other: "Другое",
  feedback_translation: "Правка башкирского перевода",
  feedback_data: "Ошибка в данных",
  feedback_idea: "Идея",
  feedback_other: "Обратная связь",
};

export function reportReasonLabel(reason: string): string {
  return REPORT_REASON[reason] ?? reason;
}

export function isFeedback(reason: string): boolean {
  return reason.startsWith("feedback_");
}

export const CHANNEL_LABEL: Record<string, string> = {
  web: "Сайт",
  tma: "Mini App",
  bot: "Telegram-бот",
  ios: "iOS",
  android: "Android",
  widget: "Виджет",
  admin: "Админка",
};
