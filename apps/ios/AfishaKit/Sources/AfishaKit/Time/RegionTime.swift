import Foundation

/// Часовой пояс и календарь региона.
///
/// Инвариант продукта (CLAUDE.md, п. 2): «сегодня», «в субботу», «вечером» вычисляются
/// в часовом поясе региона, а не устройства. Пользователь из Москвы, открывший афишу Уфы,
/// видит «сегодня» уфимским днём.
public enum Region {
    /// Идентификатор часового пояса Башкортостана (UTC+5).
    public static let timeZoneIdentifier = "Asia/Yekaterinburg"

    public static let timeZone: TimeZone = TimeZone(identifier: timeZoneIdentifier) ?? TimeZone(secondsFromGMT: 5 * 3600)!

    /// Григорианский календарь региона: неделя начинается с понедельника.
    public static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timeZone
        calendar.firstWeekday = 2
        calendar.locale = Locale(identifier: "ru_RU")
        return calendar
    }()
}

/// Календарная дата в TZ региона без времени (аналог `LocalDate` бэкенда, формат YYYY-MM-DD).
public struct LocalDate: Hashable, Comparable, Sendable, Codable, CustomStringConvertible {
    public let year: Int
    public let month: Int
    public let day: Int

    public init(year: Int, month: Int, day: Int) {
        self.year = year
        self.month = month
        self.day = day
    }

    /// Дата момента `instant` в часовом поясе региона.
    public init(_ instant: Date) {
        let parts = Region.calendar.dateComponents([.year, .month, .day], from: instant)
        self.init(year: parts.year ?? 1970, month: parts.month ?? 1, day: parts.day ?? 1)
    }

    /// Разбор строки YYYY-MM-DD.
    public init?(iso string: String) {
        let parts = string.split(separator: "-")
        guard parts.count == 3,
              let y = Int(parts[0]), let m = Int(parts[1]), let d = Int(parts[2]),
              (1...12).contains(m), (1...31).contains(d) else { return nil }
        self.init(year: y, month: m, day: d)
    }

    /// YYYY-MM-DD — формат параметров date_from/date_to API.
    public var iso: String { String(format: "%04d-%02d-%02d", year, month, day) }
    public var description: String { iso }

    /// Полночь этого дня в TZ региона.
    public var startOfDay: Date {
        Region.calendar.date(from: DateComponents(timeZone: Region.timeZone, year: year, month: month, day: day)) ?? .distantPast
    }

    /// День недели по ISO: понедельник — 1, воскресенье — 7.
    public var isoWeekday: Int {
        let weekday = Region.calendar.component(.weekday, from: startOfDay) // 1 = воскресенье
        return weekday == 1 ? 7 : weekday - 1
    }

    public var isWeekend: Bool { isoWeekday >= 6 }

    public func adding(days: Int) -> LocalDate {
        LocalDate(Region.calendar.date(byAdding: .day, value: days, to: startOfDay) ?? startOfDay)
    }

    /// Разница в днях: `other - self`.
    public func days(until other: LocalDate) -> Int {
        Region.calendar.dateComponents([.day], from: startOfDay, to: other.startOfDay).day ?? 0
    }

    public static func < (lhs: LocalDate, rhs: LocalDate) -> Bool {
        (lhs.year, lhs.month, lhs.day) < (rhs.year, rhs.month, rhs.day)
    }

    public static func today(now: Date = Date()) -> LocalDate { LocalDate(now) }
}

/// Диапазон дат включительно.
public struct DateRange: Hashable, Sendable, Codable {
    public let from: LocalDate
    public let to: LocalDate

    public init(from: LocalDate, to: LocalDate) {
        self.from = from
        self.to = max(from, to)
    }

    public func contains(_ date: LocalDate) -> Bool { date >= from && date <= to }
}

/// Быстрые периоды поиска. Совпадают с параметром `when` API.
public enum WhenPreset: String, CaseIterable, Sendable, Codable, Identifiable {
    case today, tomorrow, weekend, week, month

    public var id: String { rawValue }

    /// Диапазон дат периода в TZ региона — та же логика, что `resolveWindow` на сервере
    /// (`apps/api/src/modules/search/dates.ts`): клиент и сервер обязаны совпадать.
    public func range(now: Date = Date()) -> DateRange {
        let today = LocalDate(now)
        switch self {
        case .today: return DateRange(from: today, to: today)
        case .tomorrow:
            let tomorrow = today.adding(days: 1)
            return DateRange(from: tomorrow, to: tomorrow)
        case .weekend: return WhenPreset.weekendRange(now: now)
        case .week: return DateRange(from: today, to: today.adding(days: 6))
        case .month: return DateRange(from: today, to: today.adding(days: 30))
        }
    }

    /// Ближайшие выходные: в субботу — эти; в воскресенье до 18:00 — только сегодня,
    /// после 18:00 — следующие; в будни (включая вечер пятницы) — ближайшие сб–вс.
    public static func weekendRange(now: Date = Date()) -> DateRange {
        let today = LocalDate(now)
        let hour = Region.calendar.component(.hour, from: now)
        switch today.isoWeekday {
        case 6:
            return DateRange(from: today, to: today.adding(days: 1))
        case 7:
            return hour >= 18
                ? DateRange(from: today.adding(days: 6), to: today.adding(days: 7))
                : DateRange(from: today, to: today)
        default:
            let weekday = today.isoWeekday
            return DateRange(from: today.adding(days: 6 - weekday), to: today.adding(days: 7 - weekday))
        }
    }
}

/// Время суток в смысле фильтра API.
public enum TimeOfDay: String, CaseIterable, Sendable, Codable, Identifiable {
    case morning, day, evening
    public var id: String { rawValue }

    /// Границы, как на сервере: утро до 12:00, день 12–17, вечер с 17:00.
    public static func of(_ instant: Date) -> TimeOfDay {
        let hour = Region.calendar.component(.hour, from: instant)
        switch hour {
        case ..<12: return .morning
        case 12..<17: return .day
        default: return .evening
        }
    }
}

/// Разбор дат RFC 3339 из API («2026-11-07T11:00:00+05:00»).
public enum APIDate {
    private static let withFraction: Date.ISO8601FormatStyle = .iso8601
        .year().month().day()
        .dateTimeSeparator(.standard)
        .time(includingFractionalSeconds: true)
        .timeZone(separator: .colon)

    private static let plain: Date.ISO8601FormatStyle = .iso8601
        .year().month().day()
        .dateTimeSeparator(.standard)
        .time(includingFractionalSeconds: false)
        .timeZone(separator: .colon)

    public static func parse(_ string: String?) -> Date? {
        guard let string, !string.isEmpty else { return nil }
        if let date = try? plain.parse(string) { return date }
        if let date = try? withFraction.parse(string) { return date }
        // Запасной путь: ISO8601DateFormatter понимает «Z» и офсеты без двоеточия
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: string) { return date }
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: string)
    }

    /// Строка RFC 3339 в TZ региона — для отладки и запросов.
    public static func format(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.timeZone = Region.timeZone
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.string(from: date)
    }
}
