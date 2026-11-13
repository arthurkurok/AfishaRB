"use client";
/** Ошибка раздела: понятная фраза, без кодов и стектрейсов (07-design §10), и одно действие. */
import { useEffect } from "react";
import { Icon } from "@/components/ui/icons";

export default function SectionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="card stack" role="alert" style={{ maxWidth: 640 }}>
      <h1 style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
        <Icon name="alert" size={28} /> Не получается связаться с сервером афиши
      </h1>
      <p className="muted">
        Данные не загрузились. Попробуйте ещё раз через минуту; если ошибка повторяется — сообщите администратору
        {error.digest ? ` (код ${error.digest})` : ""}.
      </p>
      <div>
        <button type="button" className="btn btn--primary" onClick={reset}>
          Попробовать ещё раз
        </button>
      </div>
    </div>
  );
}
