import Foundation

/// Цена события в рублях. Суммы в API приходят строками («500.00») — без потерь точности.
public struct PriceInfo: Hashable, Sendable {
    public let min: Decimal?
    public let max: Decimal?
    public let isFree: Bool

    public init(min: Decimal?, max: Decimal?, isFree: Bool) {
        self.min = min
        self.max = max
        self.isFree = isFree
    }

    public init(minString: String?, maxString: String?, isFree: Bool) {
        self.init(min: PriceInfo.decimal(minString), max: PriceInfo.decimal(maxString), isFree: isFree)
    }

    static func decimal(_ string: String?) -> Decimal? {
        guard let string, !string.isEmpty else { return nil }
        return Decimal(string: string, locale: Locale(identifier: "en_US_POSIX"))
    }

    /// Бесплатно — флаг источника или нулевая максимальная цена.
    public var isEffectivelyFree: Bool {
        if isFree { return true }
        if let max, max == 0, min == nil || min == 0 { return true }
        return false
    }

    /// Минимальная платная цена (для фильтра «до N ₽»).
    public var lowest: Decimal? { min ?? max }
}

/// Форматирование цен: «Бесплатно», «от 400 ₽», «400 ₽», «400–1 500 ₽».
public struct PriceFormatter: Sendable {
    public let language: AppLanguage
    let loc: Localizer

    public init(language: AppLanguage) {
        self.language = language
        self.loc = Localizer(language: language)
    }

    /// Сумма без копеек, если они нулевые: «1 500», «350,50». Разделитель разрядов — неразрывный пробел.
    public func amount(_ value: Decimal) -> String {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = "\u{00A0}"
        formatter.usesGroupingSeparator = true
        let isWhole = value == value.rounded(scale: 0)
        formatter.minimumFractionDigits = isWhole ? 0 : 2
        formatter.maximumFractionDigits = isWhole ? 0 : 2
        // До 10 000 разряды не разделяем — как в типографике афиш («1500 ₽» читается легче)
        if value < 10_000 { formatter.usesGroupingSeparator = false }
        return formatter.string(from: value as NSDecimalNumber) ?? "\(value)"
    }

    /// Текст чипа цены на карточке. `nil` — если цена неизвестна (чип не показываем).
    public func chip(_ price: PriceInfo) -> String? {
        if price.isEffectivelyFree { return loc("price.free") }
        switch (price.min, price.max) {
        case let (min?, max?) where min == max:
            return loc("price.exact", amount(min))
        case let (min?, _):
            return loc("price.from", amount(min))
        case let (nil, max?):
            return loc("price.exact", amount(max))
        default:
            return nil
        }
    }

    /// Полный текст цены в паспорте: «400–1 500 ₽».
    public func full(_ price: PriceInfo) -> String? {
        if price.isEffectivelyFree { return loc("price.free") }
        switch (price.min, price.max) {
        case let (min?, max?) where min != max:
            return loc("price.range", amount(min), amount(max))
        default:
            return chip(price)
        }
    }

    /// Фраза для VoiceOver: «от 400 рублей», «бесплатно».
    public func spoken(_ price: PriceInfo) -> String? {
        if price.isEffectivelyFree { return loc("price.free.spoken") }
        guard let lowest = price.min ?? price.max else { return nil }
        let rubles = NSDecimalNumber(decimal: lowest.rounded(scale: 0)).intValue
        if let min = price.min, let max = price.max, min == max {
            return loc("price.exact.spoken", rubles)
        }
        return loc("price.from.spoken", rubles)
    }

    /// Чип фильтра «до 1000 ₽».
    public func upTo(_ value: Int) -> String { loc("price.upto", amount(Decimal(value))) }
}

extension Decimal {
    func rounded(scale: Int) -> Decimal {
        var source = self
        var result = Decimal()
        NSDecimalRound(&result, &source, scale, .plain)
        return result
    }
}

/// Возрастной знак по 436-ФЗ: 0+, 6+, 12+, 16+, 18+.
public struct AgeRating: Hashable, Sendable, Comparable {
    public let value: Int

    public init(_ value: Int) { self.value = value }

    public static let allowed = [0, 6, 12, 16, 18]

    /// «0+» — всегда показывается на карточке (обязательный элемент паспорта, 03 §1.5).
    public var label: String { "\(value)+" }

    /// Максимальный допустимый знак для ребёнка данного возраста — та же функция, что
    /// `maxRatingForChild` на сервере.
    public static func maxRating(forChildAge age: Int) -> AgeRating {
        switch age {
        case 16...: AgeRating(16)
        case 12...: AgeRating(12)
        case 6...: AgeRating(6)
        default: AgeRating(0)
        }
    }

    /// Подходит ли событие ребёнку данного возраста.
    public func fits(childAge age: Int) -> Bool { self <= AgeRating.maxRating(forChildAge: age) }

    public static func < (lhs: AgeRating, rhs: AgeRating) -> Bool { lhs.value < rhs.value }
}
