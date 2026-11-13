import Foundation
import Observation

/// Подборки главной (03 §2): «Бесплатно», «Пушкинская карта», «Детям».
public enum HomeCollection: String, CaseIterable, Sendable, Identifiable {
    case free, pushkin, kids

    public var id: String { rawValue }

    public func title(_ language: AppLanguage) -> String { Localizer(language: language)("home.collection.\(rawValue)") }

    /// Фильтры подборки поверх выбранного города и периода.
    public func filters(base: SearchFilters) -> SearchFilters {
        var filters = base
        switch self {
        case .free: filters.setFree(true)
        case .pushkin: filters.pushkin = true
        case .kids: filters.categories = [.kids]
        }
        return filters
    }
}

/// Главная: переключатель «Сегодня / Завтра / Выходные», лента, «зонтик курая», подборки.
@MainActor
@Observable
public final class HomeModel {
    public static let periods: [WhenPreset] = [.today, .tomorrow, .weekend]

    public var period: WhenPreset = .today
    public private(set) var feed: LoadState<SearchResult> = .idle
    public private(set) var collections: [HomeCollection: [OccurrenceCard]] = [:]
    public private(set) var stats: Stats?

    private let service: any AfishaService
    private weak var cache: (any ResponseCache)?
    private var loadTask: Task<Void, Never>?

    public init(service: any AfishaService, cache: (any ResponseCache)?) {
        self.service = service
        self.cache = cache
    }

    /// Базовые фильтры главной: период + город.
    public func baseFilters(municipalityID: String) -> SearchFilters {
        SearchFilters(when: period, municipalities: [municipalityID])
    }

    /// Загрузить ленту и подборки. Повторный вызов отменяет предыдущую загрузку.
    public func load(municipalityID: String, language: AppLanguage) async {
        loadTask?.cancel()
        let task = Task { await self.performLoad(municipalityID: municipalityID, language: language) }
        loadTask = task
        await task.value
    }

    private func performLoad(municipalityID: String, language: AppLanguage) async {
        if feed.value == nil { feed = .loading }
        let base = baseFilters(municipalityID: municipalityID)
        let key = "home:\(municipalityID):\(period.rawValue):\(language.rawValue)"
        let service = self.service

        async let feedState = loadWithCache(key: key, cache: cache) {
            try await service.search(base, language: language, near: nil, cursor: nil, limit: 12)
        }
        // Подборки берут ближайшую неделю — на «сегодня» бесплатного может не оказаться
        let collectionBase: SearchFilters = {
            var filters = base
            filters.setWhen(.week)
            return filters
        }()
        async let free = loadWithCache(key: "\(key):free", cache: cache) {
            try await service.search(HomeCollection.free.filters(base: collectionBase), language: language, near: nil, cursor: nil, limit: 8)
        }
        async let pushkin = loadWithCache(key: "\(key):pushkin", cache: cache) {
            try await service.search(HomeCollection.pushkin.filters(base: collectionBase), language: language, near: nil, cursor: nil, limit: 8)
        }
        async let kids = loadWithCache(key: "\(key):kids", cache: cache) {
            try await service.search(HomeCollection.kids.filters(base: collectionBase), language: language, near: nil, cursor: nil, limit: 8)
        }
        let results = await (feedState, free, pushkin, kids)
        guard !Task.isCancelled else { return }
        if case .idle = results.0 { return }
        feed = results.0
        collections = [
            .free: results.1.value?.items ?? [],
            .pushkin: results.2.value?.items ?? [],
            .kids: results.3.value?.items ?? [],
        ]
        if stats == nil { stats = try? await service.stats() }
    }

    /// Данные показаны из офлайн-кэша.
    public var offlineSince: Date? { feed.cachedAt }
}
