@testable import AfishaKit
import Foundation
import Testing

/// Инвариант 4 (CLAUDE.md): каждая строка интерфейса есть сразу на ru и ba.
@Suite("Каталог строк ru/ba")
struct LocalizationTests {
    let catalog = StringCatalog.main

    @Test("Каталог загружается из ресурсов пакета")
    func loads() {
        #expect(catalog.keys.count > 200)
        #expect(catalog.sourceLanguage == .ru)
    }

    @Test("У каждого ключа есть перевод на русский и башкирский")
    func everyKeyHasBothLanguages() {
        let missing = catalog.keys.filter { !catalog.has($0, in: .ru) || !catalog.has($0, in: .ba) }
        #expect(missing.isEmpty, "без перевода: \(missing.sorted())")
    }

    @Test("Спецификаторы формата совпадают в ru и ba")
    func formatSpecifiersMatch() {
        let pattern = try! NSRegularExpression(pattern: "%(\\d+\\$)?(lld|@|d)")
        func specifiers(_ s: String) -> [String] {
            pattern.matches(in: s, range: NSRange(s.startIndex..., in: s)).map { String(s[Range($0.range, in: s)!]) }.sorted()
        }
        for key in catalog.keys {
            let ru = specifiers(catalog.template(key, language: .ru, count: 5))
            let ba = specifiers(catalog.template(key, language: .ba, count: 5))
            #expect(ru == ba, "ключ \(key): ru \(ru) ≠ ba \(ba)")
        }
    }

    @Test("Ключи, собираемые из перечислений, существуют")
    func enumKeys() {
        var keys: [String] = []
        keys += CategoryCode.allCases.map { "category.\($0.rawValue)" }
        keys += TagCode.allCases.map { "tag.\($0.rawValue)" }
        keys += ReasonCode.allCases.map { "reason.\($0.rawValue)" }
        keys += TimeOfDay.allCases.map { "time.\($0.rawValue)" }
        keys += WhenPreset.allCases.map { "when.\($0.rawValue)" }
        keys += SortMode.allCases.map { "sort.\($0.rawValue)" }
        keys += HomeCollection.allCases.map { "home.collection.\($0.rawValue)" }
        keys += ReportReason.allCases.map { "report.reason.\($0.rawValue)" }
        keys += TrustLevel.allCases.map { "trust.\($0.rawValue)" }
        keys += ["stale", "vanished"].map { "passport.freshness.\($0)" }
        keys += ["yandex", "dgis", "apple"].map { "route.\($0)" }
        keys += (1...4).map { "guide.example.\($0)" }
        keys += (1...5).flatMap { ["rules.\($0).title", "rules.\($0).text"] }
        let missing = keys.filter { !catalog.has($0, in: .ru) || !catalog.has($0, in: .ba) }
        #expect(missing.isEmpty, "нет ключей: \(missing)")
    }

    @Test("Все ключи, использованные в коде приложения, виджета и пакета, есть в каталоге")
    func keysUsedInSources() throws {
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let directories = ["Afisha", "AfishaWidgets", "AfishaKit/Sources"].map { root.appendingPathComponent($0) }
        let pattern = try NSRegularExpression(pattern: #"(?:loc|Localizer\(language: [A-Za-z.()]+\)|\.localizer)\("([a-z0-9_.]+)""#)
        var used = Set<String>()
        for directory in directories {
            let files = FileManager.default.enumerator(at: directory, includingPropertiesForKeys: nil)?
                .compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" } ?? []
            for file in files {
                let text = try String(contentsOf: file, encoding: .utf8)
                for match in pattern.matches(in: text, range: NSRange(text.startIndex..., in: text)) {
                    used.insert(String(text[Range(match.range(at: 1), in: text)!]))
                }
            }
        }
        #expect(used.count > 150)
        let missing = used.filter { !catalog.has($0, in: .ru) || !catalog.has($0, in: .ba) }
        #expect(missing.isEmpty, "нет в каталоге: \(missing.sorted())")
    }

    @Test("Плюрализация CLDR для русского", arguments: [
        (0, PluralCategory.many), (1, .one), (2, .few), (4, .few), (5, .many), (11, .many),
        (12, .many), (14, .many), (21, .one), (22, .few), (25, .many), (101, .one), (111, .many),
    ])
    func russianPlurals(count: Int, category: PluralCategory) {
        #expect(PluralCategory.of(count, language: .ru) == category)
    }

    @Test("Башкирский: существительное после числительного не изменяется")
    func bashkirPlural() {
        let loc = Localizer.ba
        #expect(loc("count.events", 1) == "1 сара")
        #expect(loc("count.events", 5) == "5 сара")
        #expect(Localizer.ru("count.events", 1) == "1 событие")
        #expect(Localizer.ru("count.events", 3) == "3 события")
        #expect(Localizer.ru("count.events", 25) == "25 событий")
    }

    @Test("Позиционные аргументы и отсутствующий ключ")
    func formatting() {
        #expect(Localizer.ru("price.range", "400", "1500") == "400–1500 ₽")
        #expect(Localizer.ru("home.stats", 10, 20, 30).contains("площадок: 20"))
        #expect(Localizer.ru("нет.такого.ключа") == "нет.такого.ключа")
        #expect(!Localizer.ru.has("нет.такого.ключа"))
    }

    @Test("Язык по умолчанию — из системных предпочтений")
    func preferredLanguage() {
        #expect(AppLanguage.preferred(from: ["ba-RU", "ru-RU"]) == .ba)
        #expect(AppLanguage.preferred(from: ["ru-RU"]) == .ru)
        #expect(AppLanguage.preferred(from: ["en-US"]) == .ru)
        #expect(AppLanguage.ba.endonym == "Башҡортса")
    }
}
