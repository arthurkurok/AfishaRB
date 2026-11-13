package ru.tamasha.afisha.core.network

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import ru.tamasha.afisha.api.models.AssistantResponse
import ru.tamasha.afisha.api.models.EventDetail
import ru.tamasha.afisha.api.models.EventDetailOccurrencesInner
import ru.tamasha.afisha.api.models.Image
import ru.tamasha.afisha.api.models.OccurrenceCard
import ru.tamasha.afisha.api.models.SearchResult
import ru.tamasha.afisha.api.models.VenueDetail
import ru.tamasha.afisha.api.models.VenueRef
import ru.tamasha.afisha.core.model.AssistantKind
import ru.tamasha.afisha.core.model.AssistantMode
import ru.tamasha.afisha.core.model.AssistantPick
import ru.tamasha.afisha.core.model.AssistantReply
import ru.tamasha.afisha.core.model.Availability
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.CategoryInfo
import ru.tamasha.afisha.core.model.Clarification
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.EventImage
import ru.tamasha.afisha.core.model.EventSummary
import ru.tamasha.afisha.core.model.EventTag
import ru.tamasha.afisha.core.model.Freshness
import ru.tamasha.afisha.core.model.GeoPoint
import ru.tamasha.afisha.core.model.HistoryEntry
import ru.tamasha.afisha.core.model.Municipality
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.OccurrencePage
import ru.tamasha.afisha.core.model.OccurrenceStatus
import ru.tamasha.afisha.core.model.Price
import ru.tamasha.afisha.core.model.Provenance
import ru.tamasha.afisha.core.model.ProvenanceSource
import ru.tamasha.afisha.core.model.QuickReply
import ru.tamasha.afisha.core.model.ReasonCode
import ru.tamasha.afisha.core.model.SlotSource
import ru.tamasha.afisha.core.model.Stats
import ru.tamasha.afisha.core.model.TrustLevel
import ru.tamasha.afisha.core.model.UnderstandingChip
import ru.tamasha.afisha.core.model.Venue
import ru.tamasha.afisha.core.model.VenueDetails
import ru.tamasha.afisha.api.models.Category as CategoryDto
import ru.tamasha.afisha.api.models.EventSummary as EventSummaryDto
import ru.tamasha.afisha.api.models.Municipality as MunicipalityDto
import ru.tamasha.afisha.api.models.Price as PriceDto
import ru.tamasha.afisha.api.models.QuickReply as QuickReplyDto
import ru.tamasha.afisha.api.models.Stats as StatsDto

/*
 * Маппинг сгенерированных DTO (именованные схемы контракта: OccurrenceCard, EventSummary, VenueRef…)
 * в доменную модель. Сеанс в паспорте события (EventDetailOccurrencesInner) приходит без вложенного
 * события — подставляем сводку самого паспорта.
 */

private const val UNKNOWN = "unknown_default_open_api"

/** Значения из будущих версий API (unknown_default_open_api) отбрасываются, а не ломают экран. */
private fun <T> List<String>.codes(parse: (String) -> T?): List<T> = filter { it != UNKNOWN }.mapNotNull(parse)

// ---------- Цена, изображение, площадка ----------

internal fun PriceDto.toDomain(): Price = Price(min = min?.toBigDecimalOrNull(), max = max?.toBigDecimalOrNull(), isFree = isFree)

internal fun Image.toDomain(): EventImage = EventImage(url, author?.decodeHtmlEntities(), source, license, width, height, color)

/** Координаты приходят кортежем [lat, lon] (prefixItems в OpenAPI 3.1 → список JsonElement). */
internal fun List<JsonElement?>?.toGeo(): GeoPoint? {
    if (this == null || size != 2) return null
    val lat = (this[0] as? JsonPrimitive)?.doubleOrNull ?: return null
    val lon = (this[1] as? JsonPrimitive)?.doubleOrNull ?: return null
    return GeoPoint(lat, lon)
}

internal fun VenueRef.toDomain(): Venue =
    Venue(id, name.decodeHtmlEntities(), address?.decodeHtmlEntities(), geo.toGeo(), municipalityId, municipality)

// ---------- Событие и сеанс ----------

@Suppress("LongParameterList")
private fun eventSummary(
    id: String,
    title: String,
    summary: String,
    categories: List<String>,
    tags: List<String>,
    ageRating: Int,
    pushkinCard: Boolean,
    price: PriceDto,
    image: Image?,
    organization: String?,
): EventSummary = EventSummary(
    id = id,
    title = title.decodeHtmlEntities(),
    summary = summary.decodeHtmlEntities(),
    categories = categories.codes(Category::fromCode),
    tags = tags.codes(EventTag::fromCode).toSet(),
    ageRating = ageRating,
    pushkinCard = pushkinCard,
    price = price.toDomain(),
    image = image?.toDomain(),
    organization = organization?.decodeHtmlEntities(),
)

internal fun EventSummaryDto.toDomain(): EventSummary = eventSummary(
    id, title, summary, categories.map { it.value }, tags.map { it.value }, ageRating, pushkinCard, price, image, organization,
)

internal fun EventDetail.toSummary(): EventSummary = eventSummary(
    id, title, summary, categories.map { it.value }, tags.map { it.value }, ageRating, pushkinCard, price, image, organization,
)

@Suppress("LongParameterList")
private fun occurrence(
    id: String,
    event: EventSummary,
    venue: VenueRef?,
    startsAt: String,
    endsAt: String?,
    isRange: Boolean,
    status: String,
    statusReason: String?,
    previousStartsAt: String?,
    availability: String,
    ticketUrl: String?,
    moreDates: Int,
    distanceKm: Double?,
    reasons: List<String>,
    freshness: String,
): Occurrence = Occurrence(
    id = id,
    event = event,
    venue = venue?.toDomain(),
    startsAt = startsAt,
    endsAt = endsAt,
    isRange = isRange,
    status = OccurrenceStatus.fromCode(status),
    statusReason = statusReason,
    previousStartsAt = previousStartsAt,
    availability = Availability.fromCode(availability),
    ticketUrl = ticketUrl,
    moreDates = moreDates,
    distanceKm = distanceKm,
    reasons = reasons.codes(ReasonCode::fromCode),
    freshness = Freshness.fromCode(freshness),
)

internal fun OccurrenceCard.toDomain(): Occurrence = occurrence(
    id, event.toDomain(), venue, startsAt, endsAt, isRange, status.value, statusReason,
    previousStartsAt, availability.value, ticketUrl, moreDates, distanceKm, reasons.map { it.value }, freshness.value,
)

internal fun EventDetailOccurrencesInner.toDomain(event: EventSummary): Occurrence = occurrence(
    id, event, venue, startsAt, endsAt, isRange, status.value, statusReason,
    previousStartsAt, availability.value, ticketUrl, moreDates, distanceKm, reasons.map { it.value }, freshness.value,
)

internal fun SearchResult.toDomain(): OccurrencePage = OccurrencePage(
    items = items.map { it.toDomain() },
    total = total,
    nextCursor = nextCursor,
    appliedDateFrom = applied.dateFrom,
    appliedDateTo = applied.dateTo,
)

/** Признаки доступности: true → «true», строка → строка, false/null — признака нет. */
private fun Map<String, JsonElement?>.toAccessibility(): Map<String, String> = buildMap {
    for ((key, value) in this@toAccessibility) {
        if (value == null || value is JsonNull) continue
        val primitive = value as? JsonPrimitive ?: continue
        when (primitive.booleanOrNull) {
            true -> put(key, "true")
            false -> Unit
            null -> primitive.content.takeIf { it.isNotBlank() }?.let { put(key, it) }
        }
    }
}

internal fun EventDetail.toDomain(): EventDetails {
    val summary = toSummary()
    return EventDetails(
        summary = summary,
        descriptionHtml = descriptionHtml,
        images = images.map { it.toDomain() },
        languages = languages,
        isPermanent = isPermanent,
        ticketUrl = ticketUrl,
        accessibility = accessibility.toAccessibility(),
        occurrences = occurrences.map { it.toDomain(summary) },
        provenance = Provenance(
            trustLevel = TrustLevel.fromCode(provenance.trustLevel.value),
            sources = provenance.sources.map { ProvenanceSource(it.id, it.title, it.url) },
            lastVerifiedAt = provenance.lastVerifiedAt,
            freshness = Freshness.fromCode(provenance.freshness.value),
        ),
        history = history.map { HistoryEntry(it.at, it.kind, it.`field`, it.text, it.source) },
        sourceUrl = sourceUrl,
    )
}

internal fun VenueDetail.toDomain(): VenueDetails = VenueDetails(
    venue = Venue(id, name.decodeHtmlEntities(), address?.decodeHtmlEntities(), geo.toGeo(), municipalityId, municipality),
    organization = organization?.decodeHtmlEntities(),
    accessibility = accessibility.toAccessibility(),
    upcoming = upcoming.map { it.toDomain() },
    upcomingTotal = upcomingTotal,
)

// ---------- Справочники ----------

internal fun CategoryDto.toDomain(): CategoryInfo? =
    Category.fromCode(code.value)?.let { CategoryInfo(it, title, count) }

internal fun MunicipalityDto.toDomain(): Municipality = Municipality(
    id = id,
    isCity = kind.value == "city",
    name = name,
    nameRu = nameRu,
    nameBa = nameBa,
    center = center.toGeo(),
    upcoming = upcoming,
)

internal fun StatsDto.toDomain(): Stats = Stats(
    events = events,
    upcomingOccurrences = upcomingOccurrences,
    venues = venues,
    municipalitiesWithEvents = municipalitiesWithEvents,
    freeShare = freeShare,
    pushkinShare = pushkinShare,
    updatedAt = updatedAt,
)

// ---------- Гид ----------

private fun QuickReplyDto.toDomain(): QuickReply = QuickReply(id, label, patch)

internal fun AssistantResponse.toDomain(): AssistantReply = AssistantReply(
    conversationId = conversationId,
    kind = AssistantKind.fromCode(kind.value),
    text = text,
    chips = chips.map { UnderstandingChip(it.slot, it.label, SlotSource.fromCode(it.source.value), it.clear) },
    clarify = clarify?.let { c -> Clarification(c.slot, c.question, c.options.map { it.toDomain() }) },
    picks = picks.map { p ->
        AssistantPick(
            occurrence = p.occurrence.toDomain(),
            reasonCodes = p.reasonCodes.map { it.value }.codes(ReasonCode::fromCode),
            reasonText = p.reasonText,
        )
    },
    relaxed = relaxed,
    followups = followups.map { it.toDomain() },
    mode = if (mode.value == "llm") AssistantMode.Llm else AssistantMode.Rules,
)

/** В данных источников встречаются HTML-сущности («&quot;») — показываем текст, а не разметку. */
internal fun String.decodeHtmlEntities(): String {
    if ('&' !in this) return this
    return replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
        .replace("&laquo;", "«")
        .replace("&raquo;", "»")
        .replace("&nbsp;", " ")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}
