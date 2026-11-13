import AfishaKit
import Foundation
import Observation

/// Вкладки приложения.
enum AppTab: String, Hashable, CaseIterable {
    case home, search, guide, favorites, settings
}

/// Типизированные маршруты NavigationStack (docs/08-mobile.md §3.1).
enum Route: Hashable {
    /// Паспорт события; `preview` — карточка из выдачи для мгновенного показа.
    case event(id: String, preview: OccurrenceCard?)
    case recommendationRules
    case about
}

/// Роутинг: вкладка, стеки навигации и обработка диплинков.
@MainActor
@Observable
final class Router {
    var tab: AppTab = .home
    var paths: [AppTab: [Route]] = [:]
    /// Вопрос для Гида из диплинка, Siri или паспорта события.
    var pendingGuideQuestion: PendingGuideQuestion?
    /// Фильтры поиска из диплинка или подборки главной.
    var pendingSearch: SearchFilters?

    struct PendingGuideQuestion: Equatable {
        var text: String?
        var eventID: String?
        var eventTitle: String?
    }

    func path(_ tab: AppTab) -> [Route] { paths[tab] ?? [] }

    func setPath(_ path: [Route], for tab: AppTab) { paths[tab] = path }

    /// Открыть паспорт события в текущей вкладке.
    func openEvent(id: String, preview: OccurrenceCard? = nil) {
        paths[tab, default: []].append(.event(id: id, preview: preview))
    }

    func push(_ route: Route) { paths[tab, default: []].append(route) }

    /// Поиск с заданными фильтрами (подборки главной, «Показать все», диплинки).
    func openSearch(_ filters: SearchFilters) {
        pendingSearch = filters
        paths[.search] = []
        tab = .search
    }

    func openGuide(question: String? = nil, eventID: String? = nil, eventTitle: String? = nil) {
        if question != nil || eventID != nil {
            pendingGuideQuestion = PendingGuideQuestion(text: question, eventID: eventID, eventTitle: eventTitle)
        }
        tab = .guide
    }

    /// Обработка диплинка `afisha://…` или Universal Link.
    func handle(_ link: DeepLink) {
        switch link {
        case let .event(id):
            // Паспорт открываем поверх главной: так «Назад» ведёт в понятное место
            tab = .home
            paths[.home] = [.event(id: id, preview: nil)]
        case let .search(filters):
            openSearch(filters)
        case let .guide(question):
            openGuide(question: question)
        case .today:
            paths[.home] = []
            tab = .home
        case .favorites:
            paths[.favorites] = []
            tab = .favorites
        case .settings:
            tab = .settings
        }
    }
}
