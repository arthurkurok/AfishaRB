import Foundation
import SwiftData

/// Событие в избранном. Хранит снимок карточки и паспорта события в JSON, поэтому избранное
/// открывается без сети — в районах РБ мобильный интернет нестабилен (docs/08-mobile.md §4).
@Model
public final class FavoriteEvent {
    /// ID события (UUID из API).
    @Attribute(.unique) public var eventID: String
    public var title: String
    /// Ближайший сеанс на момент сохранения — для сортировки и подписи без декодирования снимка.
    public var startsAt: Date?
    public var venueName: String?
    public var categoryCode: String?
    /// JSON `OccurrenceCard` — карточка в списке избранного.
    public var cardJSON: Data?
    /// JSON `EventDetail` — паспорт события офлайн.
    public var detailJSON: Data?
    public var addedAt: Date
    public var refreshedAt: Date?

    public init(eventID: String, title: String, startsAt: Date?, venueName: String?, categoryCode: String?,
                cardJSON: Data?, detailJSON: Data?, addedAt: Date = Date()) {
        self.eventID = eventID
        self.title = title
        self.startsAt = startsAt
        self.venueName = venueName
        self.categoryCode = categoryCode
        self.cardJSON = cardJSON
        self.detailJSON = detailJSON
        self.addedAt = addedAt
        self.refreshedAt = detailJSON == nil ? nil : addedAt
    }
}

/// Кэш ответа API по ключу запроса: последняя выдача главной, справочники, паспорта.
@Model
public final class CachedResponse {
    @Attribute(.unique) public var key: String
    public var payload: Data
    public var fetchedAt: Date

    public init(key: String, payload: Data, fetchedAt: Date = Date()) {
        self.key = key
        self.payload = payload
        self.fetchedAt = fetchedAt
    }
}

/// Схема хранилища и фабрика контейнера.
public enum AfishaStoreSchema {
    public static let models: [any PersistentModel.Type] = [FavoriteEvent.self, CachedResponse.self]

    /// Контейнер на диске (`inMemory` — для тестов и превью).
    public static func makeContainer(inMemory: Bool = false) throws -> ModelContainer {
        let schema = Schema(models)
        let configuration = ModelConfiguration("Afisha", schema: schema, isStoredInMemoryOnly: inMemory)
        return try ModelContainer(for: schema, configurations: [configuration])
    }
}
