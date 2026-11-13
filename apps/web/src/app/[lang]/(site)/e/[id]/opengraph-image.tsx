/**
 * OG-картинка события, генерируемая на лету (03-functional-spec §2): обложка + дата в ромбе + маскот.
 * Шрифт — Golos Text (OFL) с полной башкирской кириллицей, цвета — из токенов.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { colors } from "@afisha/design-tokens";
import { isLang, monthShort, regionParts } from "@afisha/i18n";
import { ImageResponse } from "next/og";
import { getEvent } from "@/lib/api";
import { REGION_TZ } from "@/lib/config";
import { createT } from "@/lib/i18n";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const c = (name: keyof typeof colors) => colors[name].light;

export default async function OgImage({ params }: { params: Promise<{ lang: string; id: string }> }) {
  const { lang: rawLang, id } = await params;
  const lang = isLang(rawLang) ? rawLang : "ru";
  const t = createT(lang);
  const root = process.cwd();
  const [bold, regular, mascot] = await Promise.all([
    readFile(join(root, "src/assets/fonts/GolosText-Bold.ttf")),
    readFile(join(root, "src/assets/fonts/GolosText-Regular.ttf")),
    readFile(join(root, "../../packages/design-tokens/assets/mascot-found.svg"), "utf8"),
  ]);
  const event = await getEvent(id, lang).catch(() => null);
  const title = event?.title ?? t("meta.title");
  const occ = event?.occurrences.find((o) => o.status !== "ended") ?? event?.occurrences[0];
  const start = occ ? regionParts(occ.starts_at, REGION_TZ) : null;
  const category = (event?.categories[0] ?? "theatre") as "theatre";
  const catColor = colors[`color-category-${category}`].light;
  const image = event?.image?.url;
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: c("color-bg"), fontFamily: "Golos" }}>
      <div style={{ display: "flex", width: 520, height: "100%", background: catColor, position: "relative" }}>
        {image ? (
          // biome-ignore lint/performance/noImgElement: satori рисует только <img>
          <img src={image} alt="" width={520} height={630} style={{ objectFit: "cover", width: 520, height: 630 }} />
        ) : null}
      </div>
      <div style={{ display: "flex", flexDirection: "column", flex: 1, padding: "56px 56px 40px", gap: 24 }}>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div
            style={{
              display: "flex",
              padding: "6px 18px",
              borderRadius: 999,
              background: catColor,
              color: c("color-surface"),
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {t(`categories.${category}`)}
          </div>
          <div
            style={{
              display: "flex",
              padding: "4px 14px",
              borderRadius: 999,
              border: `3px solid ${c("color-ink")}`,
              fontSize: 26,
              fontWeight: 700,
            }}
          >
            {`${event?.age_rating ?? 0}+`}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 80 ? 40 : title.length > 40 ? 46 : 56,
            fontWeight: 700,
            lineHeight: 1.1,
            color: c("color-ink"),
          }}
        >
          {title.length > 110 ? `${title.slice(0, 107)}…` : title}
        </div>
        {start ? (
          <div style={{ display: "flex", alignItems: "center", gap: 24, marginTop: "auto" }}>
            <div
              style={{
                display: "flex",
                width: 120,
                height: 120,
                transform: "rotate(45deg)",
                border: `5px solid ${catColor}`,
                borderRadius: 12,
                background: c("color-surface"),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <div
                style={{ display: "flex", flexDirection: "column", alignItems: "center", transform: "rotate(-45deg)" }}
              >
                <span style={{ fontSize: 22, color: c("color-ink-2") }}>{monthShort(start.month, lang)}</span>
                <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1 }}>{String(start.day)}</span>
                <span style={{ fontSize: 22 }}>{occ?.is_range ? "" : start.time}</span>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: 420 }}>
              <span style={{ fontSize: 28, fontWeight: 700 }}>{occ?.venue?.municipality ?? ""}</span>
              <span style={{ fontSize: 24, color: c("color-ink-2") }}>{(occ?.venue?.name ?? "").slice(0, 80)}</span>
            </div>
          </div>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: start ? 0 : "auto" }}>
          {/* biome-ignore lint/performance/noImgElement: satori рисует только <img> */}
          <img
            src={`data:image/svg+xml;base64,${Buffer.from(mascot).toString("base64")}`}
            width={72}
            height={72}
            alt=""
          />
          <span style={{ fontSize: 30, fontWeight: 700, color: c("color-accent") }}>{t("meta.brand")}</span>
          <span style={{ fontSize: 24, color: c("color-ink-2") }}>{t("footer.tagline")}</span>
        </div>
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Golos", data: regular, weight: 400, style: "normal" },
        { name: "Golos", data: bold, weight: 700, style: "normal" },
      ],
    },
  );
}
