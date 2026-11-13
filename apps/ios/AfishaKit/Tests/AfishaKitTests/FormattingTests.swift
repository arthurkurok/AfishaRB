@testable import AfishaKit
import Foundation
import Testing

@Suite("Цены и возраст")
struct PriceAndAgeTests {
    let ru = PriceFormatter(language: .ru)
    let ba = PriceFormatter(language: .ba)

    @Test("Чип цены: бесплатно, точная, «от», неизвестна")
    func chips() {
        #expect(ru.chip(PriceInfo(minString: "0.00", maxString: "0.00", isFree: true)) == "Бесплатно")
        #expect(ru.chip(PriceInfo(minString: "350.00", maxString: "350.00", isFree: false)) == "350 ₽")
        #expect(ru.chip(PriceInfo(minString: "400.00", maxString: "1500.00", isFree: false)) == "от 400 ₽")
        #expect(ru.chip(PriceInfo(minString: nil, maxString: "700.00", isFree: false)) == "700 ₽")
        #expect(ru.chip(PriceInfo(minString: nil, maxString: nil, isFree: false)) == nil)
        #expect(ba.chip(PriceInfo(minString: "400.00", maxString: "1500.00", isFree: false)) == "400 һумдан")
        #expect(ba.chip(PriceInfo(minString: "0", maxString: "0", isFree: true)) == "Бушлай")
    }

    @Test("Нулевая цена без флага — тоже бесплатно")
    func zeroPriceIsFree() {
        #expect(PriceInfo(minString: "0.00", maxString: "0.00", isFree: false).isEffectivelyFree)
        #expect(!PriceInfo(minString: "0.00", maxString: "300.00", isFree: false).isEffectivelyFree)
    }

    @Test("Диапазон, копейки и разряды")
    func amounts() {
        #expect(ru.full(PriceInfo(minString: "400.00", maxString: "1500.00", isFree: false)) == "400–1500 ₽")
        #expect(ru.amount(Decimal(string: "15000")!) == "15\u{00A0}000")
        #expect(ru.amount(Decimal(string: "350.5")!) == "350,50")
        #expect(ru.upTo(1000) == "до 1000 ₽")
        #expect(ba.upTo(1000) == "1000 һумға тиклем")
    }

    @Test("Цена для VoiceOver склоняется по CLDR", arguments: [
        ("1.00", "от 1 рубля"), ("2.00", "от 2 рублей"), ("21.00", "от 21 рубля"), ("400.00", "от 400 рублей"), ("11.00", "от 11 рублей"),
    ])
    func spoken(min: String, expected: String) {
        #expect(ru.spoken(PriceInfo(minString: min, maxString: "5000.00", isFree: false)) == expected)
    }

    @Test("Точная цена для VoiceOver")
    func spokenExact() {
        #expect(ru.spoken(PriceInfo(minString: "1.00", maxString: "1.00", isFree: false)) == "1 рубль")
        #expect(ru.spoken(PriceInfo(minString: "350.00", maxString: "350.00", isFree: false)) == "350 рублей")
        #expect(ba.spoken(PriceInfo(minString: "350.00", maxString: "350.00", isFree: false)) == "350 һум")
    }

    @Test("Возрастной знак для ребёнка (436-ФЗ, как maxRatingForChild на сервере)", arguments: [
        (0, 0), (5, 0), (6, 6), (11, 6), (12, 12), (15, 12), (16, 16), (17, 16),
    ])
    func childRating(age: Int, rating: Int) {
        #expect(AgeRating.maxRating(forChildAge: age).value == rating)
        #expect(AgeRating(rating).fits(childAge: age))
    }

    @Test("Подпись возрастного знака")
    func ageLabel() {
        #expect(AgeRating(0).label == "0+")
        #expect(AgeRating(18).label == "18+")
        #expect(!AgeRating(12).fits(childAge: 8))
    }
}

@Suite("Статусы: форма + текст")
struct StatusTests {
    @Test("Маппинг статуса и наличия билетов в бейдж", arguments: [
        ("scheduled", "unknown", nil as BadgeShape?),
        ("scheduled", "available", nil),
        ("scheduled", "few_left", .honeyDrop),
        ("scheduled", "sold_out", .emptyRhombus),
        ("rescheduled", "available", .rhombusArrow),
        ("postponed", "unknown", .rhombusArrow),
        ("cancelled", "few_left", .crossedRhombus),
        ("sold_out", "unknown", .emptyRhombus),
        ("ended", "unknown", .emptyRhombus),
        ("unverified", "unknown", .dottedRhombus),
    ])
    func mapping(status: String, availability: String, shape: BadgeShape?) {
        #expect(StatusBadge(status: status, availability: availability, startsAt: nil)?.shape == shape)
    }

    @Test("Тексты бейджей ru/ba")
    func texts() {
        let newDate = at("2026-11-19T19:00")
        #expect(StatusBadge.rescheduled(newStart: newDate).text(.ru) == "Перенесено → 19 ноября")
        #expect(StatusBadge.rescheduled(newStart: newDate).text(.ba) == "Күсерелде → 19 ноябрь")
        #expect(StatusBadge.postponed.text(.ru) == "Перенесено, новая дата уточняется")
        #expect(StatusBadge.cancelled.text(.ru) == "Отменено")
        #expect(StatusBadge.soldOut.text(.ru) == "Билетов нет")
        #expect(StatusBadge.fewLeft.text(.ru) == "Осталось мало билетов")
        #expect(StatusBadge.fewLeft.spoken(.ru) == "мало билетов")
        #expect(StatusBadge.ended.text(.ru) == "Прошло")
        #expect(StatusBadge.unverified.text(.ba) == "Мәғлүмәт аныҡлана")
    }

    @Test("Неактивные статусы обесцвечивают карточку")
    func inactive() {
        #expect(StatusBadge.cancelled.isInactive)
        #expect(StatusBadge.ended.isInactive)
        #expect(!StatusBadge.fewLeft.isInactive)
        #expect(!StatusBadge.soldOut.isInactive)
    }

    @Test("У каждой формы есть хотя бы один статус (форма различима без цвета)")
    func everyShapeUsed() {
        let badges: [StatusBadge] = [.rescheduled(newStart: nil), .postponed, .cancelled, .soldOut, .fewLeft, .ended, .unverified]
        #expect(Set(badges.map(\.shape)) == Set(BadgeShape.allCases))
    }
}

@Suite("Прочее форматирование")
struct MiscFormattingTests {
    @Test("Описание: HTML источника → абзацы, сущности раскрыты")
    func description() {
        let html = "<p>Спектакль &laquo;Буратино&raquo;&nbsp;для детей</p><p>Ведущий: МАУК &quot;Центр&quot;</p><br/><ul><li>пункт</li></ul>"
        let paragraphs = DescriptionText.paragraphs(fromHTML: html)
        #expect(paragraphs == ["Спектакль «Буратино»\u{00A0}для детей", "Ведущий: МАУК \"Центр\"", "• пункт"])
        #expect(DescriptionText.decodeEntities("&#1179;урай &amp; &#1211;") == "қурай & һ")
    }

    @Test("Расстояние до площадки")
    func distance() {
        #expect(CardPresentation.distance(0.84, language: .ru) == "840 м")
        #expect(CardPresentation.distance(2.4, language: .ru) == "2,4 км")
        #expect(CardPresentation.distance(35.2, language: .ru) == "35 км")
    }

    @Test("Ошибки сети становятся «нет связи», тексты без кодов")
    func errors() {
        #expect(AfishaError.from(URLError(.notConnectedToInternet)) == .offline)
        #expect(AfishaError.from(URLError(.timedOut)) == .offline)
        #expect(AfishaError.from(CancellationError()) == .cancelled)
        #expect(AfishaError.from(URLError(.cancelled)) == .cancelled)
        #expect(!AfishaError.offline.message(.ru).contains("503"))
        #expect(AfishaError.offline.message(.ru).contains("Избранное доступно без сети"))
    }

    @Test("Поиск города по ru и ba названиям (Өфө = Уфа)")
    @MainActor
    func municipalitySearch() async throws {
        let reference = ReferenceData(service: MockService(), cache: nil)
        await reference.load(language: .ba)
        #expect(reference.searchMunicipalities("Өфө").first?.id == "ufa")
        #expect(reference.searchMunicipalities("уфа").first?.id == "ufa")
        #expect(reference.searchMunicipalities("стерлит").contains { $0.id == "sterlitamak" })
        let nearUfa = Coordinate(latitude: 54.72, longitude: 55.95)
        #expect(reference.nearestMunicipality(to: nearUfa)?.id == "ufa")
        #expect(reference.sortedMunicipalities.first?.kind == .city)
    }

    @Test("Расстояние по гаверсинусу: Уфа — Стерлитамак ≈ 124 км")
    func haversine() {
        let km = Geo.distanceKm(Coordinate(latitude: 54.7469, longitude: 55.9988), Coordinate(latitude: 53.632, longitude: 55.9424))
        #expect(abs(km - 124) < 3)
    }
}
