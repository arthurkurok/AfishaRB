import Foundation
import Observation

/// Кэш ответов для офлайна (реализация на SwiftData — `AfishaStore.OfflineStore`).
@MainActor
public protocol ResponseCache: AnyObject, Sendable {
    func store<Value: Encodable>(_ value: Value, key: String)
    func load<Value: Decodable>(_ type: Value.Type, key: String) -> (value: Value, fetchedAt: Date)?
    /// Снимок паспорта события из избранного.
    func favoriteSnapshot(eventID: String) -> EventDetail?
    /// Обновить снимок события в избранном свежими данными.
    func refreshFavorite(_ detail: EventDetail)
}

/// Кэш в памяти — для тестов, превью и расширений без базы.
@MainActor
public final class MemoryCache: ResponseCache {
    private var storage: [String: (Data, Date)] = [:]
    public var snapshots: [String: EventDetail] = [:]
    public var now: () -> Date

    public init(now: @escaping () -> Date = Date.init) {
        self.now = now
    }

    public func store<Value: Encodable>(_ value: Value, key: String) {
        if let data = try? JSONEncoder().encode(value) { storage[key] = (data, now()) }
    }

    public func load<Value: Decodable>(_ type: Value.Type, key: String) -> (value: Value, fetchedAt: Date)? {
        guard let (data, date) = storage[key], let value = try? JSONDecoder().decode(type, from: data) else { return nil }
        return (value, date)
    }

    public func favoriteSnapshot(eventID: String) -> EventDetail? { snapshots[eventID] }

    public func refreshFavorite(_ detail: EventDetail) {
        if snapshots[detail.id] != nil { snapshots[detail.id] = detail }
    }
}

/// Состояние загрузки экрана.
public enum LoadState<Value: Sendable>: Sendable {
    case idle
    case loading
    /// Данные есть. `cachedAt` — если это офлайн-копия (показываем баннер «данные от …»).
    case loaded(Value, cachedAt: Date?)
    case failed(AfishaError)

    public var value: Value? {
        if case let .loaded(value, _) = self { return value }
        return nil
    }

    public var cachedAt: Date? {
        if case let .loaded(_, cachedAt) = self { return cachedAt }
        return nil
    }

    public var error: AfishaError? {
        if case let .failed(error) = self { return error }
        return nil
    }

    public var isLoading: Bool {
        if case .loading = self { return true }
        return false
    }
}

/// Загрузка с откатом на кэш: свежие данные кладутся в кэш; при ошибке сети показывается копия.
@MainActor
func loadWithCache<Value: Codable & Sendable>(
    key: String,
    cache: (any ResponseCache)?,
    fetch: () async throws -> Value
) async -> LoadState<Value> {
    do {
        let value = try await fetch()
        cache?.store(value, key: key)
        return .loaded(value, cachedAt: nil)
    } catch {
        let afishaError = AfishaError.from(error)
        if afishaError == .cancelled { return .idle }
        if let cached = cache?.load(Value.self, key: key) {
            return .loaded(cached.value, cachedAt: cached.fetchedAt)
        }
        return .failed(afishaError)
    }
}

/// Группа выдачи по дню (липкие заголовки «Сегодня», «Завтра», «Суббота, 8 ноября»).
public struct DaySection: Identifiable, Hashable, Sendable {
    public let day: LocalDate
    public let items: [OccurrenceCard]
    public var id: String { day.iso }
}

extension Array where Element == OccurrenceCard {
    /// Группирует карточки по дню начала в TZ региона, сохраняя порядок выдачи внутри дня.
    /// Длительные события (выставки), начавшиеся раньше диапазона, попадают в первый день диапазона.
    public func groupedByDay(rangeStart: LocalDate? = nil) -> [DaySection] {
        var order: [LocalDate] = []
        var buckets: [LocalDate: [OccurrenceCard]] = [:]
        for card in self {
            guard var day = card.localDay else { continue }
            if let rangeStart, day < rangeStart { day = rangeStart }
            if buckets[day] == nil { order.append(day) }
            buckets[day, default: []].append(card)
        }
        return order.sorted().map { DaySection(day: $0, items: buckets[$0] ?? []) }
    }

    /// Убирает дубли сеансов (при догрузке страниц выдача может сдвигаться).
    public func uniqued() -> [OccurrenceCard] {
        var seen = Set<String>()
        return filter { seen.insert($0.id).inserted }
    }
}
