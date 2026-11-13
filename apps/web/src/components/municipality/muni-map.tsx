"use client";
/**
 * Карта республики (ADR-017): Leaflet + OpenStreetMap — настоящая география вместо схематичной.
 * Маркеры — круги в центрах муниципалитетов, размер ~ числу предстоящих событий; клик — страница города.
 * Leaflet грузится динамически в эффекте (на сервере window нет), CSS — статический импорт.
 */
import type { Municipality } from "@afisha/contract";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef } from "react";
import styles from "./muni-map.module.css";

export function MuniMap({
  municipalities,
  hrefBase,
  highlight,
  labelTop = 8,
  interactive = true,
}: {
  municipalities: Municipality[];
  /** Префикс ссылки города: `${hrefBase}${id}` (функцию с сервера в клиентский компонент передать нельзя). */
  hrefBase: string;
  highlight?: string;
  labelTop?: number;
  /** false — декоративная карта (клик по маркеру не ведёт на страницу города). */
  interactive?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const withGeo = useMemo(
    () => municipalities.filter((m): m is Municipality & { center: [number, number] } => !!m.center),
    [municipalities],
  );

  useEffect(() => {
    if (!hostRef.current || withGeo.length === 0) return;
    const controller = new AbortController();
    const maxUp = Math.max(1, ...withGeo.map((m) => m.upcoming ?? 0));
    const labelled = new Set(
      [...withGeo]
        .sort((a, b) => (b.upcoming ?? 0) - (a.upcoming ?? 0))
        .slice(0, labelTop)
        .map((m) => m.id),
    );

    void (async () => {
      const L = (await import("leaflet")).default;
      if (controller.signal.aborted || !hostRef.current) return;
      const base = hrefBase;
      const map = L.map(hostRef.current, {
        scrollWheelZoom: false,
        attributionControl: true,
        zoomControl: true,
      });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 12,
        attribution: '&copy; участники <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const points: [number, number][] = [];
      for (const m of withGeo) {
        const [lat, lon] = m.center;
        points.push([lat, lon]);
        const r = 5 + Math.sqrt((m.upcoming ?? 0) / maxUp) * 14;
        const marker = L.circleMarker([lat, lon], {
          radius: r,
          className: `${styles.marker}${m.id === highlight ? ` ${styles.markerActive}` : ""}`,
          weight: 2,
          fillOpacity: 0.85,
        }).addTo(map);
        if (labelled.has(m.id) || m.id === highlight) {
          marker.bindTooltip(m.name, { permanent: true, direction: "top", className: styles.label });
        }
        if (interactive) {
          marker.on("click", () => {
            window.location.assign(`${base}${m.id}`);
          });
        } else {
          marker.bindTooltip(`${m.name} · ${m.upcoming ?? 0}`);
        }
      }
      map.fitBounds(points, { padding: [24, 24] });
      // перерисовка после появления контейнера в DOM (layout effect окно)
      setTimeout(() => map.invalidateSize(), 50);
      controller.signal.addEventListener("abort", () => map.remove());
    })();

    return () => controller.abort();
  }, [withGeo, hrefBase, highlight, labelTop, interactive]);

  if (withGeo.length === 0) return null;
  return <div ref={hostRef} className={styles.map} role="img" aria-label="Карта городов и районов" />;
}
