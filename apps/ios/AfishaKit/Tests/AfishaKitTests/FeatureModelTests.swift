@testable import AfishaKit
import AfishaStore
import Foundation
import OpenAPIRuntime
import Testing

@Suite("Модели экранов")
@MainActor
struct FeatureModelTests {
    // MARK: Гид

    @Test("Гид: текст → ответ с карточками, conversation_id сохраняется")
    func guideSendsText() async throws {
        let service = MockService()
        let model = GuideModel(service: service)
        let context = GuideContext(language: .ru, municipalityID: "ufa", near: nil)
        await model.send(text: "  куда сходить в субботу  ", context: context)
        #expect(model.messages.count == 2)
        guard case let .user(text) = model.messages[0].content else { Issue.record("нет реплики"); return }
        #expect(text == "куда сходить в субботу")
        #expect(model.lastResponse?.kind == .results)
        #expect(model.isRulesMode) // фикстура снята в режиме без GigaChat
        let request = try #require(service.asked.first)
        #expect(request.municipalityId == "ufa")
        #expect(request.lang == .ru)
        #expect(request.conversationId == nil)

        await model.send(text: "а в воскресенье?", context: context)
        #expect(service.asked.last?.conversationId == model.lastResponse?.conversationId)
    }

    @Test("Гид: уточнение открывает шторку, вариант отправляет патч")
    func guideClarify() async throws {
        let service = MockService()
        service.askHandler = { request in
            try Fixture.decode(AssistantResponse.self, request.patch == nil ? "assistant-clarify" : "assistant-results")
        }
        let model = GuideModel(service: service)
        let context = GuideContext(language: .ru, municipalityID: nil, near: nil)
        await model.send(text: "с ребёнком в субботу", context: context)
        let clarify = try #require(model.activeClarify)
        let option = try #require(clarify.options.first)
        await model.choose(option, context: context)
        #expect(model.activeClarify == nil)
        #expect(service.asked.last?.patch?.additionalProperties == option.patch.additionalProperties)
        #expect(model.lastResponse?.kind == .results)
    }

    @Test("Гид: «убрать» чип бюджета снимает бюджет и «бесплатно»")
    func guideRemovesChip() async throws {
        let service = MockService()
        let model = GuideModel(service: service)
        let context = GuideContext(language: .ru, municipalityID: nil, near: nil)
        await model.send(text: "до 1000", context: context)
        let chip = SlotChip(slot: "budget", label: "до 1000 ₽", source: .user)
        await model.remove(chip, context: context)
        let patch = try #require(service.asked.last?.patch?.additionalProperties)
        #expect(Set(patch.keys) == ["budget", "budget_per", "free_only"])
        let encoded = try JSONEncoder().encode(patch)
        let json = try #require(try JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        #expect(json["free_only"] as? Bool == false)
        #expect(json["budget"] is NSNull)
    }

    @Test("Гид: снять одну категорию из нескольких")
    func guideRemovesOneCategory() throws {
        var slots = try Fixture.decode(AssistantResponse.self, "assistant-results").slots
        slots.categories = [.theatre, .music]
        let patch = try #require(GuideModel.removalPatch(for: SlotChip(slot: "category", label: "Театр", source: .user), slots: slots))
        let json = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(patch)) as? [String: Any])
        #expect(json["categories"] as? [String] == ["music"])
    }

    @Test("Гид: ошибка сети → сообщение с повтором, повтор не дублирует реплику")
    func guideFailureAndRetry() async throws {
        let service = MockService()
        service.askHandler = { _ in throw URLError(.notConnectedToInternet) }
        let model = GuideModel(service: service)
        let context = GuideContext(language: .ba, municipalityID: nil, near: nil)
        await model.send(text: "бөгөн кис концерт", context: context)
        guard case .failure(.offline) = model.messages.last?.content else { Issue.record("нет ошибки"); return }
        service.askHandler = { _ in try Fixture.decode(AssistantResponse.self, "assistant-results") }
        await model.retry()
        #expect(model.messages.count == 2)
        #expect(service.asked.count == 2)
        #expect(service.asked.last?.lang == .ba)
    }

    @Test("Гид: выбор периода «Завтра» считает даты в TZ региона")
    func guidePeriod() async throws {
        let service = MockService()
        let model = GuideModel(service: service)
        await model.setPeriod(.tomorrow, context: GuideContext(language: .ru, municipalityID: nil, near: nil), now: at("2026-11-02T23:30"))
        let patch = try #require(service.asked.last?.patch?.additionalProperties)
        let json = try #require(try JSONSerialization.jsonObject(with: JSONEncoder().encode(patch)) as? [String: Any])
        #expect(json["date_from"] as? String == "2026-11-03")
        #expect(json["date_to"] as? String == "2026-11-03")
    }

    // MARK: Поиск

    @Test("Поиск: первая страница и догрузка по курсору без дублей")
    func searchPaging() async throws {
        let service = MockService()
        let page = try Fixture.decode(SearchResult.self, "search-week-ufa")
        service.searchHandler = { _, cursor in
            var result = page
            if cursor == nil {
                result.items = Array(page.items.prefix(10))
                result.nextCursor = "next"
            } else {
                result.items = Array(page.items.dropFirst(8)) // перекрытие в 2 карточки
                result.nextCursor = nil
            }
            return result
        }
        let model = SearchModel(service: service)
        model.search(language: .ru, near: nil)
        await model.waitForSearch()
        #expect(model.items.count == 10)
        #expect(model.canLoadMore)
        await model.loadMore(language: .ru, near: nil)
        #expect(model.items.count == page.items.count)
        #expect(!model.canLoadMore)
        #expect(model.appliedRange?.from.iso == page.applied.dateFrom)
        #expect(!model.sections.isEmpty)
    }

    @Test("Поиск: ошибка без данных → состояние ошибки")
    func searchFailure() async {
        let service = MockService()
        service.searchHandler = { _, _ in throw URLError(.timedOut) }
        let model = SearchModel(service: service)
        model.search(language: .ru, near: nil)
        await model.waitForSearch()
        #expect(model.state.error == .offline)
    }

    // MARK: Главная и офлайн

    @Test("Главная: лента и подборки; без сети — копия из кэша с отметкой времени")
    func homeOfflineFallback() async throws {
        let service = MockService()
        let cache = MemoryCache()
        let model = HomeModel(service: service, cache: cache)
        await model.load(municipalityID: "ufa", language: .ru)
        #expect(model.feed.value != nil)
        #expect(model.offlineSince == nil)
        #expect(model.collections[.free] != nil)
        // Подборка «Бесплатно» запрашивается с фильтром free
        #expect(service.searched.contains { $0.0.freeOnly })
        #expect(service.searched.contains { $0.0.categories == [.kids] })

        service.searchHandler = { _, _ in throw URLError(.notConnectedToInternet) }
        let offline = HomeModel(service: service, cache: cache)
        await offline.load(municipalityID: "ufa", language: .ru)
        #expect(offline.feed.value?.items.isEmpty == false)
        #expect(offline.offlineSince != nil)
    }

    @Test("Паспорт: не найден → ошибка; без сети → снимок из избранного")
    func eventDetailStates() async throws {
        let service = MockService()
        service.eventHandler = { _ in throw AfishaError.notFound }
        let cache = MemoryCache()
        let missing = EventDetailModel(eventID: "x", service: service, cache: cache)
        await missing.load(language: .ru)
        #expect(missing.state.error == .notFound)

        let snapshot = try Fixture.decode(EventDetail.self, "event-detail")
        cache.snapshots[snapshot.id] = snapshot
        service.eventHandler = { _ in throw URLError(.notConnectedToInternet) }
        let offline = EventDetailModel(eventID: snapshot.id, service: service, cache: cache)
        await offline.load(language: .ru)
        #expect(offline.detail?.id == snapshot.id)
        #expect(offline.state.cachedAt != nil)
    }

    @Test("Жалоба: отправка и подтверждение")
    func report() async {
        let model = EventDetailModel(eventID: "01a19c9d-827d-76e6-aa6c-7fc8a1b37465", service: MockService(), cache: nil)
        await model.report(reason: .wrongPrice, comment: "  ", occurrenceID: nil)
        #expect(model.reportState == .sent)
    }

    // MARK: Настройки

    @Test("Настройки сохраняются и читаются расширениями")
    func settingsPersist() {
        let defaults = UserDefaults(suiteName: "test.\(UUID().uuidString)")!
        let settings = AppSettings(defaults: defaults)
        settings.language = .ba
        settings.municipalityID = "sterlitamak"
        settings.municipalityName = "Стәрлетамаҡ"
        settings.lastLocation = Coordinate(latitude: 53.6, longitude: 55.9)
        let snapshot = AppSettings.snapshot(defaults: defaults)
        #expect(snapshot.language == .ba)
        #expect(snapshot.municipalityID == "sterlitamak")
        #expect(snapshot.lastLocation?.latitude == 53.6)
        #expect(AppSettings(defaults: defaults).municipalityName == "Стәрлетамаҡ")
    }
}

@Suite("Офлайн-хранилище SwiftData")
@MainActor
struct OfflineStoreTests {
    @Test("Избранное: добавить карточку, затем паспорт; удалить")
    func favorites() throws {
        let store = try OfflineStore.inMemory()
        let card = try #require(try Fixture.decode(SearchResult.self, "search-today").items.first)
        #expect(store.toggleFavorite(card: card))
        #expect(store.isFavorite(card.event.id))
        #expect(store.allFavorites().count == 1)
        #expect(store.favoriteCard(store.allFavorites()[0])?.id == card.id)
        #expect(store.favoriteDetail(card.event.id) == nil)
        #expect(!store.toggleFavorite(card: card))
        #expect(store.allFavorites().isEmpty)
    }

    @Test("Снимок паспорта доступен офлайн и обновляется")
    func detailSnapshot() throws {
        let store = try OfflineStore.inMemory()
        var detail = try Fixture.decode(EventDetail.self, "event-detail")
        store.addFavorite(detail: detail, now: at("2026-11-02T12:00"))
        #expect(store.favoriteDetail(detail.id)?.title == detail.title)
        detail.title = "Новое название"
        store.updateSnapshot(detail: detail)
        #expect(store.favoriteDetail(detail.id)?.title == "Новое название")
        #expect(store.allFavorites().first?.title == "Новое название")
    }

    @Test("Кэш ответов: запись, чтение, очистка старых")
    func responseCache() throws {
        let store = try OfflineStore.inMemory()
        let result = try Fixture.decode(SearchResult.self, "search-today")
        store.cache(result, key: "home:ufa", now: Date().addingTimeInterval(-10 * 86400))
        #expect(store.cached(SearchResult.self, key: "home:ufa")?.value.items.count == result.items.count)
        store.cache(result, key: "home:ufa:new")
        store.pruneCache()
        #expect(store.cached(SearchResult.self, key: "home:ufa") == nil)
        #expect(store.cached(SearchResult.self, key: "home:ufa:new") != nil)
    }
}
