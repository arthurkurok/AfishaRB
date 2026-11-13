import AfishaAPI
import Foundation

/// Фильтры поиска (docs/03-functional-spec.md §1.2). Одна модель для главной, поиска,
/// диплинков, виджета и Siri; сериализуется в параметры `/v1/occurrences`.
public struct SearchFilters: Hashable, Sendable, Codable {
    /// Быстрый период. Взаимоисключающий с `dateRange`.
    public var when: WhenPreset?
    /// Свой диапазон дат (календарь).
    public var dateRange: DateRange?
    public var timeOfDay: Set<TimeOfDay> = []
    /// Муниципалитеты (slug). Пусто — вся республика.
    public var municipalities: [String] = []
    /// «Рядом со мной»: радиус в км (1/3/10/30). Координата подставляется при запросе.
    public var nearRadiusKm: Double?
    public var categories: Set<CategoryCode> = []
    public var tags: Set<TagCode> = []
    public var freeOnly = false
    /// Цена: хотя бы часть билетов ≤ порога.
    public var priceMax: Int?
    /// Режим «с ребёнком N лет» (0…17).
    public var childAge: Int?
    /// Максимальный возрастной знак (0/6/12/16/18).
    public var ageRatingMax: Int?
    public var pushkin = false
    public var accessible = false
    public var hideSoldOut = false
    public var text = ""
    public var sort: SortMode?

    public init(when: WhenPreset? = nil, municipalities: [String] = []) {
        self.when = when
        self.municipalities = municipalities
    }

    /// Пресеты цены и радиуса из спецификации.
    public static let pricePresets = [500, 1000, 2000]
    public static let radiusPresets: [Double] = [1, 3, 10, 30]

    // MARK: - Состояние

    /// Сколько фильтров активно (для бейджа «Фильтры · 3»). Город и текст не считаются.
    public var activeCount: Int {
        var count = 0
        if when != nil || dateRange != nil { count += 1 }
        if !timeOfDay.isEmpty { count += 1 }
        if nearRadiusKm != nil { count += 1 }
        count += categories.count
        if freeOnly || priceMax != nil { count += 1 }
        if childAge != nil || ageRatingMax != nil { count += 1 }
        if pushkin { count += 1 }
        if accessible { count += 1 }
        if hideSoldOut { count += 1 }
        if sort != nil && sort != .relevance { count += 1 }
        return count
    }

    public var isEmpty: Bool { activeCount == 0 && trimmedText.isEmpty }

    public var trimmedText: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    /// Сбросить всё, кроме города.
    public mutating func reset() {
        let city = municipalities
        self = SearchFilters()
        municipalities = city
    }

    public mutating func setWhen(_ preset: WhenPreset?) {
        when = preset
        dateRange = nil
    }

    public mutating func setDateRange(_ range: DateRange?) {
        dateRange = range
        when = nil
    }

    public mutating func setFree(_ free: Bool) {
        freeOnly = free
        if free { priceMax = nil }
    }

    public mutating func setPriceMax(_ value: Int?) {
        priceMax = value
        if value != nil { freeOnly = false }
    }

    public mutating func toggle(_ category: CategoryCode) {
        if categories.contains(category) { categories.remove(category) } else { categories.insert(category) }
    }

    /// Диапазон дат, который реально запросится (для подписей и группировки).
    public func effectiveRange(now: Date = Date()) -> DateRange? {
        dateRange ?? when?.range(now: now)
    }

    // MARK: - Запрос к API

    /// Параметры `/v1/occurrences`. Булевы флаги передаются только когда включены:
    /// сервер приводит строку к boolean (`z.coerce.boolean`), и «false» означало бы `true`.
    public func query(language: AppLanguage, near: Coordinate? = nil, cursor: String? = nil, limit: Int = 20)
        -> Operations.SearchOccurrences.Input.Query {
        let useNear = nearRadiusKm != nil && near != nil
        return Operations.SearchOccurrences.Input.Query(
            q: trimmedText.isEmpty ? nil : String(trimmedText.prefix(300)),
            dateFrom: dateRange?.from.iso,
            dateTo: dateRange?.to.iso,
            when: dateRange == nil ? when.flatMap { Components.Schemas.WhenPreset(rawValue: $0.rawValue) } : nil,
            timeOfDay: timeOfDay.isEmpty ? nil : TimeOfDay.allCases.filter(timeOfDay.contains).compactMap { Components.Schemas.TimeOfDay(rawValue: $0.rawValue) },
            municipality: useNear || municipalities.isEmpty ? nil : municipalities,
            near: useNear ? near?.queryValue : nil,
            radiusKm: useNear ? nearRadiusKm : nil,
            categories: categories.isEmpty ? nil : CategoryCode.allCases.filter(categories.contains),
            tags: tags.isEmpty ? nil : TagCode.allCases.filter(tags.contains),
            free: freeOnly ? true : nil,
            priceMax: freeOnly ? nil : priceMax.map(Double.init),
            age: childAge,
            ageRatingMax: childAge == nil ? ageRatingMax : nil,
            pushkin: pushkin ? true : nil,
            accessible: accessible ? true : nil,
            hideSoldOut: hideSoldOut ? true : nil,
            sort: sort ?? (useNear ? .distance : nil),
            lang: Components.Schemas.Lang(rawValue: language.rawValue),
            limit: limit,
            cursor: cursor
        )
    }

    // MARK: - Диплинки

    /// Параметры для `afisha://search?...` — те же имена, что у API.
    public var queryItems: [URLQueryItem] {
        var items: [URLQueryItem] = []
        if let when { items.append(.init(name: "when", value: when.rawValue)) }
        if let dateRange {
            items.append(.init(name: "date_from", value: dateRange.from.iso))
            items.append(.init(name: "date_to", value: dateRange.to.iso))
        }
        if !timeOfDay.isEmpty { items.append(.init(name: "time_of_day", value: TimeOfDay.allCases.filter(timeOfDay.contains).map(\.rawValue).joined(separator: ","))) }
        if !municipalities.isEmpty { items.append(.init(name: "municipality", value: municipalities.joined(separator: ","))) }
        if let nearRadiusKm { items.append(.init(name: "radius_km", value: String(format: "%g", nearRadiusKm))) }
        if !categories.isEmpty { items.append(.init(name: "categories", value: CategoryCode.allCases.filter(categories.contains).map(\.rawValue).joined(separator: ","))) }
        if !tags.isEmpty { items.append(.init(name: "tags", value: TagCode.allCases.filter(tags.contains).map(\.rawValue).joined(separator: ","))) }
        if freeOnly { items.append(.init(name: "free", value: "true")) }
        if let priceMax { items.append(.init(name: "price_max", value: String(priceMax))) }
        if let childAge { items.append(.init(name: "age", value: String(childAge))) }
        if pushkin { items.append(.init(name: "pushkin", value: "true")) }
        if accessible { items.append(.init(name: "accessible", value: "true")) }
        if !trimmedText.isEmpty { items.append(.init(name: "q", value: trimmedText)) }
        if let sort { items.append(.init(name: "sort", value: sort.rawValue)) }
        return items
    }

    /// Разбор параметров диплинка (неизвестные значения игнорируются).
    public init(query: [String: String]) {
        self.init()
        let list = { (key: String) in (query[key] ?? "").split(separator: ",").map { String($0).trimmingCharacters(in: .whitespaces) } }
        when = query["when"].flatMap(WhenPreset.init(rawValue:))
        if let from = query["date_from"].flatMap(LocalDate.init(iso:)) {
            dateRange = DateRange(from: from, to: query["date_to"].flatMap(LocalDate.init(iso:)) ?? from)
            when = nil
        }
        timeOfDay = Set(list("time_of_day").compactMap(TimeOfDay.init(rawValue:)))
        municipalities = list("municipality").filter { !$0.isEmpty }
        nearRadiusKm = query["radius_km"].flatMap(Double.init)
        categories = Set(list("categories").compactMap(CategoryCode.init(rawValue:)))
        tags = Set(list("tags").compactMap(TagCode.init(rawValue:)))
        freeOnly = query["free"] == "true" || query["free"] == "1"
        priceMax = query["price_max"].flatMap(Int.init)
        childAge = query["age"].flatMap(Int.init).map { $0.clamped(to: 0...17) }
        pushkin = query["pushkin"] == "true" || query["pushkin"] == "1"
        accessible = query["accessible"] == "true" || query["accessible"] == "1"
        text = query["q"] ?? ""
        sort = query["sort"].flatMap(SortMode.init(rawValue:))
    }
}

extension TimeOfDay {
    public func title(_ language: AppLanguage) -> String { Localizer(language: language)("time.\(rawValue)") }
}

extension WhenPreset {
    public func title(_ language: AppLanguage) -> String { Localizer(language: language)("when.\(rawValue)") }
}

extension SortMode {
    public func title(_ language: AppLanguage) -> String { Localizer(language: language)("sort.\(rawValue)") }
}
