import Foundation
import Observation

/// Поиск: фильтры, выдача по дням, постраничная догрузка по курсору.
@MainActor
@Observable
public final class SearchModel {
    public var filters: SearchFilters
    public private(set) var items: [OccurrenceCard] = []
    public private(set) var total = 0
    public private(set) var state: LoadState<Int> = .idle
    public private(set) var isLoadingMore = false
    public private(set) var appliedRange: DateRange?
    /// Число событий для кнопки «Показать N» в шторке фильтров.
    public private(set) var previewCount: Int?

    private var nextCursor: String?
    private let service: any AfishaService
    private var searchTask: Task<Void, Never>?
    private var previewTask: Task<Void, Never>?
    /// Задержка перед поиском при вводе текста.
    var debounce: Duration = .milliseconds(350)

    public init(service: any AfishaService, filters: SearchFilters = SearchFilters(when: .week)) {
        self.service = service
        self.filters = filters
    }

    /// Выдача по дням для ленты с липкими заголовками.
    public var sections: [DaySection] { items.groupedByDay(rangeStart: appliedRange?.from) }

    public var canLoadMore: Bool { nextCursor != nil && !isLoadingMore }

    /// Новый поиск с текущими фильтрами. `debounced` — при вводе текста.
    public func search(language: AppLanguage, near: Coordinate?, debounced: Bool = false) {
        searchTask?.cancel()
        let filters = self.filters
        searchTask = Task {
            if debounced {
                try? await Task.sleep(for: debounce)
                guard !Task.isCancelled else { return }
            }
            await performSearch(filters: filters, language: language, near: near)
        }
    }

    /// Дождаться текущего поиска (для pull-to-refresh и тестов).
    public func waitForSearch() async { await searchTask?.value }

    private func performSearch(filters: SearchFilters, language: AppLanguage, near: Coordinate?) async {
        state = .loading
        do {
            let result = try await service.search(filters, language: language, near: near, cursor: nil, limit: 20)
            guard !Task.isCancelled else { return }
            items = result.items.uniqued()
            total = result.total
            nextCursor = result.nextCursor
            appliedRange = LocalDate(iso: result.applied.dateFrom).flatMap { from in
                LocalDate(iso: result.applied.dateTo).map { DateRange(from: from, to: $0) }
            }
            state = .loaded(result.total, cachedAt: nil)
        } catch {
            let afishaError = AfishaError.from(error)
            guard afishaError != .cancelled, !Task.isCancelled else { return }
            state = .failed(afishaError)
        }
    }

    /// Догрузить следующую страницу.
    public func loadMore(language: AppLanguage, near: Coordinate?) async {
        guard let cursor = nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let result = try await service.search(filters, language: language, near: near, cursor: cursor, limit: 20)
            items = (items + result.items).uniqued()
            nextCursor = result.nextCursor
            total = result.total
        } catch {
            // Ошибка догрузки не стирает уже показанную выдачу: следующая прокрутка повторит запрос
        }
    }

    /// Подсчёт результатов для черновика фильтров (кнопка «Показать N»).
    public func updatePreview(for draft: SearchFilters, language: AppLanguage, near: Coordinate?) {
        previewTask?.cancel()
        previewTask = Task {
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            let result = try? await service.search(draft, language: language, near: near, cursor: nil, limit: 1)
            guard !Task.isCancelled else { return }
            previewCount = result?.total
        }
    }

    public func clearPreview() {
        previewTask?.cancel()
        previewCount = nil
    }
}
