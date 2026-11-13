@testable import AfishaKit
import Foundation
import Testing

@Suite("Фильтры поиска")
struct SearchFiltersTests {
    @Test("Счётчик активных фильтров и сброс с сохранением города")
    func activeCountAndReset() {
        var filters = SearchFilters(when: .weekend, municipalities: ["sterlitamak"])
        filters.categories = [.theatre, .kids]
        filters.setFree(true)
        filters.pushkin = true
        #expect(filters.activeCount == 5) // период + 2 категории + цена + Пушкинская карта
        filters.reset()
        #expect(filters.activeCount == 0)
        #expect(filters.municipalities == ["sterlitamak"])
    }

    @Test("Бесплатно и «до N ₽» взаимоисключающие; период и диапазон тоже")
    func exclusivity() {
        var filters = SearchFilters()
        filters.setPriceMax(1000)
        filters.setFree(true)
        #expect(filters.priceMax == nil)
        filters.setPriceMax(500)
        #expect(!filters.freeOnly)
        filters.setWhen(.today)
        filters.setDateRange(DateRange(from: LocalDate(iso: "2026-11-10")!, to: LocalDate(iso: "2026-11-12")!))
        #expect(filters.when == nil)
        let query = filters.query(language: .ru)
        #expect(query.dateFrom == "2026-11-10")
        #expect(query.dateTo == "2026-11-12")
        #expect(query.when == nil)
    }

    @Test("Режим «с ребёнком» отправляет возраст, а не возрастной знак")
    func childMode() {
        var filters = SearchFilters()
        filters.ageRatingMax = 12
        filters.childAge = 5
        let query = filters.query(language: .ru)
        #expect(query.age == 5)
        #expect(query.ageRatingMax == nil)
    }

    @Test("Диплинк поиска: туда и обратно без потерь")
    func deepLinkRoundTrip() throws {
        var filters = SearchFilters(when: .weekend, municipalities: ["ufa"])
        filters.categories = [.music, .folk]
        filters.timeOfDay = [.evening]
        filters.setPriceMax(1000)
        filters.childAge = 6
        filters.pushkin = true
        filters.accessible = true
        filters.text = "курай"
        filters.sort = .date
        let url = DeepLink.search(filters).url
        guard case let .search(parsed)? = DeepLink(url: url) else {
            Issue.record("диплинк не разобран: \(url)")
            return
        }
        #expect(parsed == filters)
    }
}

@Suite("Диплинки")
struct DeepLinkTests {
    let id = "01a19c9d-827d-76e6-aa6c-7fc8a1b37465"

    @Test("afisha://event/{id} и Universal Links")
    func eventLinks() {
        #expect(DeepLink(url: URL(string: "afisha://event/\(id)")!) == .event(id: id))
        #expect(DeepLink(url: URL(string: "afisha://event/\(id.uppercased())")!) == .event(id: id))
        #expect(DeepLink(url: URL(string: "https://afisharb.ru/e/\(id)")!) == .event(id: id))
        #expect(DeepLink(url: URL(string: "https://afisharb.ru/ba/e/\(id)")!) == .event(id: id))
        #expect(DeepLink.event(id: id).url.absoluteString == "afisha://event/\(id)")
    }

    @Test("Неверные ссылки отклоняются")
    func invalidLinks() {
        #expect(DeepLink(url: URL(string: "afisha://event/not-a-uuid")!) == nil)
        #expect(DeepLink(url: URL(string: "afisha://unknown")!) == nil)
        #expect(DeepLink(url: URL(string: "https://evil.example/e/\(id)")!) == nil)
        #expect(DeepLink(url: URL(string: "afisha://event/")!) == nil)
    }

    @Test("Гид, сегодня, избранное, настройки")
    func otherLinks() {
        #expect(DeepLink(url: URL(string: "afisha://guide?q=%D0%BA%D0%B0%D0%B2%D0%B0")!) == .guide(question: "кава"))
        #expect(DeepLink(url: URL(string: "afisha://guide")!) == .guide(question: nil))
        #expect(DeepLink(url: URL(string: "afisha://today")!) == .today)
        #expect(DeepLink(url: URL(string: "afisha://favorites")!) == .favorites)
        #expect(DeepLink(url: URL(string: "afisha://settings")!) == .settings)
    }

    @Test("Ссылка «Поделиться» ведёт на сайт с языковым префиксом")
    func webURL() {
        #expect(DeepLink.webURL(eventID: id, language: .ru).absoluteString == "https://afisharb.ru/e/\(id)")
        #expect(DeepLink.webURL(eventID: id, language: .ba).absoluteString == "https://afisharb.ru/ba/e/\(id)")
    }
}

@Suite("Карточка события и VoiceOver")
struct CardPresentationTests {
    @Test("Карточка читается одной фразой (07 §11)")
    func accessibilityPhrase() throws {
        let result = try Fixture.decode(SearchResult.self, "search-today")
        let card = try #require(result.items.first { !$0.isRange && $0.venue != nil && !$0.event.priceInfo.isEffectivelyFree && $0.event.price.min != nil })
        let start = try #require(card.startDate)
        let presentation = CardPresentation(card: card, language: .ru, now: start.addingTimeInterval(-3600))
        let phrase = presentation.accessibilityLabel
        #expect(phrase.hasPrefix(card.event.title + ", " + "\(card.event.ageRating)+, сегодня, "))
        #expect(phrase.contains(EventDateFormatter(language: .ru).time(start)))
        #expect(phrase.contains(card.venue!.name))
        #expect(phrase.contains("рубл"))
    }

    @Test("Статус «мало билетов» в конце фразы, отмена — в бейдже")
    func statusInPhrase() throws {
        var card = try #require(try Fixture.decode(SearchResult.self, "search-today").items.first)
        card.availability = .fewLeft
        let start = try #require(card.startDate)
        let presentation = CardPresentation(card: card, language: .ru, now: start)
        #expect(presentation.accessibilityLabel.hasSuffix("мало билетов"))
        #expect(presentation.badge == .fewLeft)
        card.status = .cancelled
        #expect(CardPresentation(card: card, language: .ru, now: start).badge == .cancelled)
    }

    @Test("Пример из дизайн-системы: «Буратино», 0+, суббота, театр кукол, от 400 рублей")
    func designExample() throws {
        var card = try #require(try Fixture.decode(SearchResult.self, "search-today").items.first)
        card.event.title = "Спектакль «Буратино»"
        card.event.ageRating = 0
        card.event.pushkinCard = false
        card.event.price = .init(min: "400.00", max: "800.00", isFree: false, currency: .rub)
        card.startsAt = "2026-11-07T11:00:00+05:00"
        card.isRange = false
        card.venue?.name = "Театр кукол"
        card.availability = .fewLeft
        card.status = .scheduled
        let phrase = CardPresentation(card: card, language: .ru, now: at("2026-11-02T12:00")).accessibilityLabel
        #expect(phrase == "Спектакль «Буратино», 0+, суббота 7 ноября, 11:00, Театр кукол, от 400 рублей, мало билетов")
    }

    @Test("Группировка выдачи по дням в TZ региона, дубли убираются")
    func grouping() throws {
        let result = try Fixture.decode(SearchResult.self, "search-week-ufa")
        let sections = (result.items + result.items.prefix(3)).uniqued().groupedByDay(rangeStart: LocalDate(iso: result.applied.dateFrom))
        #expect(sections.map(\.day) == sections.map(\.day).sorted())
        #expect(sections.reduce(0) { $0 + $1.items.count } == result.items.count)
        for section in sections {
            #expect(section.items.allSatisfy { $0.localDay! <= section.day || $0.isRange })
        }
    }
}
