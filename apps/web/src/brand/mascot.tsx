/**
 * Маскот — пчела Бал (07-design §3). Все изображения маскота лежат в одном месте:
 * packages/design-tokens/assets/mascot-<emotion>.svg. Сейчас там временные плейсхолдеры, сгенерированные кодом;
 * владелец заменяет файлы готовыми иллюстрациями (13-owner-tasks, Б2) — правки в коде не нужны.
 * Маскота нет в уведомлениях об отмене, в документации API и в кабинетах (07-design §3).
 */
import achievement from "@afisha/design-tokens/assets/mascot-achievement.svg";
import celebrate from "@afisha/design-tokens/assets/mascot-celebrate.svg";
import clarify from "@afisha/design-tokens/assets/mascot-clarify.svg";
import found from "@afisha/design-tokens/assets/mascot-found.svg";
import greeting from "@afisha/design-tokens/assets/mascot-greeting.svg";
import loading from "@afisha/design-tokens/assets/mascot-loading.svg";
import networkError from "@afisha/design-tokens/assets/mascot-network-error.svg";
import night from "@afisha/design-tokens/assets/mascot-night.svg";
import notFound from "@afisha/design-tokens/assets/mascot-not-found.svg";
import reminder from "@afisha/design-tokens/assets/mascot-reminder.svg";
import thanks from "@afisha/design-tokens/assets/mascot-thanks.svg";
import thinking from "@afisha/design-tokens/assets/mascot-thinking.svg";
import type { StaticImageData } from "next/image";

const ASSETS = {
  greeting,
  thinking,
  found,
  clarify,
  "not-found": notFound,
  celebrate,
  night,
  "network-error": networkError,
  loading,
  reminder,
  achievement,
  thanks,
} as const satisfies Record<string, StaticImageData>;

export type MascotEmotion = keyof typeof ASSETS;

/** Декоративное изображение: смысл всегда передаёт текст рядом, поэтому alt пустой. */
export function Mascot({
  emotion,
  size = 96,
  className,
}: {
  emotion: MascotEmotion;
  size?: number;
  className?: string;
}) {
  const asset = ASSETS[emotion];
  return (
    // biome-ignore lint/performance/noImgElement: векторный ассет, оптимизация next/image не нужна
    <img className={className} src={asset.src} width={size} height={size} alt="" decoding="async" loading="lazy" />
  );
}
