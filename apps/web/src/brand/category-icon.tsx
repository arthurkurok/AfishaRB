/**
 * Линейные иконки категорий (07-design §4.2, §8): 24 px, линия 2 px, мотивы орнамента.
 */
import type { CategoryCode } from "@afisha/contract";

const PATHS: Record<CategoryCode, string> = {
  // маска из двух ҡусҡаров
  theatre:
    "M4 5.5c3-2 13-2 16 0V11c0 5-4 9-8 9s-8-4-8-9zM7.5 11c0-2 3-2 3 0M13.5 11c0-2 3-2 3 0M9 15c1.5 1.6 4.5 1.6 6 0",
  // стебель курая и звуковые волны-завитки
  music: "M5 20 13 4M7.8 14.4l1 .5M10 10l1 .5M15 10.5c2 .8 2.8 2.8 1.8 4.6M17.6 7.6c3.4 2 4.2 6 2.2 9",
  // ромб-рамка
  museum: "M12 3l9 9-9 9-9-9zM12 8.5l3.5 3.5-3.5 3.5L8.5 12z",
  // солнышко-ҡусҡар
  kids: "M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8M12 8a4 4 0 1 1-4 4c0-1.6 1.4-2.6 2.6-2 .9.5.8 1.8-.2 2",
  // древо жизни (ағас)
  folk: "M12 21V8M12 14c-3 0-5-2-5-5 1.6 0 3 .8 3 2.4M12 14c3 0 5-2 5-5-1.6 0-3 .8-3 2.4M12 9.5c-1.8 0-3-1.3-3-3M12 9.5c1.8 0 3-1.3 3-3M12 2.5l2 2-2 2-2-2z",
  // ромб-кадр
  cinema: "M12 3l9 9-9 9-9-9zM10.5 9.2v5.6l4.4-2.8z",
  // «сердечко» йөрәккәй
  education:
    "M12 20c-5-3.6-8.5-6.8-8.5-10.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 8.5 2c0 3.6-3.5 6.8-8.5 10.4zM12 7.6v4M12 11.6c-1.2 0-2-.9-2-1.9",
};

export function CategoryIcon({
  code,
  size = 24,
  className,
}: {
  code: CategoryCode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[code]} />
    </svg>
  );
}
