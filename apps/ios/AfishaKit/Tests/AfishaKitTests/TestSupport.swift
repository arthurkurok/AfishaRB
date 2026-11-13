@testable import AfishaAPI
@testable import AfishaKit
import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Фикстуры — реальные ответы API (Scripts/capture-fixtures.mjs).
enum Fixture {
    static func data(_ name: String) throws -> Data {
        guard let url = Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
            ?? Bundle.module.url(forResource: name, withExtension: "json") else {
            throw FixtureError.missing(name)
        }
        return try Data(contentsOf: url)
    }

    static func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        try JSONDecoder().decode(type, from: data(name))
    }

    enum FixtureError: Error { case missing(String) }
}

/// Момент в TZ региона: `at("2026-11-07T11:00")`.
func at(_ local: String) -> Date {
    APIDate.parse(local + ":00+05:00")!
}

/// Транспорт, отвечающий фикстурами и записывающий запросы — контрактный тест клиента без сети.
final class FixtureTransport: ClientTransport, @unchecked Sendable {
    private let lock = NSLock()
    private var _requests: [HTTPRequest] = []
    private var _bodies: [Data] = []
    let respond: @Sendable (HTTPRequest) throws -> (Int, Data)

    init(respond: @escaping @Sendable (HTTPRequest) throws -> (Int, Data)) {
        self.respond = respond
    }

    var requests: [HTTPRequest] { lock.withLock { _requests } }
    var bodies: [Data] { lock.withLock { _bodies } }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var data = Data()
        if let body { data = try await Data(collecting: body, upTo: 1 << 20) }
        lock.withLock {
            _requests.append(request)
            _bodies.append(data)
        }
        let (status, payload) = try respond(request)
        var response = HTTPResponse(status: .init(code: status))
        response.headerFields[.contentType] = "application/json; charset=utf-8"
        return (response, HTTPBody(payload))
    }
}

/// Подменный сервис для моделей экранов.
final class MockService: AfishaService, @unchecked Sendable {
    private let lock = NSLock()
    var searchHandler: @Sendable (SearchFilters, String?) throws -> SearchResult = { _, _ in try Fixture.decode(SearchResult.self, "search-today") }
    var eventHandler: @Sendable (String) throws -> EventDetail = { _ in try Fixture.decode(EventDetail.self, "event-detail") }
    var askHandler: @Sendable (AssistantRequest) throws -> AssistantResponse = { _ in try Fixture.decode(AssistantResponse.self, "assistant-results") }
    private var _asked: [AssistantRequest] = []
    private var _searched: [(SearchFilters, String?)] = []

    var asked: [AssistantRequest] { lock.withLock { _asked } }
    var searched: [(SearchFilters, String?)] { lock.withLock { _searched } }

    func search(_ filters: SearchFilters, language: AppLanguage, near: Coordinate?, cursor: String?, limit: Int) async throws -> SearchResult {
        lock.withLock { _searched.append((filters, cursor)) }
        return try searchHandler(filters, cursor)
    }

    func event(id: String, language: AppLanguage) async throws -> EventDetail { try eventHandler(id) }
    func categories(language: AppLanguage) async throws -> [CategoryInfo] { try Fixture.decode([CategoryInfo].self, "categories-\(language.rawValue)") }
    func municipalities(language: AppLanguage) async throws -> [Municipality] { try Fixture.decode([Municipality].self, "municipalities-ba") }
    func stats() async throws -> Stats { try Fixture.decode(Stats.self, "stats") }
    func report(_ request: ReportRequest) async throws {}

    func ask(_ request: AssistantRequest) async throws -> AssistantResponse {
        lock.withLock { _asked.append(request) }
        return try askHandler(request)
    }
}
