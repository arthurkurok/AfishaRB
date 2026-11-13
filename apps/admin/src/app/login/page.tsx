import type { Metadata } from "next";
import { LogoMark } from "@/components/brand/logo";
import styles from "@/components/layout/login.module.css";
import { LoginForm } from "@/components/layout/login-form";
import { isSafeNext } from "@/lib/session";

export const metadata: Metadata = { title: "Вход" };

const REASONS: Record<string, string> = {
  expired: "Сессия истекла или токен отозван — войдите снова.",
  logout: "Вы вышли из рабочего места.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[]>>;
}) {
  const sp = await searchParams;
  const next = typeof sp.next === "string" && isSafeNext(sp.next) ? sp.next : undefined;
  const reason = typeof sp.reason === "string" ? REASONS[sp.reason] : undefined;
  return (
    <main id="main" className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.brand}>
          <LogoMark size={40} />
          <p>Афиша РБ · Рабочее место</p>
        </div>
        <div className="stack" style={{ gap: "var(--space-2)" }}>
          <h1>Вход для сотрудников</h1>
          <p className="muted">Кабинет учреждения, модерация афиши и «Пульс культуры» Министерства культуры РБ.</p>
        </div>
        {reason ? (
          <p className="notice" role="status">
            {reason}
          </p>
        ) : null}
        <LoginForm next={next} />
      </div>
    </main>
  );
}
