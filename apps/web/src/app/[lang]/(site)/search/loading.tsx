import { CardSkeleton } from "@/components/event/event-card";

export default function Loading() {
  return (
    <div className="container" aria-busy="true">
      <div className="skeleton" style={{ height: 32, width: 240, margin: "var(--space-5) 0 var(--space-4)" }} />
      <div
        className="skeleton"
        style={{ height: 52, borderRadius: "var(--radius-pill)", marginBottom: "var(--space-5)" }}
      />
      <ul className="card-grid" aria-hidden="true">
        {["a", "b", "c", "d", "e", "f", "g", "h"].map((k) => (
          <li key={k}>
            <CardSkeleton />
          </li>
        ))}
      </ul>
    </div>
  );
}
