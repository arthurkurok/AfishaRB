import Foundation

/// Всё, что нужно карточке события для отображения, — вычислено заранее и протестировано.
/// Одинаково используется в ленте, подборках Гида, виджете и избранном.
public struct CardPresentation: Hashable, Sendable {
    public let id: String
    public let eventID: String
    public let title: String
    /// «8»
    public let day: String
    /// «ноя»
    public let monthShort: String
    /// «сб»
    public let weekdayShort: String
    /// «11:00» или `nil` для выставок
    public let time: String?
    /// «сегодня, 19:00» / «до 30 ноября»
    public let sessionLine: String
    /// «Театр кукол · Уфа»
    public let venueLine: String?
    /// «от 400 ₽» / «Бесплатно»
    public let priceChip: String?
    /// «0+»
    public let ageLabel: String
    public let pushkin: Bool
    public let badge: StatusBadge?
    public let categoryCode: String
    public let imageURL: URL?
    /// Цвет-заглушка постера из API («888581»)
    public let imageColor: String?
    /// «ещё 5 дат»
    public let moreDates: String?
    /// «2,4 км»
    public let distance: String?
    /// Фраза для VoiceOver: вся карточка одной фразой (07 §11).
    public let accessibilityLabel: String

    public init(card: OccurrenceCard, language: AppLanguage, now: Date = Date()) {
        let loc = Localizer(language: language)
        let dates = EventDateFormatter(language: language)
        let prices = PriceFormatter(language: language)
        let start = card.startDate ?? now
        let startDay = LocalDate(start)
        // Длительное событие, уже идущее, показываем на сегодня
        let displayDay = card.isRange && startDay < LocalDate(now) ? LocalDate(now) : startDay

        id = card.id
        eventID = card.event.id
        title = card.event.title
        day = String(displayDay.day)
        monthShort = dates.monthShort(displayDay)
        weekdayShort = dates.weekdayShort(displayDay)
        time = card.isRange ? nil : dates.time(start)
        sessionLine = dates.session(start: start, end: card.endDate, isRange: card.isRange, now: now)
        let venueParts = [card.venue?.name, card.venue?.municipality].compactMap { $0 }.filter { !$0.isEmpty }
        venueLine = venueParts.isEmpty ? nil : venueParts.joined(separator: " · ")
        let price = card.event.priceInfo
        priceChip = prices.chip(price)
        ageLabel = card.event.ageRatingValue.label
        pushkin = card.event.pushkinCard
        badge = card.badge
        categoryCode = card.event.primaryCategory.rawValue
        imageURL = card.event.imageURL
        imageColor = card.event.image?.color
        moreDates = card.moreDates > 0 ? loc("card.more_dates", card.moreDates) : nil
        distance = card.distanceKm.map { CardPresentation.distance($0, language: language) }

        // «Спектакль „Буратино“, 0+, суббота 8 ноября, 11:00, театр кукол, от 400 рублей, мало билетов»
        var phrase: [String] = [card.event.title, ageLabel]
        if card.isRange, let end = card.endDate {
            phrase.append(loc("date.until", dates.dayMonth(LocalDate(end))))
        } else {
            let dayText: String = switch LocalDate(now).days(until: displayDay) {
            case 0: loc("date.today.lower")
            case 1: loc("date.tomorrow.lower")
            default: "\(CalendarNames.weekday(displayDay.isoWeekday, language)) \(dates.dayMonth(displayDay))"
            }
            phrase.append(dayText)
            phrase.append(dates.time(start))
        }
        if let venue = card.venue?.name { phrase.append(venue) }
        if let spoken = prices.spoken(price) { phrase.append(spoken) }
        if pushkin { phrase.append(loc("card.pushkin.spoken")) }
        if let badge { phrase.append(badge.spoken(language)) }
        accessibilityLabel = phrase.joined(separator: ", ")
    }

    /// «850 м», «2,4 км», «35 км».
    public static func distance(_ km: Double, language: AppLanguage) -> String {
        let loc = Localizer(language: language)
        if km < 1 { return loc("distance.m", Int((km * 1000 / 10).rounded() * 10)) }
        if km < 10 {
            let formatted = String(format: "%.1f", km).replacingOccurrences(of: ".", with: ",")
            return loc("distance.km", formatted)
        }
        return loc("distance.km", String(Int(km.rounded())))
    }
}
