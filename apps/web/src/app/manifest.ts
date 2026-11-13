import { colors } from "@afisha/design-tokens";
import { createT } from "@afisha/i18n/messages";
import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const t = createT("ru");
  return {
    name: t("meta.title"),
    short_name: t("meta.brand"),
    description: t("meta.description"),
    lang: "ru",
    start_url: "/",
    display: "standalone",
    background_color: colors["color-bg"].light,
    theme_color: colors["color-accent"].light,
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
