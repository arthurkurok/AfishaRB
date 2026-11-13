import Foundation

/// Язык интерфейса и контента. Совпадает с параметром `lang` API.
public enum AppLanguage: String, CaseIterable, Sendable, Codable, Identifiable {
    case ru, ba

    public var id: String { rawValue }

    /// Локаль для форматирования чисел (разделители разрядов).
    public var locale: Locale { Locale(identifier: self == .ru ? "ru_RU" : "ba_RU") }

    /// Самоназвание языка — показывается в переключателе на любом языке интерфейса.
    public var endonym: String {
        switch self {
        case .ru: "Русский"
        case .ba: "Башҡортса"
        }
    }

    /// Язык по умолчанию: башкирский, если он первый среди предпочитаемых в системе.
    public static func preferred(from languages: [String] = Locale.preferredLanguages) -> AppLanguage {
        guard let first = languages.first?.lowercased() else { return .ru }
        return first.hasPrefix("ba") ? .ba : .ru
    }
}

/// Категория множественного числа по правилам CLDR.
public enum PluralCategory: String, Sendable, CaseIterable {
    case zero, one, two, few, many, other

    /// Правила CLDR для целых чисел. Для башкирского языка (как и для татарского и казахского)
    /// существительное после числительного не изменяется — только `other`.
    public static func of(_ count: Int, language: AppLanguage) -> PluralCategory {
        switch language {
        case .ba:
            return .other
        case .ru:
            let n = abs(count)
            let mod10 = n % 10
            let mod100 = n % 100
            if mod10 == 1 && mod100 != 11 { return .one }
            if (2...4).contains(mod10) && !(12...14).contains(mod100) { return .few }
            return .many
        }
    }
}

/// Каталог строк в формате String Catalog (`Localizable.xcstrings`).
///
/// Файл каталога лежит в ресурсах пакета как есть и читается во время выполнения: так одна и та же
/// реализация работает в приложении, виджете, App Intents и в `swift test` на macOS, а язык
/// переключается внутри приложения без перезапуска (системной локали `ba` в iOS может не быть,
/// docs/07-design.md §12). Редактируется файл в Xcode как обычный String Catalog.
public final class StringCatalog: Sendable {
    enum Unit: Sendable {
        case plain(String)
        case plural([PluralCategory: String])
    }

    /// ключ → язык → значение
    let entries: [String: [AppLanguage: Unit]]
    public let sourceLanguage: AppLanguage

    public init(data: Data) throws {
        let raw = try JSONDecoder().decode(RawCatalog.self, from: data)
        sourceLanguage = AppLanguage(rawValue: raw.sourceLanguage) ?? .ru
        var entries: [String: [AppLanguage: Unit]] = [:]
        for (key, entry) in raw.strings {
            var units: [AppLanguage: Unit] = [:]
            for (code, localization) in entry.localizations ?? [:] {
                guard let language = AppLanguage(rawValue: code) else { continue }
                if let unit = localization.stringUnit {
                    units[language] = .plain(unit.value)
                } else if let plural = localization.variations?.plural {
                    var forms: [PluralCategory: String] = [:]
                    for (category, form) in plural {
                        if let category = PluralCategory(rawValue: category) { forms[category] = form.stringUnit.value }
                    }
                    units[language] = .plural(forms)
                }
            }
            entries[key] = units
        }
        self.entries = entries
    }

    /// Каталог из ресурсов пакета AfishaKit.
    public static let main: StringCatalog = {
        guard let url = Bundle.module.url(forResource: "Localizable", withExtension: "xcstrings"),
              let data = try? Data(contentsOf: url),
              let catalog = try? StringCatalog(data: data) else {
            assertionFailure("Localizable.xcstrings не найден в ресурсах AfishaKit")
            return StringCatalog.empty
        }
        return catalog
    }()

    static let empty = StringCatalog(entries: [:])

    private init(entries: [String: [AppLanguage: Unit]]) {
        self.entries = entries
        self.sourceLanguage = .ru
    }

    public var keys: [String] { Array(entries.keys) }

    /// Есть ли перевод ключа на язык.
    public func has(_ key: String, in language: AppLanguage) -> Bool { entries[key]?[language] != nil }

    /// Шаблон строки: язык → исходный язык → сам ключ (видно в интерфейсе, тесты это ловят).
    public func template(_ key: String, language: AppLanguage, count: Int? = nil) -> String {
        guard let units = entries[key], let unit = units[language] ?? units[sourceLanguage] else { return key }
        switch unit {
        case let .plain(value):
            return value
        case let .plural(forms):
            let resolvedLanguage = units[language] != nil ? language : sourceLanguage
            let category = PluralCategory.of(count ?? 0, language: resolvedLanguage)
            return forms[category] ?? forms[.other] ?? forms.values.first ?? key
        }
    }

    /// Строка с подстановкой аргументов (`%@`, `%lld`, `%1$@`). Для плюралов первый целый аргумент
    /// выбирает форму.
    public func string(_ key: String, language: AppLanguage, _ arguments: [any CVarArg] = []) -> String {
        let count = arguments.lazy.compactMap { argument -> Int? in
            switch argument {
            case let value as Int: value
            case let value as Int64: Int(value)
            case let value as Int32: Int(value)
            default: nil
            }
        }.first
        let format = template(key, language: language, count: count)
        guard !arguments.isEmpty else { return format }
        return String(format: format, locale: language.locale, arguments: normalized(arguments))
    }

    /// `%lld` ожидает 64-битное целое — приводим Int к Int64, чтобы не зависеть от платформы.
    private func normalized(_ arguments: [any CVarArg]) -> [any CVarArg] {
        arguments.map { argument in
            if let value = argument as? Int { return Int64(value) }
            return argument
        }
    }
}

// MARK: - Формат файла .xcstrings

private struct RawCatalog: Decodable {
    let sourceLanguage: String
    let strings: [String: RawEntry]
}

private struct RawEntry: Decodable {
    let localizations: [String: RawLocalization]?
}

private struct RawLocalization: Decodable {
    let stringUnit: RawUnit?
    let variations: RawVariations?
}

private struct RawVariations: Decodable {
    let plural: [String: RawForm]?
}

private struct RawForm: Decodable {
    let stringUnit: RawUnit
}

private struct RawUnit: Decodable {
    let state: String?
    let value: String
}

/// Локализатор, привязанный к языку: `loc("home.today")`, `loc("search.found", 5)`.
public struct Localizer: Sendable {
    public let language: AppLanguage
    let catalog: StringCatalog

    public init(language: AppLanguage, catalog: StringCatalog = .main) {
        self.language = language
        self.catalog = catalog
    }

    public func callAsFunction(_ key: String, _ arguments: any CVarArg...) -> String {
        catalog.string(key, language: language, arguments)
    }

    /// Есть ли ключ в каталоге (для значений из данных: коды языков мероприятия и т. п.).
    public func has(_ key: String) -> Bool { catalog.has(key, in: language) || catalog.has(key, in: catalog.sourceLanguage) }

    public static let ru = Localizer(language: .ru)
    public static let ba = Localizer(language: .ba)
}
