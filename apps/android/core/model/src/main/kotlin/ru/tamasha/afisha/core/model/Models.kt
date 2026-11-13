package ru.tamasha.afisha.core.model

import kotlinx.serialization.Serializable
import java.math.BigDecimal

/** Цена: суммы в рублях; null — источник не сообщил. */
@Serializable
public data class Price(
    @Serializable(with = BigDecimalAsStringSerializer::class) val min: BigDecimal?,
    @Serializable(with = BigDecimalAsStringSerializer::class) val max: BigDecimal?,
    val isFree: Boolean,
)

/** Изображение с указанием авторства и лицензии (обязательно для показа). */
@Serializable
public data class EventImage(
    val url: String,
    val author: String?,
    val source: String?,
    val license: String?,
    val width: Int?,
    val height: Int?,
    /** Доминирующий цвет без «#», для плейсхолдера, пока грузится картинка. */
    val dominantColor: String?,
)

@Serializable
public data class GeoPoint(val lat: Double, val lon: Double)

@Serializable
public data class Venue(
    val id: String,
    val name: String,
    val address: String?,
    val geo: GeoPoint?,
    val municipalityId: String?,
    val municipality: String?,
)

/** Событие в кратком виде (для карточки). */
@Serializable
public data class EventSummary(
    val id: String,
    val title: String,
    val summary: String,
    val categories: List<Category>,
    val tags: Set<EventTag>,
    /** Возрастной знак 436-ФЗ: 0, 6, 12, 16, 18. Показывается всегда. */
    val ageRating: Int,
    val pushkinCard: Boolean,
    val price: Price,
    val image: EventImage?,
    val organization: String?,
) {
    /** Основная категория — цвет каймы и иллюстрация-заглушка. */
    val primaryCategory: Category get() = categories.firstOrNull() ?: Category.Education
}

/** Сеанс события. Время — RFC 3339 с офсетом региона; храним как есть, разбираем в [RegionClock]. */
@Serializable
public data class Occurrence(
    val id: String,
    val event: EventSummary,
    val venue: Venue?,
    val startsAt: String,
    val endsAt: String?,
    /** Длительное событие (выставка): действует с startsAt по endsAt. */
    val isRange: Boolean,
    val status: OccurrenceStatus,
    val statusReason: String?,
    val previousStartsAt: String?,
    val availability: Availability,
    val ticketUrl: String?,
    /** Сколько ещё сеансов этого события свёрнуто в выдаче. */
    val moreDates: Int,
    val distanceKm: Double?,
    val reasons: List<ReasonCode>,
    val freshness: Freshness,
)

@Serializable
public data class ProvenanceSource(val id: String, val title: String, val url: String?)

/** Блок доверия «Паспорт»: источники, проверка, свежесть. */
@Serializable
public data class Provenance(
    val trustLevel: TrustLevel,
    val sources: List<ProvenanceSource>,
    val lastVerifiedAt: String?,
    val freshness: Freshness,
)

/** Запись истории изменений события. */
@Serializable
public data class HistoryEntry(
    val at: String,
    val kind: String,
    val field: String?,
    /** Человекочитаемое описание изменения от сервера. */
    val text: String,
    val source: String?,
)

/** Паспорт события — всё, что нужно экрану события. */
@Serializable
public data class EventDetails(
    val summary: EventSummary,
    val descriptionHtml: String,
    val images: List<EventImage>,
    val languages: List<String>,
    val isPermanent: Boolean,
    val ticketUrl: String?,
    /** Признаки доступной среды: ключ → true/текст. */
    val accessibility: Map<String, String>,
    val occurrences: List<Occurrence>,
    val provenance: Provenance,
    val history: List<HistoryEntry>,
    val sourceUrl: String?,
)

@Serializable
public data class CategoryInfo(val category: Category, val title: String, val count: Int?)

@Serializable
public data class Municipality(
    val id: String,
    val isCity: Boolean,
    /** Название на языке запроса (ba — если есть). */
    val name: String,
    val nameRu: String,
    val nameBa: String?,
    val center: GeoPoint?,
    val upcoming: Int?,
)

@Serializable
public data class Stats(
    val events: Int,
    val upcomingOccurrences: Int,
    val venues: Int,
    val municipalitiesWithEvents: Int,
    val freeShare: Double,
    val pushkinShare: Double,
    val updatedAt: String?,
)

/** Страница выдачи поиска. */
@Serializable
public data class OccurrencePage(
    val items: List<Occurrence>,
    val total: Int,
    val nextCursor: String?,
    val appliedDateFrom: String?,
    val appliedDateTo: String?,
)

/** Причина «Сообщить о неточности». */
public enum class ReportReason(public val code: String) {
    Cancelled("cancelled"),
    WrongTime("wrong_time"),
    WrongPrice("wrong_price"),
    WrongPlace("wrong_place"),
    Other("other"),
}

/** Страница площадки (`GET /v1/venues/{id}`): адрес, доступность и ближайшие события. */
@Serializable
public data class VenueDetails(
    val venue: Venue,
    val organization: String?,
    val accessibility: Map<String, String>,
    val upcoming: List<Occurrence>,
    val upcomingTotal: Int,
)
