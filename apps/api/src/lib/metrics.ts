/**
 * Метрики в формате Prometheus (docs/04-architecture.md §12): запросы, ошибки 5xx, латентность,
 * возраст последнего успешного прогона источника, отставание очереди уведомлений.
 * Полноценный OpenTelemetry — этап M0 фазы Р (ADR-018).
 */
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Db } from "../db/client.js";

export const metrics = {
  requests: 0,
  serverErrors: 0,
  clientErrors: 0,
  latencyBuckets: new Map<number, number>(),
  latencySumMs: 0,
};
const BUCKETS = [25, 50, 100, 250, 500, 1000, 3000, 7000, Number.POSITIVE_INFINITY];

export function registerMetrics(app: FastifyInstance, db: Db): void {
  app.addHook("onResponse", async (req, reply) => {
    metrics.requests++;
    if (reply.statusCode >= 400 && reply.statusCode < 500) metrics.clientErrors++;
    const ms = reply.elapsedTime;
    metrics.latencySumMs += ms;
    for (const b of BUCKETS) if (ms <= b) metrics.latencyBuckets.set(b, (metrics.latencyBuckets.get(b) ?? 0) + 1);
    void req;
  });

  app.get("/metrics", { schema: { hide: true }, config: { rateLimit: false } }, async (_req, reply) => {
    const src = (
      await db.execute<{ id: string; age: number | null; status: string | null }>(sql`
        SELECT s.id, extract(epoch FROM now() - s.last_success_at) AS age,
               (SELECT status FROM source_run r WHERE r.source_id = s.id ORDER BY id DESC LIMIT 1) AS status
        FROM source s`)
    ).rows;
    const outbox = (
      await db.execute<{ n: number; age: number | null }>(sql`
        SELECT count(*)::int AS n, extract(epoch FROM now() - min(created_at)) AS age
        FROM change_log WHERE notified = false AND entity_type = 'occurrence' AND kind IN ('status','rescheduled')`)
    ).rows[0];
    const lines = [
      "# TYPE afisha_http_requests_total counter",
      `afisha_http_requests_total ${metrics.requests}`,
      "# TYPE afisha_http_5xx_total counter",
      `afisha_http_5xx_total ${metrics.serverErrors}`,
      "# TYPE afisha_http_4xx_total counter",
      `afisha_http_4xx_total ${metrics.clientErrors}`,
      "# TYPE afisha_http_latency_ms histogram",
      ...BUCKETS.map(
        (b) =>
          `afisha_http_latency_ms_bucket{le="${b === Number.POSITIVE_INFINITY ? "+Inf" : b}"} ${metrics.latencyBuckets.get(b) ?? 0}`,
      ),
      `afisha_http_latency_ms_sum ${metrics.latencySumMs.toFixed(0)}`,
      `afisha_http_latency_ms_count ${metrics.requests}`,
      "# TYPE afisha_source_last_success_age_seconds gauge",
      ...src.map(
        (s) =>
          `afisha_source_last_success_age_seconds{source="${s.id}",last_run="${s.status ?? "none"}"} ${s.age === null ? -1 : Math.round(Number(s.age))}`,
      ),
      "# TYPE afisha_notify_outbox_pending gauge",
      `afisha_notify_outbox_pending ${outbox?.n ?? 0}`,
      "# TYPE afisha_notify_outbox_oldest_age_seconds gauge",
      `afisha_notify_outbox_oldest_age_seconds ${outbox?.age === null || outbox?.age === undefined ? 0 : Math.round(Number(outbox.age))}`,
    ];
    reply.type("text/plain; version=0.0.4").send(`${lines.join("\n")}\n`);
  });
}
