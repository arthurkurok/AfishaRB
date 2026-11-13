/**
 * Схема БД (docs/04-architecture.md §5). Event — мероприятие, Occurrence — сеанс со своим статусом.
 * Каждое поле события имеет provenance (field_provenance), изменения пишутся в change_log (append-only).
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  customType,
  doublePrecision,
  halfvec,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const EMBEDDING_DIM = 2560; // EmbeddingsGigaR

/** PostGIS geography(Point, 4326). В БД пишем EWKT, читаем через ST_X/ST_Y в запросах. */
export const geography = customType<{ data: string; driverData: string }>({
  dataType() {
    return "geography(Point,4326)";
  },
});

export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const created = () => ts("created_at").notNull().defaultNow();
const updated = () => ts("updated_at").notNull().defaultNow();
const uuidPk = () => uuid("id").primaryKey().default(sql`uuidv7()`);

export type I18n = { ru?: string; ba?: string };

export const region = pgTable("region", {
  id: varchar("id", { length: 16 }).primaryKey(),
  name: jsonb("name").$type<I18n>().notNull(),
  timezone: varchar("timezone", { length: 64 }).notNull(),
  languages: text("languages").array().notNull(),
  config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
  updatedAt: updated(),
});

export const municipality = pgTable(
  "municipality",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    regionId: varchar("region_id", { length: 16 })
      .notNull()
      .references(() => region.id),
    kind: varchar("kind", { length: 16 }).notNull(),
    name: jsonb("name").$type<I18n>().notNull(),
    synonyms: text("synonyms").array().notNull().default(sql`'{}'`),
    center: geography("center"),
    population: integer("population"),
    cultureLocaleIds: integer("culture_locale_ids").array().notNull().default(sql`'{}'`),
    sort: integer("sort").notNull().default(1000),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ix_municipality_center").using("gist", t.center)],
);

export const organization = pgTable(
  "organization",
  {
    id: uuidPk(),
    regionId: varchar("region_id", { length: 16 })
      .notNull()
      .references(() => region.id),
    name: jsonb("name").$type<I18n>().notNull(),
    shortName: text("short_name"),
    municipalityId: varchar("municipality_id", { length: 64 }).references(() => municipality.id),
    externalIds: jsonb("external_ids").$type<Record<string, unknown>>().notNull().default({}),
    website: text("website"),
    phone: text("phone"),
    email: text("email"),
    qualityScore: doublePrecision("quality_score"),
    isVerified: boolean("is_verified").notNull().default(false),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ix_organization_ext").using("gin", t.externalIds)],
);

export const venue = pgTable(
  "venue",
  {
    id: uuidPk(),
    regionId: varchar("region_id", { length: 16 })
      .notNull()
      .references(() => region.id),
    organizationId: uuid("organization_id").references(() => organization.id),
    name: jsonb("name").$type<I18n>().notNull(),
    address: text("address"),
    geo: geography("geo"),
    municipalityId: varchar("municipality_id", { length: 64 }).references(() => municipality.id),
    accessibility: jsonb("accessibility").$type<Record<string, unknown>>().notNull().default({}),
    phone: text("phone"),
    externalIds: jsonb("external_ids").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("ix_venue_geo").using("gist", t.geo),
    index("ix_venue_municipality").on(t.municipalityId),
    index("ix_venue_ext").using("gin", t.externalIds),
  ],
);

export type ImageInfo = {
  url: string;
  author: string | null;
  source: string | null;
  license: string | null;
  width: number | null;
  height: number | null;
  color: string | null;
};

export const event = pgTable(
  "event",
  {
    id: uuidPk(),
    regionId: varchar("region_id", { length: 16 })
      .notNull()
      .references(() => region.id),
    organizationId: uuid("organization_id").references(() => organization.id),
    title: jsonb("title").$type<I18n>().notNull(),
    summary: jsonb("summary").$type<I18n>().notNull().default({}),
    description: jsonb("description").$type<I18n>().notNull().default({}),
    categoryCodes: text("category_codes").array().notNull().default(sql`'{}'`),
    tags: text("tags").array().notNull().default(sql`'{}'`),
    sourceGenres: text("source_genres").array().notNull().default(sql`'{}'`),
    ageRating: smallint("age_rating"),
    isFree: boolean("is_free").notNull().default(false),
    priceMin: numeric("price_min", { precision: 10, scale: 2 }),
    priceMax: numeric("price_max", { precision: 10, scale: 2 }),
    pushkinCard: boolean("pushkin_card").notNull().default(false),
    accessibility: jsonb("accessibility").$type<Record<string, unknown>>().notNull().default({}),
    languages: text("languages").array().notNull().default(sql`'{ru}'`),
    durationMin: integer("duration_min"),
    images: jsonb("images").$type<ImageInfo[]>().notNull().default([]),
    ticketUrl: text("ticket_url"),
    sourceUrl: text("source_url"),
    isPermanent: boolean("is_permanent").notNull().default(false),
    moderationStatus: varchar("moderation_status", { length: 16 }).notNull().default("published"),
    trustLevel: varchar("trust_level", { length: 16 }).notNull().default("official"),
    qualityScore: doublePrecision("quality_score"),
    popularity: doublePrecision("popularity").notNull().default(0),
    titleNorm: text("title_norm").notNull().default(""),
    searchTsv: tsvector("search_tsv"),
    embedding: halfvec("embedding", { dimensions: EMBEDDING_DIM }),
    clusterId: uuid("cluster_id"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    index("ix_event_moderation").on(t.moderationStatus),
    index("ix_event_search_tsv").using("gin", t.searchTsv),
    index("ix_event_title_trgm").using("gin", sql`${t.titleNorm} gin_trgm_ops`),
    index("ix_event_categories").using("gin", t.categoryCodes),
    index("ix_event_tags").using("gin", t.tags),
    index("ix_event_cluster").on(t.clusterId),
  ],
);

export const occurrence = pgTable(
  "occurrence",
  {
    id: uuidPk(),
    regionId: varchar("region_id", { length: 16 })
      .notNull()
      .references(() => region.id),
    eventId: uuid("event_id")
      .notNull()
      .references(() => event.id, { onDelete: "cascade" }),
    venueId: uuid("venue_id").references(() => venue.id),
    municipalityId: varchar("municipality_id", { length: 64 }).references(() => municipality.id),
    startsAt: ts("starts_at").notNull(),
    endsAt: ts("ends_at"),
    allDay: boolean("all_day").notNull().default(false),
    isRange: boolean("is_range").notNull().default(false),
    schedule: jsonb("schedule").$type<unknown[]>().notNull().default([]),
    status: varchar("status", { length: 16 }).notNull().default("scheduled"),
    statusReason: text("status_reason"),
    rescheduledTo: uuid("rescheduled_to"),
    previousStartsAt: ts("previous_starts_at"),
    availability: varchar("availability", { length: 16 }).notNull().default("unknown"),
    priceMin: numeric("price_min", { precision: 10, scale: 2 }),
    priceMax: numeric("price_max", { precision: 10, scale: 2 }),
    ticketUrl: text("ticket_url"),
    lastVerifiedAt: ts("last_verified_at"),
    freshness: varchar("freshness", { length: 16 }).notNull().default("fresh"),
    sourceKey: text("source_key"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [
    uniqueIndex("uq_occurrence_source_key").on(t.sourceKey),
    index("ix_occurrence_region_starts").on(t.regionId, t.startsAt),
    index("ix_occurrence_event").on(t.eventId),
    index("ix_occurrence_venue").on(t.venueId),
    index("ix_occurrence_municipality").on(t.municipalityId),
    index("ix_occurrence_status").on(t.status),
    index("ix_occurrence_ends").on(t.endsAt),
  ],
);

export const fieldProvenance = pgTable(
  "field_provenance",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: varchar("entity_type", { length: 16 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    field: varchar("field", { length: 48 }).notNull(),
    sourceId: varchar("source_id", { length: 48 }).notNull(),
    sourceRecordId: integer("source_record_id"),
    valueHash: varchar("value_hash", { length: 40 }).notNull(),
    observedAt: ts("observed_at").notNull().defaultNow(),
    isWinning: boolean("is_winning").notNull().default(true),
    rule: text("rule"),
  },
  (t) => [
    uniqueIndex("uq_provenance_field_source").on(t.entityType, t.entityId, t.field, t.sourceId),
    index("ix_provenance_entity").on(t.entityType, t.entityId),
  ],
);

export const changeLog = pgTable(
  "change_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    regionId: varchar("region_id", { length: 16 }).notNull(),
    entityType: varchar("entity_type", { length: 16 }).notNull(),
    entityId: uuid("entity_id").notNull(),
    eventId: uuid("event_id"),
    kind: varchar("kind", { length: 32 }).notNull(),
    field: varchar("field", { length: 48 }),
    oldValue: jsonb("old_value"),
    newValue: jsonb("new_value"),
    sourceId: varchar("source_id", { length: 48 }),
    actor: text("actor"),
    reason: text("reason"),
    notified: boolean("notified").notNull().default(false),
    createdAt: created(),
  },
  (t) => [
    index("ix_change_log_entity").on(t.entityType, t.entityId),
    index("ix_change_log_event").on(t.eventId),
    index("ix_change_log_notified").on(t.notified),
    index("ix_change_log_created").on(t.createdAt),
  ],
);

/* ---------- Источники ---------- */

export const source = pgTable("source", {
  id: varchar("id", { length: 48 }).primaryKey(),
  regionId: varchar("region_id", { length: 16 })
    .notNull()
    .references(() => region.id),
  title: text("title").notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  trustLevel: varchar("trust_level", { length: 16 }).notNull(),
  url: text("url"),
  lastRunAt: ts("last_run_at"),
  lastSuccessAt: ts("last_success_at"),
  lastStats: jsonb("last_stats").$type<Record<string, unknown>>().notNull().default({}),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

export const sourceRun = pgTable("source_run", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  sourceId: varchar("source_id", { length: 48 })
    .notNull()
    .references(() => source.id),
  startedAt: ts("started_at").notNull().defaultNow(),
  finishedAt: ts("finished_at"),
  status: varchar("status", { length: 16 }).notNull().default("running"),
  stats: jsonb("stats").$type<Record<string, unknown>>().notNull().default({}),
  error: text("error"),
});

export const sourceRecord = pgTable(
  "source_record",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sourceId: varchar("source_id", { length: 48 })
      .notNull()
      .references(() => source.id),
    externalId: text("external_id").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    payloadHash: varchar("payload_hash", { length: 40 }).notNull(),
    fetchedAt: ts("fetched_at").notNull().defaultNow(),
    lastSeenRun: integer("last_seen_run"),
    parseStatus: varchar("parse_status", { length: 16 }).notNull().default("ok"),
    parseErrors: jsonb("parse_errors").$type<unknown[]>().notNull().default([]),
    mappedEventId: uuid("mapped_event_id"),
    seenCount: integer("seen_count").notNull().default(1),
  },
  (t) => [
    uniqueIndex("uq_source_record_ext").on(t.sourceId, t.externalId),
    index("ix_source_record_event").on(t.mappedEventId),
  ],
);

/* ---------- Модерация ---------- */

export const moderationTask = pgTable(
  "moderation_task",
  {
    id: uuidPk(),
    regionId: varchar("region_id", { length: 16 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    state: varchar("state", { length: 16 }).notNull().default("open"),
    priority: integer("priority").notNull().default(50),
    entityType: varchar("entity_type", { length: 16 }),
    entityId: uuid("entity_id"),
    relatedId: uuid("related_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    resolution: text("resolution"),
    resolvedBy: text("resolved_by"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [index("ix_moderation_kind_state").on(t.kind, t.state)],
);

export const report = pgTable("report", {
  id: uuidPk(),
  eventId: uuid("event_id"),
  occurrenceId: uuid("occurrence_id"),
  reason: varchar("reason", { length: 32 }).notNull(),
  comment: text("comment"),
  channel: varchar("channel", { length: 16 }).notNull(),
  context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
});

export const auditLog = pgTable("audit_log", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  actor: text("actor").notNull(),
  action: varchar("action", { length: 64 }).notNull(),
  entityType: varchar("entity_type", { length: 16 }),
  entityId: uuid("entity_id"),
  details: jsonb("details").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: created(),
});

/* ---------- Пользователи каналов ---------- */

export const profile = pgTable(
  "profile",
  {
    id: uuidPk(),
    regionId: varchar("region_id", { length: 16 }).notNull().default("ba"),
    channel: varchar("channel", { length: 16 }).notNull(),
    externalId: text("external_id").notNull(),
    lang: varchar("lang", { length: 8 }).notNull().default("ru"),
    municipalityId: varchar("municipality_id", { length: 64 }),
    kidsAges: integer("kids_ages").array().notNull().default(sql`'{}'`),
    interests: text("interests").array().notNull().default(sql`'{}'`),
    pushkinCard: boolean("pushkin_card").notNull().default(false),
    personalization: boolean("personalization").notNull().default(true),
    notifyChanges: boolean("notify_changes").notNull().default(true),
    notifyDigest: boolean("notify_digest").notNull().default(false),
    consentAt: ts("consent_at"),
    pushTokens: jsonb("push_tokens").$type<Record<string, string>>().notNull().default({}),
    lastSeenAt: ts("last_seen_at"),
    createdAt: created(),
    updatedAt: updated(),
  },
  (t) => [uniqueIndex("uq_profile_channel_ext").on(t.channel, t.externalId)],
);

export const favorite = pgTable(
  "favorite",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    eventId: uuid("event_id").notNull(),
    remind: boolean("remind").notNull().default(true),
    createdAt: created(),
  },
  (t) => [
    uniqueIndex("uq_favorite_profile_event").on(t.profileId, t.eventId),
    index("ix_favorite_event").on(t.eventId),
  ],
);

export const savedSearch = pgTable("saved_search", {
  id: uuidPk(),
  profileId: uuid("profile_id")
    .notNull()
    .references(() => profile.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  query: jsonb("query").$type<Record<string, unknown>>().notNull(),
  lastNotifiedAt: ts("last_notified_at"),
  createdAt: created(),
  updatedAt: updated(),
});

export const notification = pgTable(
  "notification",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    profileId: uuid("profile_id")
      .notNull()
      .references(() => profile.id, { onDelete: "cascade" }),
    kind: varchar("kind", { length: 32 }).notNull(),
    eventId: uuid("event_id"),
    changeId: integer("change_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    status: varchar("status", { length: 16 }).notNull().default("pending"),
    createdAt: created(),
    sentAt: ts("sent_at"),
  },
  (t) => [
    uniqueIndex("uq_notification_profile_change").on(t.profileId, t.changeId),
    index("ix_notification_status").on(t.status),
  ],
);

export const staffUser = pgTable("staff_user", {
  id: uuidPk(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  organizationId: uuid("organization_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: created(),
  updatedAt: updated(),
});

/* ---------- Аналитика ---------- */

export const searchLog = pgTable(
  "search_log",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    regionId: varchar("region_id", { length: 16 }).notNull().default("ba"),
    channel: varchar("channel", { length: 16 }).notNull(),
    queryText: text("query_text"),
    filters: jsonb("filters").$type<Record<string, unknown>>().notNull().default({}),
    municipalityId: varchar("municipality_id", { length: 64 }),
    results: integer("results").notNull(),
    viaAssistant: boolean("via_assistant").notNull().default(false),
    createdAt: created(),
  },
  (t) => [index("ix_search_log_created").on(t.createdAt), index("ix_search_log_muni").on(t.municipalityId)],
);

export const assistantTrace = pgTable(
  "assistant_trace",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    conversationId: text("conversation_id").notNull(),
    channel: varchar("channel", { length: 16 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 32 }).notNull(),
    models: jsonb("models").$type<string[]>().notNull().default([]),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    latencyMs: jsonb("latency_ms").$type<Record<string, number>>().notNull().default({}),
    textMasked: text("text_masked").notNull(),
    slots: jsonb("slots").$type<Record<string, unknown>>().notNull().default({}),
    decision: varchar("decision", { length: 16 }).notNull(),
    candidateIds: jsonb("candidate_ids").$type<string[]>().notNull().default([]),
    pickedIds: jsonb("picked_ids").$type<string[]>().notNull().default([]),
    verifier: jsonb("verifier").$type<Record<string, unknown>>().notNull().default({}),
    mode: varchar("mode", { length: 16 }).notNull(),
    feedback: integer("feedback"),
    createdAt: created(),
  },
  (t) => [index("ix_assistant_trace_created").on(t.createdAt), index("ix_assistant_trace_conv").on(t.conversationId)],
);

/** Решения по парам дедупликации (docs/06-data.md §5.3): «никогда не сливать» от модератора учитывается до скоринга. */
export const matchDecision = pgTable(
  "match_decision",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    eventA: uuid("event_a").notNull(),
    eventB: uuid("event_b").notNull(),
    decision: varchar("decision", { length: 16 }).notNull(), // never_merge | merge
    actor: text("actor").notNull(),
    createdAt: created(),
  },
  (t) => [uniqueIndex("uq_match_decision_pair").on(t.eventA, t.eventB)],
);
