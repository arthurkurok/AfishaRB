/**
 * Знак «Афиша РБ»: ромб со срезом-завитком ҡусҡар и медовым ромбом внутри (без госсимволики, 07-design §1).
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path d="M16 1 31 16 16 31 1 16Z" style={{ fill: "var(--color-accent)" }} />
      <path
        d="M16 1 23.5 8.5C21 8 19 9.6 19 11.6c0 1.6 1.6 2.6 3 1.8"
        style={{ fill: "none", stroke: "var(--color-on-accent)", strokeWidth: 1.6, strokeLinecap: "round" }}
      />
      <path d="M16 10 22 16 16 22 10 16Z" style={{ fill: "var(--color-honey)" }} />
    </svg>
  );
}
