import type { ReactNode } from "react";
import { AppHeader } from "@/components/layout/app-header";
import { readChosenOrg, requireSession } from "@/lib/session";

/** Оболочка рабочего места: только для вошедших сотрудников. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const org = await readChosenOrg();
  return (
    <>
      <a href="#main" className="skip-link">
        Перейти к содержанию
      </a>
      <AppHeader role={session.role} org={org} />
      <main id="main" tabIndex={-1} className="container page">
        {children}
      </main>
    </>
  );
}
