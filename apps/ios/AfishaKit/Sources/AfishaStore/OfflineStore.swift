import AfishaKit
import Foundation
import Observation
import SwiftData

/// Офлайн-хранилище: избранное со снимками событий и кэш последних выдач.
///
/// Работает в главном контексте SwiftData (`@MainActor`): объёмы маленькие (десятки записей),
/// а интерфейс избранного читает их через `@Query`.
@MainActor
@Observable
public final class OfflineStore {
    public let container: ModelContainer
    private var context: ModelContext { container.mainContext }
    /// ID событий в избранном — быстрый ответ «в избранном ли» без запроса к базе.
    public private(set) var favoriteIDs: Set<String> = []

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    public init(container: ModelContainer) {
        self.container = container
        reloadFavoriteIDs()
    }

    /// Хранилище в памяти — для тестов и превью.
    public static func inMemory() throws -> OfflineStore {
        try OfflineStore(container: AfishaStoreSchema.makeContainer(inMemory: true))
    }

    // MARK: - Избранное

    public func isFavorite(_ eventID: String) -> Bool { favoriteIDs.contains(eventID) }

    /// Добавить карточку выдачи в избранное (паспорт подтянется при открытии события).
    public func addFavorite(card: OccurrenceCard) {
        guard !isFavorite(card.event.id) else { return }
        let favorite = FavoriteEvent(
            eventID: card.event.id,
            title: card.event.title,
            startsAt: card.startDate,
            venueName: card.venue?.name,
            categoryCode: card.event.primaryCategory.rawValue,
            cardJSON: try? encoder.encode(card),
            detailJSON: nil
        )
        context.insert(favorite)
        save()
    }

    /// Добавить событие из паспорта: сохраняется и карточка ближайшего сеанса, и весь паспорт.
    public func addFavorite(detail: EventDetail, now: Date = Date()) {
        guard !isFavorite(detail.id) else {
            updateSnapshot(detail: detail, now: now)
            return
        }
        let session = detail.nearestSession(now: now)
        let card = session.map { detail.card(for: $0) }
        let favorite = FavoriteEvent(
            eventID: detail.id,
            title: detail.title,
            startsAt: session?.startDate,
            venueName: session?.venue?.name,
            categoryCode: detail.primaryCategory.rawValue,
            cardJSON: card.flatMap { try? encoder.encode($0) },
            detailJSON: try? encoder.encode(detail)
        )
        context.insert(favorite)
        save()
    }

    public func removeFavorite(eventID: String) {
        guard let favorite = fetchFavorite(eventID) else { return }
        context.delete(favorite)
        save()
    }

    /// Переключить избранное. Возвращает новое состояние.
    @discardableResult
    public func toggleFavorite(card: OccurrenceCard) -> Bool {
        if isFavorite(card.event.id) {
            removeFavorite(eventID: card.event.id)
            return false
        }
        addFavorite(card: card)
        return true
    }

    @discardableResult
    public func toggleFavorite(detail: EventDetail) -> Bool {
        if isFavorite(detail.id) {
            removeFavorite(eventID: detail.id)
            return false
        }
        addFavorite(detail: detail)
        return true
    }

    /// Обновить снимок события в избранном свежими данными (перенос, отмена — видны офлайн).
    public func updateSnapshot(detail: EventDetail, now: Date = Date()) {
        guard let favorite = fetchFavorite(detail.id) else { return }
        let session = detail.nearestSession(now: now)
        favorite.title = detail.title
        favorite.startsAt = session?.startDate ?? favorite.startsAt
        favorite.venueName = session?.venue?.name ?? favorite.venueName
        favorite.categoryCode = detail.primaryCategory.rawValue
        favorite.detailJSON = try? encoder.encode(detail)
        if let session { favorite.cardJSON = try? encoder.encode(detail.card(for: session)) }
        favorite.refreshedAt = now
        save()
    }

    /// Снимок паспорта события из избранного (офлайн).
    public func favoriteDetail(_ eventID: String) -> EventDetail? {
        fetchFavorite(eventID)?.detailJSON.flatMap { try? decoder.decode(EventDetail.self, from: $0) }
    }

    /// Карточка события из избранного.
    public func favoriteCard(_ favorite: FavoriteEvent) -> OccurrenceCard? {
        favorite.cardJSON.flatMap { try? decoder.decode(OccurrenceCard.self, from: $0) }
    }

    public func allFavorites() -> [FavoriteEvent] {
        let descriptor = FetchDescriptor<FavoriteEvent>(sortBy: [SortDescriptor(\.startsAt), SortDescriptor(\.addedAt)])
        return (try? context.fetch(descriptor)) ?? []
    }

    private func fetchFavorite(_ eventID: String) -> FavoriteEvent? {
        var descriptor = FetchDescriptor<FavoriteEvent>(predicate: #Predicate { $0.eventID == eventID })
        descriptor.fetchLimit = 1
        return try? context.fetch(descriptor).first
    }

    private func reloadFavoriteIDs() {
        favoriteIDs = Set(allFavorites().map(\.eventID))
    }

    // MARK: - Кэш ответов

    /// Сохранить значение в кэш (последняя выдача главной, справочники, паспорта).
    public func cache<Value: Encodable>(_ value: Value, key: String, now: Date = Date()) {
        guard let data = try? encoder.encode(value) else { return }
        var descriptor = FetchDescriptor<CachedResponse>(predicate: #Predicate { $0.key == key })
        descriptor.fetchLimit = 1
        if let existing = try? context.fetch(descriptor).first {
            existing.payload = data
            existing.fetchedAt = now
        } else {
            context.insert(CachedResponse(key: key, payload: data, fetchedAt: now))
        }
        save(reloadFavorites: false)
    }

    /// Значение из кэша и время, когда оно было получено.
    public func cached<Value: Decodable>(_ type: Value.Type, key: String) -> (value: Value, fetchedAt: Date)? {
        var descriptor = FetchDescriptor<CachedResponse>(predicate: #Predicate { $0.key == key })
        descriptor.fetchLimit = 1
        guard let entry = try? context.fetch(descriptor).first,
              let value = try? decoder.decode(type, from: entry.payload) else { return nil }
        return (value, entry.fetchedAt)
    }

    /// Удалить записи кэша старше `maxAge` (по умолчанию неделя).
    public func pruneCache(olderThan maxAge: TimeInterval = 7 * 24 * 3600, now: Date = Date()) {
        let threshold = now.addingTimeInterval(-maxAge)
        try? context.delete(model: CachedResponse.self, where: #Predicate { $0.fetchedAt < threshold })
        save(reloadFavorites: false)
    }

    private func save(reloadFavorites: Bool = true) {
        try? context.save()
        if reloadFavorites { reloadFavoriteIDs() }
    }
}

extension OfflineStore: ResponseCache {
    public func store<Value: Encodable>(_ value: Value, key: String) { cache(value, key: key) }
    public func load<Value: Decodable>(_ type: Value.Type, key: String) -> (value: Value, fetchedAt: Date)? { cached(type, key: key) }
    public func favoriteSnapshot(eventID: String) -> EventDetail? { favoriteDetail(eventID) }
    public func refreshFavorite(_ detail: EventDetail) { updateSnapshot(detail: detail) }
}
