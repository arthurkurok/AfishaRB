/** «Пульс культуры» — дашборд министерства (docs/03-functional-spec.md §9). */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";

const rows = async <T>(db: Db, q: ReturnType<typeof sql>) =>
  (await db.execute<T & Record<string, unknown>>(q)).rows as T[];

export async function dashboard(db: Db, days = 30) {
  const [supply, byCategory, demandTop, gaps, quality, sources, totals, moderation] = await Promise.all([
    rows<{ id: string; name: string; kind: string; upcoming: number; free: number; pushkin: number; kids: number }>(
      db,
      sql`
      SELECT m.id, m.name->>'ru' AS name, m.kind,
        count(o.id) FILTER (WHERE o.id IS NOT NULL)::int AS upcoming,
        count(o.id) FILTER (WHERE e.is_free)::int AS free,
        count(o.id) FILTER (WHERE e.pushkin_card)::int AS pushkin,
        count(o.id) FILTER (WHERE 'kids' = ANY(e.category_codes))::int AS kids
      FROM municipality m
      LEFT JOIN occurrence o ON o.municipality_id = m.id AND o.status IN ('scheduled','sold_out','unverified')
        AND coalesce(o.ends_at, o.starts_at) BETWEEN now() AND now() + make_interval(days => ${days})
      LEFT JOIN event e ON e.id = o.event_id AND e.moderation_status = 'published'
      WHERE m.region_id = 'ba'
      GROUP BY m.id ORDER BY upcoming ASC, name`,
    ),
    rows<{ code: string; n: number }>(
      db,
      sql`
      SELECT unnest(e.category_codes) AS code, count(DISTINCT o.id)::int AS n
      FROM occurrence o JOIN event e ON e.id = o.event_id
      WHERE e.moderation_status = 'published' AND o.status IN ('scheduled','sold_out')
        AND coalesce(o.ends_at, o.starts_at) BETWEEN now() AND now() + make_interval(days => ${days})
      GROUP BY 1 ORDER BY 2 DESC`,
    ),
    rows<{ query: string; n: number; avg_results: number }>(
      db,
      sql`
      SELECT lower(coalesce(query_text, '')) AS query, count(*)::int AS n, round(avg(results))::int AS avg_results
      FROM search_log WHERE created_at > now() - make_interval(days => ${days}) AND coalesce(query_text,'') <> ''
      GROUP BY 1 ORDER BY 2 DESC LIMIT 20`,
    ),
    // «Спрос без предложения»: что ищут и не находят (по городу и категории)
    rows<{
      municipality: string | null;
      categories: string | null;
      with_kids: boolean;
      n: number;
      example: string | null;
    }>(
      db,
      sql`
      SELECT coalesce(m.name->>'ru', 'вся республика') AS municipality,
             nullif(array_to_string(ARRAY(SELECT jsonb_array_elements_text(coalesce(s.filters->'categories','[]'::jsonb))), ', '), '') AS categories,
             (s.filters ? 'age') AS with_kids,
             count(*)::int AS n, max(s.query_text) AS example
      FROM search_log s LEFT JOIN municipality m ON m.id = s.municipality_id
      WHERE s.results = 0 AND s.created_at > now() - make_interval(days => ${days})
      GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 20`,
    ),
    rows<{ id: string; name: string; events: number; avg_quality: number; no_image: number; no_price: number }>(
      db,
      sql`
      SELECT org.id, coalesce(org.short_name, org.name->>'ru') AS name, count(DISTINCT e.id)::int AS events,
        round(avg(e.quality_score)::numeric * 100)::int AS avg_quality,
        count(DISTINCT e.id) FILTER (WHERE jsonb_array_length(e.images) = 0)::int AS no_image,
        count(DISTINCT e.id) FILTER (WHERE e.price_min IS NULL AND NOT e.is_free)::int AS no_price
      FROM organization org JOIN event e ON e.organization_id = org.id AND e.moderation_status = 'published'
      JOIN occurrence o ON o.event_id = e.id AND coalesce(o.ends_at, o.starts_at) >= now()
      GROUP BY org.id ORDER BY avg_quality ASC NULLS FIRST, events DESC LIMIT 30`,
    ),
    rows<{ id: string; title: string; last_success_at: string | null; last_stats: Record<string, unknown> }>(
      db,
      sql`
      SELECT id, title, last_success_at, last_stats FROM source ORDER BY id`,
    ),
    rows<{
      events: number;
      occurrences: number;
      municipalities_covered: number;
      municipalities_total: number;
      searches: number;
      zero_results: number;
      assistant_dialogs: number;
    }>(
      db,
      sql`
      SELECT
        (SELECT count(DISTINCT o.event_id) FROM occurrence o JOIN event e ON e.id = o.event_id WHERE e.moderation_status='published' AND coalesce(o.ends_at,o.starts_at) >= now())::int AS events,
        (SELECT count(*) FROM occurrence o WHERE o.status IN ('scheduled','sold_out','unverified') AND coalesce(o.ends_at,o.starts_at) >= now())::int AS occurrences,
        (SELECT count(DISTINCT municipality_id) FROM occurrence WHERE coalesce(ends_at,starts_at) BETWEEN now() AND now() + make_interval(days => ${days}))::int AS municipalities_covered,
        (SELECT count(*) FROM municipality WHERE region_id='ba')::int AS municipalities_total,
        (SELECT count(*) FROM search_log WHERE created_at > now() - make_interval(days => ${days}))::int AS searches,
        (SELECT count(*) FROM search_log WHERE results = 0 AND created_at > now() - make_interval(days => ${days}))::int AS zero_results,
        (SELECT count(DISTINCT conversation_id) FROM assistant_trace WHERE created_at > now() - make_interval(days => ${days}))::int AS assistant_dialogs`,
    ),
    rows<{ kind: string; open: number }>(
      db,
      sql`SELECT kind, count(*)::int AS open FROM moderation_task WHERE state = 'open' GROUP BY kind`,
    ),
  ]);
  return {
    period_days: days,
    totals: totals[0],
    culture_deserts: supply
      .filter((m) => m.upcoming < 3)
      .map((m) => ({ id: m.id, name: m.name, upcoming: m.upcoming })),
    supply,
    by_category: byCategory,
    demand_top: demandTop,
    demand_without_supply: gaps,
    data_quality: quality,
    sources,
    moderation,
  };
}
