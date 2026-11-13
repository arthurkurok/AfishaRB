/**
 * Шапка рабочего места: разделы, роль (Министерство / Учреждение), выбранное учреждение, тема, выход.
 * Роль пока — выбор интерфейса: Admin API выдаёт один токен (RBAC на бэкенде — в отчёте как пробел).
 */
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { Icon } from "@/components/ui/icons";
import { logout, switchRole } from "@/lib/actions/auth";
import { ROLE_LABEL } from "@/lib/roles";
import type { ChosenOrg } from "@/lib/session";
import type { Role } from "@/lib/session-crypto";
import styles from "./app-header.module.css";
import { NavLink } from "./nav-link";
import { ThemeToggle } from "./theme-toggle";

export function AppHeader({ role, org }: { role: Role; org: ChosenOrg | null }) {
  const items =
    role === "ministry"
      ? [
          { href: "/", label: "Пульс культуры", icon: "pulse" as const },
          { href: "/cabinet", label: "Кабинет учреждения", icon: "cabinet" as const },
          { href: "/moderation", label: "Модерация", icon: "moderation" as const },
        ]
      : [{ href: "/cabinet", label: "Кабинет учреждения", icon: "cabinet" as const }];

  return (
    <header className={styles.header}>
      <div className={`container ${styles.inner}`}>
        <Link href={role === "ministry" ? "/" : "/cabinet"} className={styles.brand}>
          <LogoMark size={32} />
          <span className={styles.brandText}>
            <span className={styles.brandName}>Тамаша</span>
            <span className={styles.brandTag}>Рабочее место</span>
          </span>
        </Link>
        <nav aria-label="Разделы" className={styles.nav}>
          <ul>
            {items.map((item) => (
              <li key={item.href}>
                <NavLink href={item.href} className={styles.navLink}>
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        <div className={styles.controls}>
          <form action={switchRole} className={styles.role} aria-label="Роль">
            <span className="sr-only">Роль: {ROLE_LABEL[role]}. Переключить:</span>
            <div className="segmented">
              {(["ministry", "institution"] as const).map((r) => (
                <button key={r} type="submit" name="role" value={r} aria-pressed={r === role}>
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </form>
          <ThemeToggle />
          <form action={logout}>
            <button type="submit" className="icon-btn" aria-label="Выйти" title="Выйти">
              <Icon name="logout" size={22} />
            </button>
          </form>
        </div>
      </div>
      {role === "institution" && org ? (
        <div className={styles.orgBar}>
          <p className="container caption">
            Учреждение: <strong>{org.name}</strong> · <Link href="/cabinet?change=1">сменить</Link>
          </p>
        </div>
      ) : null}
    </header>
  );
}
