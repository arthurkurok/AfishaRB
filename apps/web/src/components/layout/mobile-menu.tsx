"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { stripLocale } from "@/lib/hrefs";
import { useI18n } from "@/lib/i18n-client";
import styles from "./header.module.css";

export interface NavItem {
  href: string;
  label: string;
}

/** Меню для узких экранов: кнопка-раскрывашка, закрывается по Esc и при переходе. */
export function MobileMenu({ items }: { items: NavItem[] }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: закрываем меню при смене страницы
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className={styles.mobile}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-btn"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t("nav.closeMenu") : t("nav.menu")}
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path
            d={open ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h10"}
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          />
        </svg>
      </button>
      <nav id={panelId} aria-label={t("nav.main")} className={styles.mobilePanel} hidden={!open}>
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={styles.mobileLink}
                aria-current={stripLocale(pathname ?? "") === stripLocale(item.href) ? "page" : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
