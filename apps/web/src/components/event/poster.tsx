"use client";
/**
 * Постер события со срезом ҡусҡар в углу. Нет фото или оно не загрузилось —
 * статичная иллюстрация категории (gpt-image-2, ADR-017): плоский вектор в цвете категории.
 */
import type { CategoryCode, OccurrenceCard } from "@afisha/contract";
import Image, { type StaticImageData } from "next/image";
import { useState } from "react";
import cinema from "@/assets/categories/cinema.png";
import education from "@/assets/categories/education.png";
import folk from "@/assets/categories/folk.png";
import kids from "@/assets/categories/kids.png";
import museum from "@/assets/categories/museum.png";
import music from "@/assets/categories/music.png";
import theatre from "@/assets/categories/theatre.png";
import { CORNER_CURL_PATH, CORNER_CUT_PATH } from "@/brand/ornament";
import styles from "./poster.module.css";

const OPTIMIZED_HOSTS = new Set(["cdn.culture.ru"]);

const CATEGORY_ART: Record<CategoryCode, StaticImageData> = {
  theatre,
  music,
  museum,
  kids,
  folk,
  cinema,
  education,
};

function optimizable(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https" && OPTIMIZED_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export function Poster({
  image,
  category,
  alt,
  sizes,
  priority = false,
  dim = false,
  artTitle,
  cut = true,
}: {
  image: OccurrenceCard["event"]["image"];
  category: CategoryCode;
  alt: string;
  sizes: string;
  priority?: boolean;
  dim?: boolean;
  /** Подпись иллюстрации категории для скринридера (на странице события); в карточках — декоративная. */
  artTitle?: string;
  cut?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = image?.url && !failed;
  return (
    <div className={styles.poster} data-dim={dim || undefined}>
      {showImage ? (
        optimizable(image.url) ? (
          <Image
            src={image.url}
            alt={alt}
            fill
            sizes={sizes}
            priority={priority}
            className={styles.img}
            onError={() => setFailed(true)}
          />
        ) : (
          // biome-ignore lint/performance/noImgElement: хост не в списке оптимизации next/image — выводим как есть
          <img
            src={image.url}
            alt={alt}
            className={styles.img}
            loading={priority ? "eager" : "lazy"}
            onError={() => setFailed(true)}
          />
        )
      ) : (
        <Image
          src={CATEGORY_ART[category]}
          alt={artTitle ?? ""}
          fill
          sizes={sizes}
          priority={priority}
          className={styles.img}
        />
      )}
      {cut ? (
        <svg className={styles.cut} viewBox="0 0 40 40" aria-hidden="true" focusable="false">
          <path d={CORNER_CUT_PATH} className={styles.cutFill} />
          <path d={CORNER_CURL_PATH} className={styles.cutCurl} />
        </svg>
      ) : null}
    </div>
  );
}
