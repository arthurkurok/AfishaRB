import { type Lang, type Translate, todayIn } from "@afisha/i18n";
import type { CardContext } from "@/components/event/event-card";
import { REGION_TZ } from "./config";
import { hrefs, type Surface } from "./hrefs";

export function cardContext(lang: Lang, t: Translate, surface: Surface = "site"): CardContext {
  return { lang, t, tz: REGION_TZ, today: todayIn(REGION_TZ), hrefs: hrefs(lang, surface) };
}
