import Foundation

/// Названия месяцев и дней недели. Данные совпадают с CLDR (ru, ba), но хранятся в коде:
/// в урезанных данных ICU на iOS локали `ba` может не быть, а афиша обязана показывать
/// одинаковые даты в приложении, виджете и тестах (docs/07-design.md §12).
enum CalendarNames {
    /// Месяцы в родительном падеже («8 ноября») — для ru; для ba форма совпадает с именительной.
    static func monthInDate(_ month: Int, _ language: AppLanguage) -> String {
        let names: [String] = switch language {
        case .ru: ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"]
        case .ba: ["ғинуар", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"]
        }
        return names[(month - 1).clamped(to: 0...11)]
    }

    /// Короткое название месяца для ромба с датой («НОЯ»).
    static func monthShort(_ month: Int, _ language: AppLanguage) -> String {
        let names: [String] = switch language {
        case .ru: ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
        case .ba: ["ғин", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
        }
        return names[(month - 1).clamped(to: 0...11)]
    }

    /// День недели, ISO-номер 1…7 (понедельник…воскресенье), со строчной буквы.
    static func weekday(_ isoWeekday: Int, _ language: AppLanguage) -> String {
        let names: [String] = switch language {
        case .ru: ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
        case .ba: ["дүшәмбе", "шишәмбе", "шаршамбы", "кесаҙна", "йома", "шәмбе", "йәкшәмбе"]
        }
        return names[(isoWeekday - 1).clamped(to: 0...6)]
    }

    static func weekdayShort(_ isoWeekday: Int, _ language: AppLanguage) -> String {
        let names: [String] = switch language {
        case .ru: ["пн", "вт", "ср", "чт", "пт", "сб", "вс"]
        case .ba: ["дш", "шш", "шр", "кс", "йм", "шб", "йш"]
        }
        return names[(isoWeekday - 1).clamped(to: 0...6)]
    }
}

extension Comparable {
    func clamped(to range: ClosedRange<Self>) -> Self { min(max(self, range.lowerBound), range.upperBound) }
}

extension String {
    /// Первая буква заглавная (учитывает башкирские буквы: «әйтеү» → «Әйтеү»).
    public var capitalizedFirst: String {
        guard let first else { return self }
        return String(first).uppercased(with: Locale(identifier: "ru_RU")) + dropFirst()
    }
}

/// Форматирование дат афиши. Все вычисления — в TZ региона.
public struct EventDateFormatter: Sendable {
    public let language: AppLanguage
    let loc: Localizer

    public init(language: AppLanguage) {
        self.language = language
        self.loc = Localizer(language: language)
    }

    /// «11:00»
    public func time(_ date: Date) -> String {
        let parts = Region.calendar.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", parts.hour ?? 0, parts.minute ?? 0)
    }

    /// «8 ноября» / «8 ноябрь»
    public func dayMonth(_ date: LocalDate) -> String {
        "\(date.day) \(CalendarNames.monthInDate(date.month, language))"
    }

    /// «8 ноября 2027» — год только если не текущий.
    public func dayMonthYear(_ date: LocalDate, now: Date = Date()) -> String {
        date.year == LocalDate(now).year ? dayMonth(date) : "\(dayMonth(date)) \(date.year)"
    }

    /// «Суббота, 8 ноября»
    public func weekdayDayMonth(_ date: LocalDate) -> String {
        "\(CalendarNames.weekday(date.isoWeekday, language).capitalizedFirst), \(dayMonth(date))"
    }

    /// «сб» — для ромба с датой.
    public func weekdayShort(_ date: LocalDate) -> String { CalendarNames.weekdayShort(date.isoWeekday, language) }

    /// «НОЯ» — для ромба с датой.
    public func monthShort(_ date: LocalDate) -> String { CalendarNames.monthShort(date.month, language) }

    /// Заголовок дня в ленте: «Сегодня», «Завтра», «Суббота, 8 ноября».
    public func dayHeader(_ date: LocalDate, now: Date = Date()) -> String {
        let today = LocalDate(now)
        switch today.days(until: date) {
        case 0: return loc("date.today")
        case 1: return loc("date.tomorrow")
        default: return weekdayDayMonth(date)
        }
    }

    /// Относительная дата для карточки: «сегодня», «завтра», «сб, 8 ноября».
    public func relativeDay(_ date: LocalDate, now: Date = Date()) -> String {
        let today = LocalDate(now)
        switch today.days(until: date) {
        case 0: return loc("date.today.lower")
        case 1: return loc("date.tomorrow.lower")
        default: return "\(weekdayShort(date)), \(dayMonthYear(date, now: now))"
        }
    }

    /// Строка сеанса: «сегодня, 19:00», «сб, 8 ноября, 11:00»; для выставок — «до 30 ноября».
    public func session(start: Date, end: Date?, isRange: Bool, now: Date = Date()) -> String {
        if isRange, let end {
            let endDay = LocalDate(end)
            let startDay = LocalDate(start)
            if startDay <= LocalDate(now) {
                return loc("date.until", dayMonthYear(endDay, now: now))
            }
            return "\(dayMonthYear(startDay, now: now)) – \(dayMonthYear(endDay, now: now))"
        }
        return "\(relativeDay(LocalDate(start), now: now)), \(time(start))"
    }

    /// Диапазон для подписи периода: «8–9 ноября», «31 октября – 1 ноября», «8 ноября».
    public func range(_ range: DateRange) -> String {
        if range.from == range.to { return dayMonth(range.from) }
        if range.from.month == range.to.month, range.from.year == range.to.year, language == .ru {
            return "\(range.from.day)–\(range.to.day) \(CalendarNames.monthInDate(range.to.month, language))"
        }
        return "\(dayMonth(range.from)) – \(dayMonth(range.to))"
    }

    /// «40 мин назад», «только что», «2 дня назад».
    public func ago(_ date: Date, now: Date = Date()) -> String {
        let minutes = max(0, Int(now.timeIntervalSince(date) / 60))
        if minutes < 1 { return loc("ago.now") }
        if minutes < 60 { return loc("ago.minutes", minutes) }
        let hours = minutes / 60
        if hours < 24 { return loc("ago.hours", hours) }
        return loc("ago.days", hours / 24)
    }

    /// «Проверено 40 мин назад» — для блока «Паспорт».
    public func verifiedAgo(_ date: Date, now: Date = Date()) -> String {
        loc("passport.verified", ago(date, now: now))
    }
}
