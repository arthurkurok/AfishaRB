export default function Loading() {
  return (
    <div className="container" aria-busy="true" style={{ paddingTop: "var(--space-7)" }}>
      <div
        style={{
          display: "grid",
          gap: "var(--space-5)",
          gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))",
        }}
      >
        <div className="skeleton" style={{ aspectRatio: "16 / 9", borderRadius: "var(--radius-l)" }} />
        <div>
          <div className="skeleton" style={{ height: 28, width: 160, marginBottom: "var(--space-4)" }} />
          <div className="skeleton" style={{ height: 40, width: "90%", marginBottom: "var(--space-3)" }} />
          <div className="skeleton" style={{ height: 40, width: "70%", marginBottom: "var(--space-5)" }} />
          <div className="skeleton" style={{ height: 48, width: 220, borderRadius: "var(--radius-pill)" }} />
        </div>
      </div>
    </div>
  );
}
