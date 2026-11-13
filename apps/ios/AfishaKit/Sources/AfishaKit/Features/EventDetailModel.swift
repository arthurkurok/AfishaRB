import Foundation
import Observation

/// Паспорт события: загрузка с откатом на снимок из избранного, жалоба на неточность.
@MainActor
@Observable
public final class EventDetailModel {
    public let eventID: String
    public private(set) var state: LoadState<EventDetail> = .idle
    public private(set) var reportState: ReportState = .idle

    public enum ReportState: Equatable, Sendable {
        case idle, sending, sent, failed(AfishaError)
    }

    private let service: any AfishaService
    private weak var cache: (any ResponseCache)?

    /// `preview` — карточка из выдачи: показывается мгновенно, пока грузится паспорт.
    public let preview: OccurrenceCard?

    public init(eventID: String, preview: OccurrenceCard? = nil, service: any AfishaService, cache: (any ResponseCache)?) {
        self.eventID = eventID
        self.preview = preview
        self.service = service
        self.cache = cache
    }

    public var detail: EventDetail? { state.value }

    public func load(language: AppLanguage) async {
        if detail == nil { state = .loading }
        do {
            let detail = try await service.event(id: eventID, language: language)
            state = .loaded(detail, cachedAt: nil)
            cache?.store(detail, key: cacheKey(language))
            cache?.refreshFavorite(detail)
        } catch {
            let afishaError = AfishaError.from(error)
            if afishaError == .cancelled { return }
            if afishaError != .notFound {
                // Офлайн: снимок из избранного или кэш последнего просмотра
                if let snapshot = cache?.favoriteSnapshot(eventID: eventID) {
                    state = .loaded(snapshot, cachedAt: Date())
                    return
                }
                if let cached = cache?.load(EventDetail.self, key: cacheKey(language)) {
                    state = .loaded(cached.value, cachedAt: cached.fetchedAt)
                    return
                }
            }
            state = .failed(afishaError)
        }
    }

    private func cacheKey(_ language: AppLanguage) -> String { "event:\(eventID):\(language.rawValue)" }

    /// Отправить «Сообщить о неточности» (попадает в очередь модерации).
    public func report(reason: ReportReason, comment: String, occurrenceID: String?) async {
        reportState = .sending
        let trimmed = comment.trimmingCharacters(in: .whitespacesAndNewlines)
        let request = ReportRequest(
            eventId: eventID,
            occurrenceId: occurrenceID,
            reason: reason,
            comment: trimmed.isEmpty ? nil : String(trimmed.prefix(1000))
        )
        do {
            try await service.report(request)
            reportState = .sent
        } catch {
            reportState = .failed(AfishaError.from(error))
        }
    }

    public func resetReport() { reportState = .idle }
}

extension ReportReason {
    public func title(_ language: AppLanguage) -> String { Localizer(language: language)("report.reason.\(rawValue)") }
}

extension TrustLevel {
    public func title(_ language: AppLanguage) -> String { Localizer(language: language)("trust.\(rawValue)") }
}

/// Описание события: HTML источника → простые абзацы (без WebView и без исполнения разметки).
public enum DescriptionText {
    public static func paragraphs(fromHTML html: String) -> [String] {
        var text = html
        for tag in ["</p>", "<br>", "<br/>", "<br />", "</li>", "</h1>", "</h2>", "</h3>", "</div>"] {
            text = text.replacingOccurrences(of: tag, with: "\n", options: .caseInsensitive)
        }
        text = text.replacingOccurrences(of: "<li>", with: "• ", options: .caseInsensitive)
        text = text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        text = decodeEntities(text)
        return text
            .components(separatedBy: "\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    /// Минимальный набор HTML-сущностей, встречающихся в источниках (culture.ru, сайты театров).
    public static func decodeEntities(_ text: String) -> String {
        var result = text
        // «&amp;» — последним, чтобы «&amp;quot;» не раскрылось дважды
        let entities: [(String, String)] = [
            ("&nbsp;", "\u{00A0}"), ("&quot;", "\""), ("&laquo;", "«"), ("&raquo;", "»"), ("&mdash;", "—"), ("&ndash;", "–"),
            ("&hellip;", "…"), ("&#39;", "'"), ("&apos;", "'"), ("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&"),
        ]
        for (entity, value) in entities { result = result.replacingOccurrences(of: entity, with: value) }
        // Числовые сущности &#1234;
        while let range = result.range(of: "&#[0-9]{2,6};", options: .regularExpression) {
            let digits = result[range].dropFirst(2).dropLast()
            let scalar = UInt32(digits).flatMap(Unicode.Scalar.init).map(String.init) ?? ""
            result.replaceSubrange(range, with: scalar)
        }
        return result
    }
}
