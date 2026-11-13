import Foundation
import Observation

/// Справочники: категории и муниципалитеты. Загружаются один раз на язык, кэшируются офлайн.
@MainActor
@Observable
public final class ReferenceData {
    public private(set) var categories: [CategoryInfo] = []
    public private(set) var municipalities: [Municipality] = []
    public private(set) var language: AppLanguage?

    private let service: any AfishaService
    private weak var cache: (any ResponseCache)?

    public init(service: any AfishaService, cache: (any ResponseCache)?) {
        self.service = service
        self.cache = cache
    }

    /// Загрузить справочники для языка (повторный вызов для того же языка ничего не делает).
    public func load(language: AppLanguage, force: Bool = false) async {
        if !force, self.language == language, !categories.isEmpty, !municipalities.isEmpty { return }
        async let categoriesState = loadWithCache(key: "categories:\(language.rawValue)", cache: cache) {
            try await self.service.categories(language: language)
        }
        async let municipalitiesState = loadWithCache(key: "municipalities:\(language.rawValue)", cache: cache) {
            try await self.service.municipalities(language: language)
        }
        let (cats, munis) = await (categoriesState, municipalitiesState)
        if let value = cats.value { categories = value }
        if let value = munis.value { municipalities = value }
        self.language = language
    }

    public func municipality(id: String?) -> Municipality? {
        guard let id else { return nil }
        return municipalities.first { $0.id == id }
    }

    /// Города сверху (по числу событий), затем районы по алфавиту.
    public var sortedMunicipalities: [Municipality] {
        let cities = municipalities.filter { $0.kind == .city }.sorted { ($0.upcoming ?? 0) > ($1.upcoming ?? 0) }
        let districts = municipalities.filter { $0.kind != .city }.sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
        return cities + districts
    }

    /// Поиск по ru и ba названиям: «Өфө» находит Уфу и наоборот (07 §12).
    public func searchMunicipalities(_ text: String) -> [Municipality] {
        let query = MunicipalityMatcher.normalize(text)
        guard !query.isEmpty else { return sortedMunicipalities }
        return sortedMunicipalities.filter { MunicipalityMatcher.matches($0, query: query) }
    }

    /// Ближайший к точке муниципалитет (для «определить город по геопозиции»).
    public func nearestMunicipality(to coordinate: Coordinate) -> Municipality? {
        municipalities
            .compactMap { m in m.coordinate.map { (m, Geo.distanceKm($0, coordinate)) } }
            .min { $0.1 < $1.1 }?.0
    }
}

enum MunicipalityMatcher {
    /// Нормализация для поиска: регистр, ё→е и башкирские буквы → близкие русские.
    static func normalize(_ text: String) -> String {
        let map: [Character: Character] = [
            "ё": "е", "ә": "а", "ө": "о", "ү": "у", "ғ": "г", "ҡ": "к", "ң": "н", "ҙ": "з", "ҫ": "с", "һ": "х",
        ]
        return String(text.lowercased().trimmingCharacters(in: .whitespaces).map { map[$0] ?? $0 })
    }

    static func matches(_ municipality: Municipality, query: String) -> Bool {
        [municipality.name, municipality.nameRu, municipality.nameBa ?? "", municipality.id]
            .map(normalize)
            .contains { $0.contains(query) }
    }
}

/// Геометрия на сфере.
public enum Geo {
    /// Расстояние по формуле гаверсинусов, км.
    public static func distanceKm(_ a: Coordinate, _ b: Coordinate) -> Double {
        let r = 6371.0
        let dLat = (b.latitude - a.latitude) * .pi / 180
        let dLon = (b.longitude - a.longitude) * .pi / 180
        let lat1 = a.latitude * .pi / 180
        let lat2 = b.latitude * .pi / 180
        let h = sin(dLat / 2) * sin(dLat / 2) + cos(lat1) * cos(lat2) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * asin(min(1, sqrt(h)))
    }
}
