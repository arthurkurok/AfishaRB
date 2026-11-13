import Foundation
import Observation

/// Общие константы приложения и расширений.
public enum AppConstants {
    /// App Group: настройки и последняя геопозиция доступны виджету и App Intents.
    public static let appGroup = "group.ru.afisharb.app"
    /// Адрес API по умолчанию. В Info.plist можно переопределить ключом `AfishaAPIBaseURL`.
    public static let defaultAPIBaseURL = URL(string: "http://localhost:8000")!
    /// Город по умолчанию — Уфа (крупнейший по числу событий).
    public static let defaultMunicipalityID = "ufa"
    /// Страница «Как работают рекомендации» (ст. 10.2-2 149-ФЗ) на сайте.
    public static let recommendationRulesURL = URL(string: "https://afisharb.ru/about/recommendations")!
    /// Адрес для правок башкирского перевода (07 §12).
    public static let translationFeedbackEmail = "ba@afisharb.ru"

    /// Адрес API: Info.plist (`AfishaAPIBaseURL`) → значение по умолчанию.
    public static func apiBaseURL(bundle: Bundle = .main) -> URL {
        if let raw = bundle.object(forInfoDictionaryKey: "AfishaAPIBaseURL") as? String,
           let url = URL(string: raw), url.scheme != nil {
            return url
        }
        return defaultAPIBaseURL
    }
}

/// Координата [широта, долгота].
public struct Coordinate: Hashable, Sendable, Codable {
    public let latitude: Double
    public let longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Формат параметра `near` API: «lat,lon».
    public var queryValue: String { String(format: "%.5f,%.5f", latitude, longitude) }
}

/// Настройки пользователя. Хранятся локально (без входа доступно всё, 08 §6) в общем
/// UserDefaults App Group, чтобы виджет и Siri знали язык и город.
@MainActor
@Observable
public final class AppSettings {
    private let defaults: UserDefaults

    public var language: AppLanguage { didSet { defaults.set(language.rawValue, forKey: Keys.language) } }
    public var municipalityID: String { didSet { defaults.set(municipalityID, forKey: Keys.municipality) } }
    /// Название города на момент выбора — для заголовка до загрузки справочника и для виджета.
    public var municipalityName: String? { didSet { defaults.set(municipalityName, forKey: Keys.municipalityName) } }
    /// Режим «Просто»: крупные элементы и три главные кнопки (08 §4).
    public var simpleMode: Bool { didSet { defaults.set(simpleMode, forKey: Keys.simpleMode) } }
    /// Крупный текст независимо от системной настройки.
    public var largeText: Bool { didSet { defaults.set(largeText, forKey: Keys.largeText) } }
    /// Онбординг пройден.
    public var onboardingDone: Bool { didSet { defaults.set(onboardingDone, forKey: Keys.onboarding) } }
    /// Последняя известная геопозиция (только с согласия пользователя) — для «Рядом» в виджете.
    public var lastLocation: Coordinate? {
        didSet {
            if let lastLocation, let data = try? JSONEncoder().encode(lastLocation) {
                defaults.set(data, forKey: Keys.location)
            } else {
                defaults.removeObject(forKey: Keys.location)
            }
        }
    }

    public var localizer: Localizer { Localizer(language: language) }

    public init(defaults: UserDefaults? = nil) {
        let store = defaults ?? UserDefaults(suiteName: AppConstants.appGroup) ?? .standard
        self.defaults = store
        language = store.string(forKey: Keys.language).flatMap(AppLanguage.init(rawValue:)) ?? AppLanguage.preferred()
        municipalityID = store.string(forKey: Keys.municipality) ?? AppConstants.defaultMunicipalityID
        municipalityName = store.string(forKey: Keys.municipalityName)
        simpleMode = store.bool(forKey: Keys.simpleMode)
        largeText = store.bool(forKey: Keys.largeText)
        onboardingDone = store.bool(forKey: Keys.onboarding)
        lastLocation = store.data(forKey: Keys.location).flatMap { try? JSONDecoder().decode(Coordinate.self, from: $0) }
    }

    /// Снимок для виджета и App Intents (они не держат @MainActor-объект).
    public nonisolated static func snapshot(defaults: UserDefaults? = nil) -> SettingsSnapshot {
        let store = defaults ?? UserDefaults(suiteName: AppConstants.appGroup) ?? .standard
        return SettingsSnapshot(
            language: store.string(forKey: Keys.language).flatMap(AppLanguage.init(rawValue:)) ?? AppLanguage.preferred(),
            municipalityID: store.string(forKey: Keys.municipality) ?? AppConstants.defaultMunicipalityID,
            municipalityName: store.string(forKey: Keys.municipalityName),
            lastLocation: store.data(forKey: Keys.location).flatMap { try? JSONDecoder().decode(Coordinate.self, from: $0) }
        )
    }

    enum Keys {
        static let language = "settings.language"
        static let municipality = "settings.municipality"
        static let municipalityName = "settings.municipalityName"
        static let simpleMode = "settings.simpleMode"
        static let largeText = "settings.largeText"
        static let onboarding = "settings.onboardingDone"
        static let location = "settings.lastLocation"
    }
}

/// Неизменяемый снимок настроек для расширений.
public struct SettingsSnapshot: Sendable, Hashable {
    public let language: AppLanguage
    public let municipalityID: String
    public let municipalityName: String?
    public let lastLocation: Coordinate?
}
