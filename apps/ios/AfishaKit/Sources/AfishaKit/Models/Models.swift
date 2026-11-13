import AfishaAPI
import Foundation

// Доменные типы — это типы, сгенерированные из контракта (packages/contract → openapi.json).
// Ручного маппинга DTO нет (docs/08-mobile.md §1): здесь только короткие имена и вычисляемые
// свойства поверх сгенерированных структур.

public typealias OccurrenceCard = Components.Schemas.OccurrenceCard
public typealias OccurrenceSession = Components.Schemas.OccurrenceSession
public typealias EventSummary = Components.Schemas.EventSummary
public typealias EventDetail = Components.Schemas.EventDetail
public typealias EventImage = Components.Schemas.Image
public typealias VenueRef = Components.Schemas.VenueRef
public typealias Price = Components.Schemas.Price
public typealias Provenance = Components.Schemas.Provenance
public typealias ProvenanceSource = Components.Schemas.ProvenanceSource
public typealias ChangeEntry = Components.Schemas.ChangeEntry
public typealias SearchResult = Components.Schemas.SearchResult
public typealias CategoryInfo = Components.Schemas.Category
public typealias Municipality = Components.Schemas.Municipality
public typealias Stats = Components.Schemas.Stats
public typealias CategoryCode = Components.Schemas.CategoryCode
public typealias TagCode = Components.Schemas.TagCode
public typealias OccurrenceStatus = Components.Schemas.OccurrenceStatus
public typealias Availability = Components.Schemas.Availability
public typealias TrustLevel = Components.Schemas.TrustLevel
public typealias Freshness = Components.Schemas.Freshness
public typealias ReasonCode = Components.Schemas.ReasonCode
public typealias SortMode = Components.Schemas.SortMode
public typealias ReportReason = Components.Schemas.ReportReason
public typealias ReportRequest = Components.Schemas.ReportRequest
public typealias AssistantRequest = Components.Schemas.AssistantRequest
public typealias AssistantResponse = Components.Schemas.AssistantResponse
public typealias AssistantPick = Components.Schemas.AssistantPick
public typealias AssistantKind = Components.Schemas.AssistantKind
public typealias AssistantMode = Components.Schemas.AssistantMode
public typealias SlotChip = Components.Schemas.SlotChip
public typealias SlotSource = Components.Schemas.SlotSource
public typealias QuickReply = Components.Schemas.QuickReply
public typealias Slots = Components.Schemas.Slots
public typealias Clarify = Components.Schemas.Clarify

/// Общие поля сеанса: карточка выдачи (`OccurrenceCard`) и сеанс в паспорте (`OccurrenceSession`).
public protocol SessionFields {
    var id: String { get }
    var venue: VenueRef? { get }
    var startsAt: String { get }
    var endsAt: String? { get }
    var isRange: Bool { get }
    var status: OccurrenceStatus { get }
    var statusReason: String? { get }
    var previousStartsAt: String? { get }
    var availability: Availability { get }
    var ticketUrl: String? { get }
}

extension OccurrenceCard: SessionFields {}
extension OccurrenceSession: SessionFields {}

extension SessionFields {
    public var startDate: Date? { APIDate.parse(startsAt) }
    public var endDate: Date? { APIDate.parse(endsAt) }
    public var previousStartDate: Date? { APIDate.parse(previousStartsAt) }

    /// День начала в TZ региона.
    public var localDay: LocalDate? { startDate.map(LocalDate.init) }

    public var badge: StatusBadge? {
        StatusBadge(status: status.rawValue, availability: availability.rawValue, startsAt: startDate)
    }

    /// Ссылка на билеты сеанса, если она корректна.
    public var ticketURL: URL? { ticketUrl.flatMap(URL.init(string:)).flatMap { $0.scheme?.hasPrefix("http") == true ? $0 : nil } }

    /// Сеанс ещё впереди (или идёт) относительно `now`.
    public func isUpcoming(now: Date = Date()) -> Bool {
        guard let start = startDate else { return false }
        if let end = endDate { return end > now }
        return start.addingTimeInterval(3 * 3600) > now
    }
}

extension EventSummary {
    public var priceInfo: PriceInfo { PriceInfo(minString: price.min, maxString: price.max, isFree: price.isFree) }
    public var ageRatingValue: AgeRating { AgeRating(ageRating) }
    /// Основная категория — первая в списке; цвет каймы карточки.
    public var primaryCategory: CategoryCode { categories.first ?? .education }
    public var imageURL: URL? { image.flatMap { URL(string: $0.url) } }
}

extension EventDetail {
    public var priceInfo: PriceInfo { PriceInfo(minString: price.min, maxString: price.max, isFree: price.isFree) }
    public var primaryCategory: CategoryCode { categories.first ?? .education }
    public var imageURL: URL? { (image ?? images.first).flatMap { URL(string: $0.url) } }
    public var ticketURL: URL? { ticketUrl.flatMap(URL.init(string:)) }
    public var sourceURL: URL? { sourceUrl.flatMap(URL.init(string:)) }

    /// Сеансы по времени начала.
    public var sortedSessions: [OccurrenceSession] {
        occurrences.sorted { ($0.startDate ?? .distantFuture) < ($1.startDate ?? .distantFuture) }
    }

    /// Ближайший предстоящий сеанс (или последний прошедший, если все прошли).
    public func nearestSession(now: Date = Date()) -> OccurrenceSession? {
        let sorted = sortedSessions
        return sorted.first { $0.isUpcoming(now: now) && $0.status != .cancelled }
            ?? sorted.first { $0.isUpcoming(now: now) }
            ?? sorted.last
    }

    /// Краткая сводка события в формате карточки выдачи — для избранного и виджета.
    public func summary() -> EventSummary {
        EventSummary(
            id: id, title: title, summary: summary, categories: categories, tags: tags,
            ageRating: ageRating, pushkinCard: pushkinCard, price: price, image: image ?? images.first,
            organization: organization
        )
    }

    /// Карточка выдачи для сеанса этого события.
    public func card(for session: OccurrenceSession) -> OccurrenceCard {
        OccurrenceCard(
            id: session.id, event: summary(), venue: session.venue, startsAt: session.startsAt,
            endsAt: session.endsAt, isRange: session.isRange, status: session.status,
            statusReason: session.statusReason, previousStartsAt: session.previousStartsAt,
            availability: session.availability, ticketUrl: session.ticketUrl, moreDates: max(0, occurrences.count - 1),
            distanceKm: session.distanceKm, reasons: session.reasons, freshness: session.freshness
        )
    }
}

extension VenueRef {
    /// Координата площадки ([lat, lon] в API).
    public var coordinate: Coordinate? {
        guard let geo, geo.count == 2 else { return nil }
        return Coordinate(latitude: geo[0], longitude: geo[1])
    }
}

extension Municipality {
    public var coordinate: Coordinate? {
        guard let center, center.count == 2 else { return nil }
        return Coordinate(latitude: center[0], longitude: center[1])
    }
}

extension CategoryCode {
    /// Название категории без обращения к API (для офлайна и виджета).
    public func title(_ language: AppLanguage) -> String {
        Localizer(language: language)("category.\(rawValue)")
    }
}

extension TagCode {
    public func title(_ language: AppLanguage) -> String {
        Localizer(language: language)("tag.\(rawValue)")
    }
}

extension ReasonCode {
    /// Короткая подпись чипа причины («подходит по возрасту»).
    public func title(_ language: AppLanguage) -> String {
        Localizer(language: language)("reason.\(rawValue)")
    }
}
