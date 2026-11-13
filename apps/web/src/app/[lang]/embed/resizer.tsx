"use client";
import { useEffect } from "react";

/** iframe-фоллбэк виджета сообщает родителю свою высоту (postMessage) — без cookies и хранилищ. */
export function EmbedResizer({ theme }: { theme: "auto" | "light" | "dark" }) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "auto") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", theme);
    if (window.parent === window) return;
    let last = 0;
    const post = () => {
      const h = Math.ceil(document.documentElement.scrollHeight);
      if (h !== last) {
        last = h;
        window.parent.postMessage({ type: "afisha:height", height: h }, "*");
      }
    };
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    post();
    return () => ro.disconnect();
  }, [theme]);
  return null;
}
