package ru.tamasha.afisha.core.data

import ru.tamasha.afisha.core.model.Availability
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.EventSummary
import ru.tamasha.afisha.core.model.Freshness
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.OccurrenceStatus
import ru.tamasha.afisha.core.model.Price
import ru.tamasha.afisha.core.model.Provenance
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.TrustLevel
import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset

internal fun clockAt(local: String) =
    RegionClock(clock = Clock.fixed(OffsetDateTime.parse("$local+05:00").toInstant(), ZoneOffset.UTC))

internal val sampleEvent = EventSummary(
    id = "e1", title = "Концерт", summary = "", categories = listOf(Category.Music), tags = emptySet(),
    ageRating = 6, pushkinCard = false, price = Price(null, null, isFree = true), image = null, organization = null,
)

internal fun session(id: String, startsAt: String, status: OccurrenceStatus = OccurrenceStatus.Scheduled) = Occurrence(
    id = id, event = sampleEvent, venue = null, startsAt = startsAt, endsAt = null, isRange = false, status = status,
    statusReason = null, previousStartsAt = null, availability = Availability.Unknown, ticketUrl = null, moreDates = 0,
    distanceKm = null, reasons = emptyList(), freshness = Freshness.Fresh,
)

internal fun details(vararg sessions: Occurrence) = EventDetails(
    summary = sampleEvent, descriptionHtml = "", images = emptyList(), languages = listOf("ru"), isPermanent = false,
    ticketUrl = null, accessibility = emptyMap(), occurrences = sessions.toList(),
    provenance = Provenance(TrustLevel.Official, emptyList(), null, Freshness.Fresh), history = emptyList(), sourceUrl = null,
)
