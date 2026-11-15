/**
 * Конвейер: нормализованные события → каноническая модель (docs/06-data.md §3, §6–§8).
 * Идемпотентен: повторный прогон на тех же данных ничего не меняет и не пишет лишнего в журнал.
 */
import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import {
  changeLog,
  event,
  fieldProvenance,
  municipality,
  occurrence,
  organization,
  region,
  source,
  sourceRecord,
  sourceRun,
  venue,
} from "../../db/schema.js";
import { baName, kindOf, localParts, REGION_ID, REGION_TZ, stemsFor } from "../geo/index.js";
import type { NormalizedEvent } from "./types.js";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Exec = Db | Tx;

export const SOURCES: Record<string, { title: string; kind: string; trust: string; url: string | null }> = {
  culture_ru: {
    title: "Культура.РФ / PRO.Культура.РФ",
    kind: "opendata",
    trust: "official",
    url: "https://www.culture.ru/afisha/respublika-bashkortostan",
  },
  bashopera: {
    title: "Башкирский государственный академический театр оперы и балета",
    kind: "site",
    trust: "official",
    url: "https://bashopera.ru/affiche/",
  },
  organizer_cabinet: { title: "Кабинет учреждения", kind: "cabinet", trust: "official_plus", url: null },
  moderator: { title: "Модератор министерства", kind: "cabinet", trust: "official_plus", url: null },
};

const EVENT_FIELDS = [
  "title",
  "summary",
  "description",
  "categoryCodes",
  "tags",
  "ageRating",
  "priceMin",
  "priceMax",
  "isFree",
  "pushkinCard",
  "images",
  "ticketUrl",
  "sourceUrl",
  "organizationId",
  "accessibility",
  "languages",
  "isPermanent",
  "sourceGenres",
] as const;
type EventField = (typeof EVENT_FIELDS)[number];
const LOGGED_FIELDS = new Set<EventField>(["title", "ageRating", "priceMin", "priceMax", "ticketUrl"]);

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}
export const hashOf = (v: unknown) =>
  createHash("md5")
    .update(stable(v) ?? "null")
    .digest("hex");
const point = (lat: number | null, lon: number | null) =>
  lat === null || lon === null ? null : `SRID=4326;POINT(${lon} ${lat})`;

export type IngestStats = {
  eventsNew: number;
  eventsUpdated: number;
  eventsUnchanged: number;
  occurrencesNew: number;
  occurrencesChanged: number;
  skippedOutsideRegion: number;
  venuesNew: number;
  orgsNew: number;
  vanished: number;
  /** Сеансы, у которых источник сменил внешний id (то же время и зал): не «исчезли», а заменены */
  replaced: number;
  errors: string[];
};
export const emptyStats = (): IngestStats => ({
  eventsNew: 0,
  eventsUpdated: 0,
  eventsUnchanged: 0,
  occurrencesNew: 0,
  occurrencesChanged: 0,
  skippedOutsideRegion: 0,
  venuesNew: 0,
  orgsNew: 0,
  vanished: 0,
  replaced: 0,
  errors: [],
});

export async function ensureReference(db: Exec): Promise<void> {
  await db
    .insert(region)
    .values({
      id: REGION_ID,
      name: { ru: "Республика Башкортостан", ba: "Башҡортостан Республикаһы" },
      timezone: REGION_TZ,
      languages: ["ru", "ba"],
    })
    .onConflictDoNothing();
  for (const [id, m] of Object.entries(SOURCES)) {
    await db
      .insert(source)
      .values({ id, regionId: REGION_ID, title: m.title, kind: m.kind, trustLevel: m.trust, url: m.url })
      .onConflictDoNothing();
  }
}

type LogInput = {
  entityType: "event" | "occurrence";
  entityId: string;
  eventId: string;
  kind: string;
  field?: string | null;
  old?: unknown;
  new?: unknown;
  reason?: string | null;
  actor?: string | null;
};

export class CatalogWriter {
  readonly stats = emptyStats();
  private readonly muni = new Set<string>();
  private readonly venueByExt = new Map<string, string>();
  private readonly orgByExt = new Map<string, string>();
  private readonly logs: LogInput[] = [];

  constructor(
    private readonly db: Exec,
    readonly sourceId: string,
    readonly runId: number | null,
    /** Принудительно перенормализовать даже неизменённые записи (после исправления нормализатора) */
    readonly force = false,
  ) {}

  async warm(): Promise<void> {
    for (const m of await this.db.select({ id: municipality.id }).from(municipality)) this.muni.add(m.id);
    // Внешние ключи площадок: eipsk/культура у Культура.РФ, залы Башоперы — с префиксом (не пересекаются);
    // скобки обязательны: без них || и ->> левоассоциативны и склеивают префикс с самим jsonb
    const vs = await this.db.execute<{ id: string; ext: string }>(
      sql`SELECT id, coalesce(external_ids->>'eipsk_place_id', external_ids->>'culture_place_id', 'basho:' || (external_ids->>'bashopera_hall_id')) AS ext FROM venue`,
    );
    for (const r of vs.rows) this.venueByExt.set(r.ext, r.id);
    const os = await this.db.execute<{ id: string; ext: string }>(
      sql`SELECT id, coalesce(external_ids->>'culture_org_id', 'basho:' || (external_ids->>'bashopera_org_id')) AS ext FROM organization WHERE external_ids ? 'culture_org_id' OR external_ids ? 'bashopera_org_id'`,
    );
    for (const r of os.rows) this.orgByExt.set(r.ext, r.id);
  }

  /** Точка отката журнала: сколько записей накоплено (для SAVEPOINT в загрузчике). */
  pendingLogs(): number {
    return this.logs.length;
  }

  /** Записи журнала до отметки (карточки, загруженные успешно). */
  takeLogs(mark: number): LogInput[] {
    return this.logs.slice(0, mark);
  }

  restoreLogs(entries: LogInput[]): void {
    this.logs.push(...entries);
  }

  private log(entry: LogInput): void {
    this.logs.push(entry);
  }

  async flushLogs(): Promise<void> {
    if (this.logs.length === 0) return;
    await this.db.insert(changeLog).values(
      this.logs.splice(0).map((l) => ({
        regionId: REGION_ID,
        entityType: l.entityType,
        entityId: l.entityId,
        eventId: l.eventId,
        kind: l.kind,
        field: l.field ?? null,
        oldValue: l.old === undefined ? null : JSON.parse(JSON.stringify(l.old ?? null)),
        newValue: l.new === undefined ? null : JSON.parse(JSON.stringify(l.new ?? null)),
        sourceId: this.sourceId,
        actor: l.actor ?? this.sourceId,
        reason: l.reason ?? null,
      })),
    );
  }

  private async ensureMunicipality(slug: string | null, title: string | null, localeId: number | null) {
    if (!slug || !title) return null;
    if (!this.muni.has(slug)) {
      await this.db
        .insert(municipality)
        .values({
          id: slug,
          regionId: REGION_ID,
          kind: kindOf(title),
          name: { ru: title, ba: baName(title) },
          synonyms: stemsFor(title),
          cultureLocaleIds: localeId ? [localeId] : [],
        })
        .onConflictDoNothing();
      this.muni.add(slug);
    }
    return slug;
  }

  private async ensureOrganization(ne: NormalizedEvent): Promise<string | null> {
    if (!ne.organization) return null;
    const key = ne.organization.externalId;
    const known = this.orgByExt.get(key);
    if (known) return known;
    const [row] = await this.db
      .insert(organization)
      .values({
        regionId: REGION_ID,
        name: { ru: ne.organization.name },
        shortName: ne.organization.shortName,
        externalIds: ne.organization.externalIds,
      })
      .returning({ id: organization.id });
    this.orgByExt.set(key, row!.id);
    this.stats.orgsNew++;
    return row!.id;
  }

  private async ensureVenues(ne: NormalizedEvent, orgId: string | null) {
    const out = new Map<string, { id: string; muni: string | null }>();
    for (const v of ne.venues) {
      const muni = await this.ensureMunicipality(v.municipalityId, v.municipalityTitle, v.cultureLocaleId);
      let id = this.venueByExt.get(v.externalId);
      if (!id) {
        const [row] = await this.db
          .insert(venue)
          .values({
            regionId: REGION_ID,
            organizationId: orgId,
            name: { ru: v.name },
            address: v.address,
            geo: point(v.lat, v.lon),
            municipalityId: muni,
            externalIds: v.externalIds,
          })
          .returning({ id: venue.id });
        id = row!.id;
        this.venueByExt.set(v.externalId, id);
        this.stats.venuesNew++;
      }
      out.set(v.externalId, { id, muni });
    }
    return out;
  }

  private async provenance(
    entityType: string,
    entityId: string,
    values: Record<string, unknown>,
    recordId: number,
    observedAt: Date = new Date(),
  ) {
    const rows = Object.entries(values).map(([field, v]) => ({
      entityType,
      entityId,
      field,
      sourceId: this.sourceId,
      sourceRecordId: recordId,
      valueHash: hashOf(v),
      observedAt,
      isWinning: true,
    }));
    if (rows.length === 0) return;
    await this.db
      .insert(fieldProvenance)
      .values(rows)
      .onConflictDoUpdate({
        target: [fieldProvenance.entityType, fieldProvenance.entityId, fieldProvenance.field, fieldProvenance.sourceId],
        set: {
          valueHash: sql`excluded.value_hash`,
          observedAt: sql`excluded.observed_at`,
          sourceRecordId: sql`excluded.source_record_id`,
        },
      });
  }

  /** Время наблюдения источника: момент скачивания карточки (MJ-5), а не момент загрузки в БД. */
  async upsert(ne: NormalizedEvent, raw: Record<string, unknown>, observedAt: Date = new Date()): Promise<string> {
    const payloadHash = hashOf(raw);
    const [rec] = await this.db
      .select()
      .from(sourceRecord)
      .where(and(eq(sourceRecord.sourceId, this.sourceId), eq(sourceRecord.externalId, ne.externalId)));
    let recordId: number;
    let mappedEventId: string | null = null;
    const problems = validate(ne, observedAt);
    if (!rec) {
      const [row] = await this.db
        .insert(sourceRecord)
        .values({
          sourceId: this.sourceId,
          externalId: ne.externalId,
          payload: raw,
          payloadHash,
          fetchedAt: observedAt,
          lastSeenRun: this.runId,
          parseStatus: problems.length ? "warning" : "ok",
          parseErrors: problems,
        })
        .returning({ id: sourceRecord.id });
      recordId = row!.id;
    } else {
      recordId = rec.id;
      mappedEventId = rec.mappedEventId;
      if (!this.force && rec.payloadHash === payloadHash && rec.mappedEventId) {
        await this.db
          .update(sourceRecord)
          .set({ lastSeenRun: this.runId, seenCount: sql`${sourceRecord.seenCount} + 1` })
          .where(eq(sourceRecord.id, rec.id));
        await this.confirmUnchanged(ne, rec.id, observedAt);
        this.stats.eventsUnchanged++;
        return rec.mappedEventId;
      }
      await this.db
        .update(sourceRecord)
        .set({
          payload: raw,
          payloadHash,
          fetchedAt: observedAt,
          lastSeenRun: this.runId,
          seenCount: sql`${sourceRecord.seenCount} + 1`,
          parseStatus: problems.length ? "warning" : "ok",
          parseErrors: problems,
        })
        .where(eq(sourceRecord.id, rec.id));
    }

    const orgId = await this.ensureOrganization(ne);
    const venues = await this.ensureVenues(ne, orgId);
    const values: Record<EventField, unknown> = {
      title: { ru: ne.title },
      summary: ne.summary ? { ru: ne.summary } : {},
      description: ne.descriptionHtml ? { ru: ne.descriptionHtml } : {},
      categoryCodes: ne.categories,
      tags: ne.tags,
      ageRating: ne.ageRating,
      priceMin: ne.priceMin,
      priceMax: ne.priceMax,
      isFree: ne.isFree,
      pushkinCard: ne.pushkinCard,
      images: ne.images,
      ticketUrl: ne.ticketUrl,
      sourceUrl: ne.sourceUrl,
      organizationId: orgId,
      accessibility: ne.accessible ? { accessible: true } : {},
      languages: ne.languages,
      isPermanent: ne.isPermanent,
      sourceGenres: ne.sourceGenres,
    };
    // 436-ФЗ: без возрастного знака событие не публикуется — уходит в очередь (docs/06-data.md §4, MJ-22)
    const publishable = ne.ageRating !== null;

    let eventId = mappedEventId;
    let changed: Record<string, unknown> = {};
    const existing = eventId ? (await this.db.select().from(event).where(eq(event.id, eventId)))[0] : undefined;
    if (!existing) {
      const [row] = await this.db
        .insert(event)
        .values({
          regionId: REGION_ID,
          trustLevel: SOURCES[this.sourceId]?.trust ?? "official",
          moderationStatus: publishable ? "published" : "pending",
          ...(values as object),
        } as typeof event.$inferInsert)
        .returning({ id: event.id });
      eventId = row!.id;
      await this.db.update(sourceRecord).set({ mappedEventId: eventId }).where(eq(sourceRecord.id, recordId));
      this.log({ entityType: "event", entityId: eventId, eventId, kind: "created", new: { title: ne.title } });
      this.stats.eventsNew++;
      changed = values;
    } else {
      eventId = existing.id;
      for (const f of EVENT_FIELDS) {
        const oldV = (existing as Record<string, unknown>)[f];
        const newV = values[f];
        if (hashOf(oldV ?? null) !== hashOf(newV ?? null)) {
          changed[f] = newV;
          if (LOGGED_FIELDS.has(f))
            this.log({
              entityType: "event",
              entityId: eventId,
              eventId,
              kind: "field",
              field: f,
              old: oldV,
              new: newV,
            });
        }
      }
      const patch: Record<string, unknown> = { ...changed };
      // Опубликованное событие потеряло возрастной знак — снимаем с публикации до решения модератора
      if (!publishable && existing.moderationStatus === "published") patch.moderationStatus = "pending";
      if (publishable && existing.moderationStatus === "pending") patch.moderationStatus = "published";
      if (Object.keys(patch).length > 0) {
        await this.db
          .update(event)
          .set({ ...(patch as object), updatedAt: new Date() })
          .where(eq(event.id, eventId));
        if (Object.keys(changed).length > 0) this.stats.eventsUpdated++;
        else this.stats.eventsUnchanged++;
      } else {
        this.stats.eventsUnchanged++;
      }
    }
    await this.provenance("event", eventId, changed, recordId, observedAt);
    await this.refreshProvenance(recordId, observedAt);
    await this.syncSessions(ne, eventId, venues, recordId, observedAt);
    if (problems.length) await this.validationTask(eventId, ne, problems);
    return eventId;
  }

  /** Карточка источника не изменилась: подтверждаем сеансы и возвращаем «исчезнувшие» события (MJ-1). */
  private async confirmUnchanged(ne: NormalizedEvent, recordId: number, observedAt: Date) {
    const prefix = `${this.sourceId}:${ne.externalId}:`;
    const back = (
      await this.db.execute<{ id: string; event_id: string }>(sql`
        UPDATE occurrence SET status = 'scheduled', freshness = 'fresh', status_reason = NULL,
               last_verified_at = greatest(coalesce(last_verified_at, ${observedAt}), ${observedAt}), updated_at = now()
        WHERE source_key LIKE ${`${prefix}%`} AND status = 'unverified'
          AND status_reason = ANY(${pgTextArray(EVENT_MISSING_ANY)}::text[])
          AND coalesce(ends_at, starts_at) > now()
        RETURNING id, event_id`)
    ).rows;
    for (const r of back)
      this.log({
        entityType: "occurrence",
        entityId: r.id,
        eventId: r.event_id,
        kind: "status",
        field: "status",
        old: "unverified",
        new: "scheduled",
        reason: "Событие снова подтверждено источником",
      });
    await this.closeVanishedTasks(back.map((b) => b.id));
    await this.db.execute(sql`
      UPDATE occurrence SET last_verified_at = greatest(coalesce(last_verified_at, ${observedAt}), ${observedAt}),
             freshness = CASE WHEN freshness = 'vanished' THEN freshness ELSE 'fresh' END
      WHERE source_key LIKE ${`${prefix}%`} AND status NOT IN ('unverified')`);
    await this.refreshProvenance(recordId, observedAt);
  }

  /** Источник снова показал сеансы — их задачи «исчезнувший сеанс» решены сами собой. */
  private async closeVanishedTasks(occurrenceIds: string[]) {
    if (occurrenceIds.length === 0) return;
    await this.db.execute(sql`
      UPDATE moderation_task SET state = 'done', resolution = 'source_confirmed', resolved_by = ${this.sourceId},
             payload = payload || ${JSON.stringify({ resolution_text: "Источник снова показывает сеанс — решение не требуется" })}::jsonb,
             updated_at = now()
      WHERE kind = 'vanished' AND state = 'open' AND entity_id = ANY(${`{${occurrenceIds.join(",")}}`}::uuid[])`);
  }

  /** Поле подтверждено источником в этом прогоне — обновляем время наблюдения (MJ-4). */
  private async refreshProvenance(recordId: number, observedAt: Date) {
    await this.db.execute(sql`
      UPDATE field_provenance SET observed_at = greatest(observed_at, ${observedAt})
      WHERE source_record_id = ${recordId}`);
  }

  /** Противоречия и пропуски в записи источника — задача модератору (одна открытая на событие). */
  private async validationTask(eventId: string, ne: NormalizedEvent, problems: string[]) {
    const hard = problems.some((p) => p.startsWith("age:"));
    await this.db.execute(sql`
      INSERT INTO moderation_task (region_id, kind, entity_type, entity_id, priority, payload)
      SELECT ${REGION_ID}, 'validation', 'event', ${eventId}, ${hard ? 80 : 30},
             ${JSON.stringify({ title: ne.title, problems, source: this.sourceId, external_id: ne.externalId })}::jsonb
      WHERE NOT EXISTS (SELECT 1 FROM moderation_task WHERE kind = 'validation' AND state = 'open' AND entity_id = ${eventId})`);
  }

  /** Дубли-замены: сеанс и его provenance удаляются, открытые задачи по нему закрываются (журнал не пишем — это не изменение афиши). */
  private async deleteReplaced(ids: string[]) {
    await deleteReplacedOccurrences(this.db, ids);
    this.stats.replaced += ids.length;
  }

  private async syncSessions(
    ne: NormalizedEvent,
    eventId: string,
    venues: Map<string, { id: string; muni: string | null }>,
    recordId: number,
    observedAt: Date,
  ) {
    // Сеансы записи узнаём по ключу источника, а не по событию: после слияния они могут жить у канонического (BL-2)
    const prefix = `${this.sourceId}:${ne.externalId}:`;
    const existing = new Map(
      (
        await this.db
          .select()
          .from(occurrence)
          .where(sql`${occurrence.sourceKey} LIKE ${`${prefix}%`}`)
      ).map((o) => [o.sourceKey!, o]),
    );
    // Новые сеансы слитого (скрытого) события — сразу в каноническое
    const [ev] = await this.db.select({ clusterId: event.clusterId }).from(event).where(eq(event.id, eventId));
    const targetEventId = ev?.clusterId ?? eventId;
    const now = new Date();
    // Источник сменил внешний id сеанса, а время (±15 мин) и зал те же — это тот же сеанс: переносим ключ
    // на существующую запись вместо «исчез» + новый дубль (прод 15.11: «День рождения кота Леопольда»)
    const incoming = new Set(ne.sessions.map((s) => `${prefix}${s.externalId}`));
    const orphans = [...existing.values()].filter(
      (o) =>
        !incoming.has(o.sourceKey!) &&
        !o.isRange &&
        o.startsAt > now &&
        (o.status === "scheduled" ||
          o.status === "sold_out" ||
          (o.status === "unverified" && MISSING_ANY.includes(o.statusReason ?? ""))),
    );
    for (const s of ne.sessions) {
      const key = `${prefix}${s.externalId}`;
      if (existing.has(key) || s.isRange || orphans.length === 0) continue;
      const vId = venues.get(s.venueExternalId ?? "")?.id ?? null;
      const i = orphans.findIndex(
        (o) =>
          (o.venueId ?? null) === vId && Math.abs(o.startsAt.getTime() - s.startsAt.getTime()) <= REPLACED_TOLERANCE_MS,
      );
      if (i === -1) continue;
      const [twin] = orphans.splice(i, 1);
      await this.db.update(occurrence).set({ sourceKey: key }).where(eq(occurrence.id, twin!.id));
      existing.delete(twin!.sourceKey!);
      existing.set(key, { ...twin!, sourceKey: key });
    }
    const seen = new Set<string>();
    const restored: string[] = [];
    for (const s of ne.sessions) {
      const key = `${prefix}${s.externalId}`;
      seen.add(key);
      const v = venues.get(s.venueExternalId ?? "");
      const occ = existing.get(key);
      if (!occ) {
        if (targetEventId !== eventId) {
          // у канонического уже есть такой сеанс (та же площадка, ±45 мин) — не дублируем
          const twin = await this.db.execute(sql`
            SELECT 1 FROM occurrence k WHERE k.event_id = ${targetEventId} AND k.venue_id IS NOT DISTINCT FROM ${v?.id ?? null}
              AND abs(extract(epoch FROM (k.starts_at - ${s.startsAt}::timestamptz))) <= 45 * 60 LIMIT 1`);
          if (twin.rows.length) continue;
        }
        const [created] = await this.db
          .insert(occurrence)
          .values({
            regionId: REGION_ID,
            eventId: targetEventId,
            venueId: v?.id ?? null,
            municipalityId: v?.muni ?? null,
            startsAt: s.startsAt,
            endsAt: s.endsAt,
            isRange: s.isRange,
            status: "scheduled",
            ticketUrl: s.ticketUrl,
            lastVerifiedAt: observedAt,
            freshness: "fresh",
            sourceKey: key,
          })
          .onConflictDoNothing()
          .returning({ id: occurrence.id });
        if (created) {
          this.stats.occurrencesNew++;
          await this.provenance(
            "occurrence",
            created.id,
            { starts_at: s.startsAt, venue_id: v?.id ?? null, ticket_url: s.ticketUrl },
            recordId,
            observedAt,
          );
        }
        continue;
      }
      const patch: Partial<typeof occurrence.$inferInsert> = {
        lastVerifiedAt: observedAt > (occ.lastVerifiedAt ?? new Date(0)) ? observedAt : occ.lastVerifiedAt,
        freshness: "fresh",
      };
      const changedFields: Record<string, unknown> = {};
      if (occ.status === "unverified") {
        patch.status = "scheduled";
        patch.statusReason = null;
        restored.push(occ.id);
        this.log({
          entityType: "occurrence",
          entityId: occ.id,
          eventId: occ.eventId,
          kind: "status",
          field: "status",
          old: "unverified",
          new: "scheduled",
          reason: "Событие снова подтверждено источником",
        });
      }
      // Сеанс, уже перенесённый учреждением, источник не двигает (BL-4): ждём, пока источник догонит
      const movable = occ.status !== "rescheduled" && occ.status !== "cancelled";
      if (movable && !occ.isRange && occ.startsAt.getTime() !== s.startsAt.getTime()) {
        this.log({
          entityType: "occurrence",
          entityId: occ.id,
          eventId: occ.eventId,
          kind: "rescheduled",
          field: "starts_at",
          old: occ.startsAt,
          new: s.startsAt,
          reason: "Источник изменил время начала",
        });
        patch.previousStartsAt = occ.startsAt;
        patch.startsAt = s.startsAt;
        changedFields.starts_at = s.startsAt;
        this.stats.occurrencesChanged++;
      }
      if (occ.isRange) patch.startsAt = s.startsAt;
      if (movable) patch.endsAt = s.endsAt;
      if (v && occ.venueId !== v.id) {
        this.log({
          entityType: "occurrence",
          entityId: occ.id,
          eventId: occ.eventId,
          kind: "field",
          field: "venue_id",
          old: occ.venueId,
          new: v.id,
        });
        patch.venueId = v.id;
        patch.municipalityId = v.muni;
        changedFields.venue_id = v.id;
      }
      if (occ.ticketUrl !== s.ticketUrl) changedFields.ticket_url = s.ticketUrl;
      patch.ticketUrl = s.ticketUrl;
      await this.db.update(occurrence).set(patch).where(eq(occurrence.id, occ.id));
      if (Object.keys(changedFields).length)
        await this.provenance("occurrence", occ.id, changedFields, recordId, observedAt);
    }
    await this.closeVanishedTasks(restored);
    // Сеанс исчез из карточки источника до своей даты → «уточняется»; но если в карточке есть живой сеанс
    // на то же время в том же зале (старая запись-дубль после смены id) — это замена, удаляем дубль молча
    const live = [...existing.entries()].filter(([key]) => seen.has(key)).map(([, o]) => o);
    const replacedBy = (o: typeof occurrence.$inferSelect) =>
      !o.isRange &&
      live.some(
        (k) =>
          k.id !== o.id &&
          (k.venueId ?? null) === (o.venueId ?? null) &&
          Math.abs(k.startsAt.getTime() - o.startsAt.getTime()) <= REPLACED_TOLERANCE_MS,
      );
    const stale = [...existing].filter(
      ([key, occ]) =>
        !seen.has(key) &&
        occ.startsAt > now &&
        (occ.status === "scheduled" ||
          occ.status === "sold_out" ||
          (occ.status === "unverified" && MISSING_ANY.includes(occ.statusReason ?? ""))) &&
        replacedBy(occ),
    );
    if (stale.length) await this.deleteReplaced(stale.map(([, o]) => o.id));
    const staleIds = new Set(stale.map(([, o]) => o.id));
    const vanished = [...existing].filter(
      ([key, occ]) =>
        !seen.has(key) &&
        !staleIds.has(occ.id) &&
        occ.startsAt > now &&
        (occ.status === "scheduled" || occ.status === "sold_out"),
    );
    for (const [, occ] of vanished)
      this.log({
        entityType: "occurrence",
        entityId: occ.id,
        eventId: occ.eventId,
        kind: "status",
        field: "status",
        old: occ.status,
        new: "unverified",
        reason: SESSION_MISSING_REASON,
      });
    if (vanished.length) {
      await this.db
        .update(occurrence)
        .set({ status: "unverified", freshness: "vanished", statusReason: SESSION_MISSING_REASON })
        .where(
          inArray(
            occurrence.id,
            vanished.map(([, o]) => o.id),
          ),
        );
      this.stats.vanished += vanished.length;
    }
  }
}

// Причины статуса «уточняется»: сам статус уже говорит «информация уточняется», в причине его не повторяем
export const EVENT_MISSING_REASON = "Событие исчезло из источника";
export const SESSION_MISSING_REASON = "Сеанс исчез из источника";
/** Прежние формулировки (до 15.11.2026) — остаются в уже записанных сеансах, по ним тоже узнаём «исчезнувшие». */
export const LEGACY_EVENT_MISSING_REASON = "Событие исчезло из источника — информация уточняется";
export const LEGACY_SESSION_MISSING_REASON = "Сеанс исчез из источника — информация уточняется";
const EVENT_MISSING_ANY = [EVENT_MISSING_REASON, LEGACY_EVENT_MISSING_REASON];
const MISSING_ANY = [...EVENT_MISSING_ANY, SESSION_MISSING_REASON, LEGACY_SESSION_MISSING_REASON];
const pgTextArray = (xs: readonly string[]) => `{${xs.map((x) => `"${x.replace(/(["\\])/g, "\\$1")}"`).join(",")}}`;
/** Сеанс с новым внешним id на то же время (± столько) и в том же зале — замена, а не исчезновение. */
const REPLACED_TOLERANCE_MS = 15 * 60_000;

const MONTH_STEMS = [
  "январ",
  "феврал",
  "март",
  "апрел",
  "ма",
  "июн",
  "июл",
  "август",
  "сентябр",
  "октябр",
  "ноябр",
  "декабр",
];

/** Проверка записи источника (docs/06-data.md §3): пропуски и противоречия → parse_errors и задача модератору. */
export function validate(ne: NormalizedEvent, now: Date): string[] {
  const problems: string[] = [];
  if (ne.ageRating === null) problems.push("age: нет возрастного знака (436-ФЗ) — событие не публикуется");
  if (ne.venues.length === 0) problems.push("venue: нет площадки в регионе");
  const future = ne.sessions.filter((s) => (s.endsAt ?? s.startsAt).getTime() > now.getTime());
  if (ne.sessions.length > 0 && future.length === 0) problems.push("sessions: нет будущих сеансов");
  // Дата в тексте анонса, которой нет среди сеансов (пример жюри: «4 ноября» в описании, сеанс 7 ноября)
  const sessionDays = new Set(ne.sessions.map((s) => localParts(s.startsAt).date.slice(5)));
  for (const m of `${ne.title} ${ne.summary}`.toLowerCase().matchAll(/(?<!\d)(\d{1,2})\s+([\p{L}]+)/gu)) {
    const mi = MONTH_STEMS.findIndex((x) => m[2]!.startsWith(x));
    if (mi === -1 || ne.sessions.some((s) => s.isRange)) continue;
    const md = `${String(mi + 1).padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    if (sessionDays.size > 0 && !sessionDays.has(md)) {
      problems.push(`date: в описании «${m[0]}», среди сеансов такой даты нет`);
      break;
    }
  }
  return problems;
}

export async function startRun(db: Exec, sourceId: string): Promise<number> {
  const [row] = await db.insert(sourceRun).values({ sourceId }).returning({ id: sourceRun.id });
  return row!.id;
}

/**
 * Закрыть прогон. При полном и успешном прогоне — пометить события, исчезнувшие из источника целиком,
 * и поставить задачи модератору (docs/06-data.md §7, BL-1, MJ-3). При частичном прогоне детектор не запускается (MJ-2).
 */
export async function finishRun(
  db: Exec,
  sourceId: string,
  runId: number,
  stats: IngestStats,
  complete: boolean,
  failed = false,
) {
  if (complete && !failed) {
    const res = await db.execute<{ id: string; event_id: string; starts_at: string; title: string }>(sql`
      WITH gone AS (
        SELECT source_id || ':' || external_id || ':' AS prefix FROM source_record
        WHERE source_id = ${sourceId} AND last_seen_run IS DISTINCT FROM ${runId} AND mapped_event_id IS NOT NULL
      )
      UPDATE occurrence o SET status = 'unverified', freshness = 'vanished', status_reason = ${EVENT_MISSING_REASON}, updated_at = now()
      FROM gone WHERE o.source_key LIKE gone.prefix || '%' AND o.starts_at > now() AND o.status IN ('scheduled', 'sold_out')
      RETURNING o.id, o.event_id, o.starts_at, (SELECT title->>'ru' FROM event WHERE id = o.event_id) AS title`);
    for (const r of res.rows) {
      const days = Math.max(0, (new Date(r.starts_at).getTime() - Date.now()) / 86400_000);
      await db.execute(sql`
        INSERT INTO change_log (region_id, entity_type, entity_id, event_id, kind, field, old_value, new_value, source_id, actor, reason)
        VALUES (${REGION_ID}, 'occurrence', ${r.id}, ${r.event_id}, 'status', 'status', '"scheduled"'::jsonb, '"unverified"'::jsonb,
                ${sourceId}, ${sourceId}, ${EVENT_MISSING_REASON})`);
      await db.execute(sql`
        INSERT INTO moderation_task (region_id, kind, entity_type, entity_id, priority, payload)
        SELECT ${REGION_ID}, 'vanished', 'occurrence', ${r.id}, ${Math.round(100 - Math.min(days, 60))},
               ${JSON.stringify({ title: r.title, starts_at: r.starts_at, source: sourceId, actions: ["confirm", "cancel"] })}::jsonb
        WHERE NOT EXISTS (SELECT 1 FROM moderation_task WHERE kind = 'vanished' AND state = 'open' AND entity_id = ${r.id})`);
    }
    stats.vanished += res.rows.length;
  }
  const { errors, ...rest } = stats;
  const finished = new Date();
  const status = failed ? "failed" : errors.length ? "partial" : "ok";
  await db
    .update(sourceRun)
    .set({ finishedAt: finished, status, stats: { ...rest, complete, errors: errors.slice(0, 50) } })
    .where(eq(sourceRun.id, runId));
  // «Последний успешный» — только для полностью успешного прогона (MJ-14)
  await db
    .update(source)
    .set({
      lastRunAt: finished,
      ...(status === "ok" ? { lastSuccessAt: finished } : {}),
      lastStats: { ...rest, status, errors: errors.length },
    })
    .where(eq(source.id, sourceId));
}

async function deleteReplacedOccurrences(db: Exec, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const arr = `{${ids.join(",")}}`;
  await db.execute(sql`
    UPDATE moderation_task SET state = 'done', resolution = 'replaced', resolved_by = 'ingestion',
           payload = payload || ${JSON.stringify({ resolution_text: "Источник заменил сеанс таким же (то же время и зал) — решение не требуется" })}::jsonb,
           updated_at = now()
    WHERE state = 'open' AND entity_type = 'occurrence' AND entity_id = ANY(${arr}::uuid[])`);
  await db.execute(
    sql`DELETE FROM field_provenance WHERE entity_type = 'occurrence' AND entity_id = ANY(${arr}::uuid[])`,
  );
  await db.execute(sql`DELETE FROM occurrence WHERE id = ANY(${arr}::uuid[])`);
}

/**
 * Разовая чистка дублей, возникших до исправления (CLI `ingest:cleanup-replaced`): сеанс «уточняется»
 * (исчез из источника) удаляется, если у того же события от того же источника есть живой сеанс
 * в том же зале на то же время (±15 мин). Без журнала, уведомлений и задач модератору.
 */
export async function cleanupReplacedSessions(
  db: Db,
  opts: { dryRun?: boolean } = {},
): Promise<{ replaced: number; examples: { event_id: string; title: string; starts_at: string }[] }> {
  const rows = (
    await db.execute<{ id: string; event_id: string; title: string; starts_at: string }>(sql`
      SELECT DISTINCT ON (o.id) o.id, o.event_id, e.title->>'ru' AS title, o.starts_at::text AS starts_at
      FROM occurrence o
      JOIN event e ON e.id = o.event_id
      JOIN occurrence k ON k.event_id = o.event_id AND k.id <> o.id
        AND split_part(k.source_key, ':', 1) = split_part(o.source_key, ':', 1)
        AND k.status IN ('scheduled', 'sold_out')
        AND k.venue_id IS NOT DISTINCT FROM o.venue_id
        AND NOT k.is_range
        AND abs(extract(epoch FROM (k.starts_at - o.starts_at))) * 1000 <= ${REPLACED_TOLERANCE_MS}
      WHERE o.status = 'unverified' AND NOT o.is_range AND o.starts_at > now()
        AND o.status_reason = ANY(${pgTextArray(MISSING_ANY)}::text[])
      ORDER BY o.id`)
  ).rows;
  if (!opts.dryRun && rows.length)
    await db.transaction((tx) =>
      deleteReplacedOccurrences(
        tx,
        rows.map((r) => r.id),
      ),
    );
  return { replaced: rows.length, examples: rows.slice(0, 10).map(({ id: _id, ...r }) => r) };
}

/** Прежние причины «… — информация уточняется» → короткие (статус уже говорит «уточняется»). Журнал не трогаем: он append-only. */
export async function normalizeMissingReasons(db: Db, opts: { dryRun?: boolean } = {}): Promise<number> {
  const pairs = [
    [LEGACY_EVENT_MISSING_REASON, EVENT_MISSING_REASON],
    [LEGACY_SESSION_MISSING_REASON, SESSION_MISSING_REASON],
  ] as const;
  let n = 0;
  for (const [from, to] of pairs) {
    const res = opts.dryRun
      ? await db.execute(sql`SELECT 1 FROM occurrence WHERE status_reason = ${from}`)
      : await db.execute(sql`UPDATE occurrence SET status_reason = ${to} WHERE status_reason = ${from}`);
    n += res.rowCount ?? 0;
  }
  return n;
}
