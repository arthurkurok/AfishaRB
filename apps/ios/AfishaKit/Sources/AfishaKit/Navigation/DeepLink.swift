import Foundation

/// Диплинки приложения (docs/08-mobile.md §3.1):
/// - `afisha://event/{id}` — паспорт события;
/// - `afisha://search?when=weekend&categories=theatre` — поиск с фильтрами;
/// - `afisha://guide?q=...` — Гид с готовым вопросом;
/// - `afisha://today`, `afisha://favorites`, `afisha://settings`;
/// - Universal Link `https://<домен>/e/{id}` — тот же паспорт события.
public enum DeepLink: Hashable, Sendable {
    case event(id: String)
    case search(SearchFilters)
    case guide(question: String?)
    case today
    case favorites
    case settings

    public static let scheme = "afisha"

    /// Хосты сайта, ссылки которых приложение открывает как Universal Links.
    public static let webHosts: Set<String> = ["afisharb.ru", "www.afisharb.ru", "tamasha.app"]

    public init?(url: URL) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false) else { return nil }
        let query = Dictionary(
            (components.queryItems ?? []).compactMap { item in item.value.map { (item.name, $0) } },
            uniquingKeysWith: { _, last in last }
        )
        let scheme = components.scheme?.lowercased()

        if scheme == DeepLink.scheme {
            // afisha://event/{id}: хост — первый сегмент, остальное — путь
            let host = components.host?.lowercased() ?? ""
            let segments = components.path.split(separator: "/").map(String.init)
            switch host {
            case "event", "e":
                guard let id = segments.first, DeepLink.isValidID(id) else { return nil }
                self = .event(id: id.lowercased())
            case "search":
                self = .search(SearchFilters(query: query))
            case "guide", "assistant":
                self = .guide(question: query["q"].flatMap { $0.isEmpty ? nil : $0 })
            case "today", "":
                self = .today
            case "favorites":
                self = .favorites
            case "settings":
                self = .settings
            default:
                return nil
            }
            return
        }

        if scheme == "https", let host = components.host?.lowercased(), DeepLink.webHosts.contains(host) {
            let segments = components.path.split(separator: "/").map(String.init)
            // Ссылки сайта могут начинаться с языкового префикса: /ba/e/{id}
            let path = segments.first == "ba" ? Array(segments.dropFirst()) : segments
            if path.count == 2, path[0] == "e" || path[0] == "event", DeepLink.isValidID(path[1]) {
                self = .event(id: path[1].lowercased())
                return
            }
        }
        return nil
    }

    /// URL для шаринга и виджетов.
    public var url: URL {
        var components = URLComponents()
        components.scheme = DeepLink.scheme
        switch self {
        case let .event(id):
            components.host = "event"
            components.path = "/\(id)"
        case let .search(filters):
            components.host = "search"
            components.queryItems = filters.queryItems
        case let .guide(question):
            components.host = "guide"
            if let question { components.queryItems = [URLQueryItem(name: "q", value: question)] }
        case .today:
            components.host = "today"
        case .favorites:
            components.host = "favorites"
        case .settings:
            components.host = "settings"
        }
        return components.url ?? URL(string: "afisha://today")!
    }

    /// Публичная ссылка на событие на сайте — для «Поделиться».
    public static func webURL(eventID: String, language: AppLanguage, host: String = "afisharb.ru") -> URL {
        let prefix = language == .ba ? "/ba" : ""
        return URL(string: "https://\(host)\(prefix)/e/\(eventID)")!
    }

    /// ID событий — UUID (v7 в нашей БД).
    static func isValidID(_ id: String) -> Bool { UUID(uuidString: id) != nil }
}
