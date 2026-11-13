@testable import AfishaAPI
@testable import AfishaKit
import Foundation
import HTTPTypes
import Testing

/// Декодирование реальных ответов API сгенерированными типами и сериализация запросов
/// сгенерированным клиентом (контракт packages/contract → openapi.json → Swift).
@Suite("Контракт API на реальных ответах")
struct ContractTests {
    @Test("Поиск: выдача на сегодня", arguments: ["search-today", "search-week-ufa", "search-weekend-ba", "search-free-kids"])
    func decodesSearch(fixture: String) throws {
        let result = try Fixture.decode(SearchResult.self, fixture)
        #expect(!result.items.isEmpty)
        #expect(result.applied.timezone == Region.timeZoneIdentifier)
        for card in result.items {
            #expect(card.startDate != nil, "дата начала разбирается: \(card.startsAt)")
            #expect(AgeRating.allowed.contains(card.event.ageRating))
            #expect(!card.event.categories.isEmpty)
            #expect(card.event.price.currency == .rub)
        }
    }

    @Test("Поиск по бесплатному детскому: все карточки бесплатные и детские")
    func freeKidsSemantics() throws {
        let result = try Fixture.decode(SearchResult.self, "search-free-kids")
        #expect(result.items.allSatisfy { $0.event.priceInfo.isEffectivelyFree })
        #expect(result.items.allSatisfy { $0.event.categories.contains(.kids) })
    }

    @Test("Паспорт события: сеансы, источники, история")
    func decodesEventDetail() throws {
        let detail = try Fixture.decode(EventDetail.self, "event-detail")
        #expect(!detail.occurrences.isEmpty)
        #expect(!detail.provenance.sources.isEmpty)
        #expect(APIDate.parse(detail.provenance.lastVerifiedAt) != nil)
        #expect(!detail.history.isEmpty)
        #expect(detail.history.allSatisfy { APIDate.parse($0.at) != nil })
        let sessions = detail.sortedSessions
        #expect(zip(sessions, sessions.dropFirst()).allSatisfy { ($0.startDate ?? .distantPast) <= ($1.startDate ?? .distantPast) })
        let card = detail.card(for: try #require(detail.nearestSession(now: at("2026-11-02T12:00"))))
        #expect(card.event.id == detail.id)
        #expect(!DescriptionText.paragraphs(fromHTML: detail.descriptionHtml).isEmpty)
    }

    @Test("Паспорт на башкирском декодируется")
    func decodesEventDetailBa() throws {
        let detail = try Fixture.decode(EventDetail.self, "event-detail-ba")
        #expect(!detail.title.isEmpty)
    }

    @Test("Справочники: категории ru/ba, муниципалитеты с ba-названиями, статистика")
    func decodesReference() throws {
        let ru = try Fixture.decode([CategoryInfo].self, "categories-ru")
        let ba = try Fixture.decode([CategoryInfo].self, "categories-ba")
        #expect(Set(ru.map(\.code)) == Set(CategoryCode.allCases))
        #expect(ba.first { $0.code == .museum }?.title == "Музейҙар һәм күргәҙмәләр")
        // Названия категорий в каталоге строк совпадают с тем, что отдаёт API
        for category in ru { #expect(category.code.title(.ru) == category.title) }
        for category in ba { #expect(category.code.title(.ba) == category.title) }
        let municipalities = try Fixture.decode([Municipality].self, "municipalities-ba")
        #expect(municipalities.first { $0.id == "ufa" }?.nameBa == "Өфө")
        #expect(municipalities.first { $0.id == "ufa" }?.coordinate != nil)
        let stats = try Fixture.decode(Stats.self, "stats")
        #expect(stats.events > 0)
    }

    @Test("Гид: выдача, уточнение, справка, не по теме", arguments: [
        ("assistant-results", AssistantKind.results),
        ("assistant-clarify", .clarify),
        ("assistant-help", .help),
        ("assistant-offtopic", .offtopic),
    ])
    func decodesAssistant(fixture: String, kind: AssistantKind) throws {
        let response = try Fixture.decode(AssistantResponse.self, fixture)
        #expect(response.kind == kind)
        #expect(!response.conversationId.isEmpty)
        if kind == .results {
            #expect(!response.picks.isEmpty)
            #expect(response.picks.allSatisfy { !$0.reasonText.isEmpty })
            #expect(!response.chips.isEmpty)
        }
        if kind == .clarify {
            let clarify = try #require(response.clarify)
            #expect(!clarify.options.isEmpty)
            #expect(clarify.options.allSatisfy { !$0.patch.additionalProperties.isEmpty })
        }
    }

    @Test("Ответ Гида kind=answer (например, на несуществующую дату) декодируется")
    func decodesAnswerKind() throws {
        var json = try JSONSerialization.jsonObject(with: Fixture.data("assistant-offtopic")) as! [String: Any]
        json["kind"] = "answer"
        let response = try JSONDecoder().decode(AssistantResponse.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(response.kind == .answer)
    }

    @Test("Новые поля в ответе не ломают старые версии приложения (tolerant reader)")
    func toleratesUnknownFields() throws {
        var json = try JSONSerialization.jsonObject(with: Fixture.data("search-today")) as! [String: Any]
        json["new_field"] = ["anything": 1]
        var items = json["items"] as! [[String: Any]]
        items[0]["badge_v2"] = "x"
        json["items"] = items
        let result = try JSONDecoder().decode(SearchResult.self, from: JSONSerialization.data(withJSONObject: json))
        #expect(result.items.count == items.count)
    }

    // MARK: Клиент

    @Test("Сгенерированный клиент: запрос поиска и разбор ответа")
    func clientSearchRoundTrip() async throws {
        let payload = try Fixture.data("search-today")
        let transport = FixtureTransport { _ in (200, payload) }
        let service = LiveAfishaService(baseURL: URL(string: "http://localhost:8000")!, transport: transport)
        var filters = SearchFilters(when: .today, municipalities: ["ufa"])
        filters.categories = [.theatre, .music]
        filters.pushkin = true
        filters.timeOfDay = [.evening]
        let result = try await service.search(filters, language: .ba, near: nil, cursor: "Mg", limit: 20)
        #expect(!result.items.isEmpty)

        let request = try #require(transport.requests.first)
        let query = try #require(request.path?.split(separator: "?").last.map(String.init))
        let items = Dictionary(uniqueKeysWithValues: query.split(separator: "&").map { pair -> (String, String) in
            let parts = pair.split(separator: "=", maxSplits: 1).map(String.init)
            return (parts[0], (parts.count > 1 ? parts[1] : "").removingPercentEncoding ?? "")
        })
        #expect(request.path?.hasPrefix("/v1/occurrences") == true)
        #expect(items["when"] == "today")
        #expect(items["municipality"] == "ufa")
        #expect(items["categories"] == "theatre,music") // CSV, как ждёт zod
        #expect(items["time_of_day"] == "evening")
        #expect(items["pushkin"] == "true")
        #expect(items["lang"] == "ba")
        #expect(items["cursor"] == "Mg")
        // Выключенные флаги не передаются: z.coerce.boolean("false") на сервере дало бы true
        #expect(items["free"] == nil)
        #expect(items["accessible"] == nil)
        #expect(items["hide_sold_out"] == nil)
    }

    @Test("«Рядом со мной» передаёт near и radius_km вместо города и сортирует по расстоянию")
    func nearQuery() {
        var filters = SearchFilters(when: .today, municipalities: ["ufa"])
        filters.nearRadiusKm = 10
        let query = filters.query(language: .ru, near: Coordinate(latitude: 54.7, longitude: 55.9))
        #expect(query.near == "54.70000,55.90000")
        #expect(query.radiusKm == 10)
        #expect(query.municipality == nil)
        #expect(query.sort == .distance)
        // Без координаты «рядом» не применяется, остаётся город
        let fallback = filters.query(language: .ru, near: nil)
        #expect(fallback.near == nil)
        #expect(fallback.municipality == ["ufa"])
    }

    @Test("Паспорт: 404 превращается в «событие не найдено»")
    func clientNotFound() async throws {
        let payload = try Fixture.data("problem-404")
        let service = LiveAfishaService(baseURL: URL(string: "http://localhost:8000")!, transport: FixtureTransport { _ in (404, payload) })
        await #expect(throws: AfishaError.notFound) {
            _ = try await service.event(id: "00000000-0000-7000-8000-000000000000", language: .ru)
        }
    }

    @Test("Гид: патч быстрого ответа уходит на сервер как есть")
    func clientAssistantPatch() async throws {
        let clarify = try Fixture.decode(AssistantResponse.self, "assistant-clarify")
        let option = try #require(clarify.clarify?.options.first)
        let results = try Fixture.data("assistant-results")
        let transport = FixtureTransport { _ in (200, results) }
        let service = LiveAfishaService(baseURL: URL(string: "http://localhost:8000")!, transport: transport)
        let request = AssistantRequest(
            conversationId: clarify.conversationId,
            patch: .init(additionalProperties: option.patch.additionalProperties),
            lang: .ru
        )
        let response = try await service.ask(request)
        #expect(response.kind == .results)
        let body = try #require(transport.bodies.first)
        let json = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json["conversation_id"] as? String == clarify.conversationId)
        #expect((json["patch"] as? [String: Any])?["kids_ages"] as? [Int] == [2])
        #expect(json["lang"] as? String == "ru")
        #expect(json["text"] == nil)
    }

    @Test("Жалоба на неточность: 202 Accepted")
    func clientReport() async throws {
        let transport = FixtureTransport { _ in (202, Data(#"{"ok":true}"#.utf8)) }
        let service = LiveAfishaService(baseURL: URL(string: "http://localhost:8000")!, transport: transport)
        try await service.report(ReportRequest(eventId: "01a19c9d-827d-76e6-aa6c-7fc8a1b37465", reason: .wrongTime, comment: "Начало в 18:00"))
        let body = try #require(transport.bodies.first)
        let json = try #require(try JSONSerialization.jsonObject(with: body) as? [String: Any])
        #expect(json["reason"] as? String == "wrong_time")
        #expect(transport.requests.first?.method == .post)
    }
}
