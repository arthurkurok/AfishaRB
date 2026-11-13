import AfishaAPI
import Foundation
import HTTPTypes
import OpenAPIRuntime
import OpenAPIURLSession

/// Ошибки, которые видит пользователь. Текст — в голосе бренда (07 §10): без кодов и «упс».
public enum AfishaError: Error, Equatable, Sendable {
    /// Нет сети или сервер недоступен.
    case offline
    /// Событие не найдено (удалено или неверная ссылка).
    case notFound
    /// Сервер ответил ошибкой.
    case server(status: Int)
    /// Ответ не соответствует контракту.
    case decoding
    case cancelled

    public static func from(_ error: any Error) -> AfishaError {
        if let error = error as? AfishaError { return error }
        if error is CancellationError { return .cancelled }
        if let clientError = error as? ClientError {
            return from(clientError.underlyingError)
        }
        if let urlError = error as? URLError {
            switch urlError.code {
            case .cancelled: return .cancelled
            case .notConnectedToInternet, .networkConnectionLost, .timedOut, .cannotConnectToHost,
                 .cannotFindHost, .dnsLookupFailed, .internationalRoamingOff, .dataNotAllowed,
                 .secureConnectionFailed, .resourceUnavailable:
                return .offline
            default: return .offline
            }
        }
        if error is DecodingError { return .decoding }
        return .server(status: 0)
    }

    public func message(_ language: AppLanguage) -> String {
        let loc = Localizer(language: language)
        switch self {
        case .offline: return loc("error.offline")
        case .notFound: return loc("error.not_found")
        case .server, .decoding: return loc("error.server")
        case .cancelled: return ""
        }
    }
}

/// Сервис данных афиши. Протокол — для подмены в тестах, превью и снапшотах.
public protocol AfishaService: Sendable {
    func search(_ filters: SearchFilters, language: AppLanguage, near: Coordinate?, cursor: String?, limit: Int) async throws -> SearchResult
    func event(id: String, language: AppLanguage) async throws -> EventDetail
    func categories(language: AppLanguage) async throws -> [CategoryInfo]
    func municipalities(language: AppLanguage) async throws -> [Municipality]
    func stats() async throws -> Stats
    func report(_ request: ReportRequest) async throws
    func ask(_ request: AssistantRequest) async throws -> AssistantResponse
}

/// Реализация поверх клиента, сгенерированного swift-openapi-generator.
public struct LiveAfishaService: AfishaService {
    let client: Client

    public init(baseURL: URL = AppConstants.apiBaseURL(), session: URLSession = LiveAfishaService.makeSession()) {
        client = Client(
            serverURL: baseURL,
            configuration: Configuration(),
            transport: URLSessionTransport(configuration: .init(session: session)),
            middlewares: [HeadersMiddleware(), RetryMiddleware()]
        )
    }

    /// Клиент поверх произвольного транспорта — для контрактных тестов на фикстурах.
    init(baseURL: URL, transport: any ClientTransport, middlewares: [any ClientMiddleware] = []) {
        client = Client(serverURL: baseURL, configuration: Configuration(), transport: transport, middlewares: middlewares)
    }

    /// URLSession с HTTP-кэшем: ETag/If-None-Match и Cache-Control обрабатываются системой.
    public static func makeSession() -> URLSession {
        let configuration = URLSessionConfiguration.default
        configuration.urlCache = URLCache(memoryCapacity: 16 << 20, diskCapacity: 96 << 20)
        configuration.requestCachePolicy = .useProtocolCachePolicy
        configuration.timeoutIntervalForRequest = 15
        configuration.timeoutIntervalForResource = 30
        configuration.waitsForConnectivity = false
        return URLSession(configuration: configuration)
    }

    public func search(_ filters: SearchFilters, language: AppLanguage, near: Coordinate?, cursor: String?, limit: Int) async throws -> SearchResult {
        do {
            let output = try await client.searchOccurrences(query: filters.query(language: language, near: near, cursor: cursor, limit: limit))
            switch output {
            case let .ok(ok): return try ok.body.json
            case let .undocumented(status, _): throw AfishaError.server(status: status)
            }
        } catch { throw AfishaError.from(error) }
    }

    public func event(id: String, language: AppLanguage) async throws -> EventDetail {
        do {
            let output = try await client.getEvent(path: .init(id: id), query: .init(lang: Components.Schemas.Lang(rawValue: language.rawValue)))
            switch output {
            case let .ok(ok): return try ok.body.json
            case .notFound: throw AfishaError.notFound
            case let .undocumented(status, _): throw status == 404 ? AfishaError.notFound : AfishaError.server(status: status)
            }
        } catch { throw AfishaError.from(error) }
    }

    public func categories(language: AppLanguage) async throws -> [CategoryInfo] {
        do {
            switch try await client.listCategories(query: .init(lang: Components.Schemas.Lang(rawValue: language.rawValue))) {
            case let .ok(ok): return try ok.body.json
            case let .undocumented(status, _): throw AfishaError.server(status: status)
            }
        } catch { throw AfishaError.from(error) }
    }

    public func municipalities(language: AppLanguage) async throws -> [Municipality] {
        do {
            switch try await client.listMunicipalities(query: .init(lang: Components.Schemas.Lang(rawValue: language.rawValue))) {
            case let .ok(ok): return try ok.body.json
            case let .undocumented(status, _): throw AfishaError.server(status: status)
            }
        } catch { throw AfishaError.from(error) }
    }

    public func stats() async throws -> Stats {
        do {
            switch try await client.getStats() {
            case let .ok(ok): return try ok.body.json
            case let .undocumented(status, _): throw AfishaError.server(status: status)
            }
        } catch { throw AfishaError.from(error) }
    }

    public func report(_ request: ReportRequest) async throws {
        do {
            switch try await client.createReport(body: .json(request)) {
            case .accepted: return
            case let .undocumented(status, _): throw AfishaError.server(status: status)
            }
        } catch { throw AfishaError.from(error) }
    }

    public func ask(_ request: AssistantRequest) async throws -> AssistantResponse {
        do {
            switch try await client.askAssistant(body: .json(request)) {
            case let .ok(ok): return try ok.body.json
            case let .undocumented(status, _): throw AfishaError.server(status: status)
            }
        } catch { throw AfishaError.from(error) }
    }
}

/// Заголовки клиента: версия приложения — для логов и принудительного обновления (08 §8).
struct HeadersMiddleware: ClientMiddleware {
    static let userAgent: String = {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        return "Tamasha-iOS/\(version)"
    }()

    func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.headerFields[.userAgent] = HeadersMiddleware.userAgent
        return try await next(request, body, baseURL)
    }
}

/// Повторы идемпотентных запросов (GET) с экспоненциальной задержкой: 0,4 с → 1,2 с.
/// POST к Гиду и жалобам не повторяем — повтор мог бы задвоить действие.
struct RetryMiddleware: ClientMiddleware {
    var attempts = 3
    var baseDelay: Duration = .milliseconds(400)

    func intercept(
        _ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard request.method == .get else { return try await next(request, body, baseURL) }
        var delay = baseDelay
        for attempt in 1...attempts {
            do {
                let (response, responseBody) = try await next(request, body, baseURL)
                if (500...599).contains(response.status.code), attempt < attempts {
                    try await Task.sleep(for: delay)
                    delay *= 3
                    continue
                }
                return (response, responseBody)
            } catch {
                if error is CancellationError || attempt == attempts { throw error }
                if let urlError = error as? URLError, urlError.code == .notConnectedToInternet { throw error }
                try await Task.sleep(for: delay)
                delay *= 3
            }
        }
        return try await next(request, body, baseURL)
    }
}
