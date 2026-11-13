export default function Loading() {
  return (
    <div className="container" aria-busy="true" style={{ paddingTop: 56 }}>
      <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
        <div className="skeleton" style={{ aspectRatio: "16 / 9", borderRadius: 22 }} />
        <div>
          <div className="skeleton" style={{ height: 28, width: 160, marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 40, width: "90%", marginBottom: 12 }} />
          <div className="skeleton" style={{ height: 40, width: "70%", marginBottom: 24 }} />
          <div className="skeleton" style={{ height: 48, width: 220, borderRadius: 999 }} />
        </div>
      </div>
    </div>
  );
}
