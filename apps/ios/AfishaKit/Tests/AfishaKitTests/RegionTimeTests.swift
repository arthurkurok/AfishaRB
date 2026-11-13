@testable import AfishaKit
import Foundation
import Testing

/// Даты в часовом поясе региона (CLAUDE.md, инвариант 2): «сегодня» — уфимское, а не устройства.
@Suite("Время региона Asia/Yekaterinburg")
struct RegionTimeTests {
    @Test("Полночь по UTC — уже следующий день в Уфе")
    func localDateUsesRegionTimeZone() {
        // 2026-11-02 20:30 UTC = 2026-11-03 01:30 в Уфе (UTC+5)
        let instant = ISO8601DateFormatter().date(from: "2026-11-02T20:30:00Z")!
        #expect(LocalDate(instant) == LocalDate(year: 2026, month: 11, day: 3))
        #expect(Region.timeZone.secondsFromGMT(for: instant) == 5 * 3600)
    }

    @Test("Результат не зависит от часового пояса устройства")
    func independentOfDeviceTimeZone() {
        let instant = at("2026-11-07T00:30")
        var moscow = Calendar(identifier: .gregorian)
        moscow.timeZone = TimeZone(identifier: "Europe/Moscow")!
        // В Москве это ещё 6 ноября, а в афише — суббота, 7 ноября
        #expect(moscow.component(.day, from: instant) == 6)
        #expect(LocalDate(instant).day == 7)
        #expect(LocalDate(instant).isoWeekday == 6)
    }

    @Test("Разбор дат API с офсетом +05:00, с долями секунды и в UTC")
    func parsesAPIDates() {
        let plain = APIDate.parse("2026-11-07T11:00:00+05:00")
        let fraction = APIDate.parse("2026-11-07T11:00:00.000+05:00")
        let utc = APIDate.parse("2026-11-07T06:00:00Z")
        #expect(plain != nil)
        #expect(plain == fraction)
        #expect(plain == utc)
        #expect(APIDate.parse(nil) == nil)
        #expect(APIDate.parse("не дата") == nil)
    }

    @Test("ISO-строка и арифметика LocalDate")
    func localDateArithmetic() {
        let date = LocalDate(year: 2026, month: 12, day: 31)
        #expect(date.iso == "2026-12-31")
        #expect(date.adding(days: 1) == LocalDate(iso: "2027-01-01"))
        #expect(LocalDate(iso: "2026-11-02")!.days(until: LocalDate(iso: "2026-11-09")!) == 7)
        #expect(LocalDate(iso: "2026-13-01") == nil)
    }

    @Test("Сегодня и завтра", arguments: [
        ("2026-11-02T00:05", "2026-11-02", "2026-11-03"),
        ("2026-11-02T23:59", "2026-11-02", "2026-11-03"),
        ("2026-12-31T22:00", "2026-12-31", "2027-01-01"),
    ])
    func todayTomorrow(now: String, today: String, tomorrow: String) {
        let instant = at(now)
        #expect(WhenPreset.today.range(now: instant) == DateRange(from: LocalDate(iso: today)!, to: LocalDate(iso: today)!))
        #expect(WhenPreset.tomorrow.range(now: instant).from.iso == tomorrow)
    }

    /// Правило из 03 §1.2 и `weekendRange` бэкенда.
    @Test("Выходные: будни, вечер пятницы, суббота, воскресенье до и после 18:00", arguments: [
        ("2026-11-02T10:00", "2026-11-07", "2026-11-08"), // понедельник
        ("2026-11-06T17:00", "2026-11-07", "2026-11-08"), // пятница днём
        ("2026-11-06T19:00", "2026-11-07", "2026-11-08"), // пятница после 18:00 — ближайшие сб–вс
        ("2026-11-07T12:00", "2026-11-07", "2026-11-08"), // суббота — эти выходные
        ("2026-11-08T12:00", "2026-11-08", "2026-11-08"), // воскресенье днём — только сегодня
        ("2026-11-08T18:30", "2026-11-14", "2026-11-15"), // воскресенье вечером — следующие
    ])
    func weekend(now: String, from: String, to: String) {
        let range = WhenPreset.weekend.range(now: at(now))
        #expect(range.from.iso == from)
        #expect(range.to.iso == to)
    }

    @Test("Неделя и месяц — как resolveWindow на сервере")
    func weekAndMonth() {
        let now = at("2026-11-02T12:00")
        #expect(WhenPreset.week.range(now: now).to.iso == "2026-11-08")
        #expect(WhenPreset.month.range(now: now).to.iso == "2026-12-02")
    }

    @Test("Время суток: утро до 12, день 12–17, вечер с 17")
    func timeOfDay() {
        #expect(TimeOfDay.of(at("2026-11-02T11:59")) == .morning)
        #expect(TimeOfDay.of(at("2026-11-02T12:00")) == .day)
        #expect(TimeOfDay.of(at("2026-11-02T16:59")) == .day)
        #expect(TimeOfDay.of(at("2026-11-02T17:00")) == .evening)
    }
}

@Suite("Форматирование дат ru/ba")
struct DateFormattingTests {
    let now = at("2026-11-02T12:00") // понедельник

    @Test("Заголовки дней ленты")
    func dayHeaders() {
        let ru = EventDateFormatter(language: .ru)
        let ba = EventDateFormatter(language: .ba)
        let today = LocalDate(now)
        #expect(ru.dayHeader(today, now: now) == "Сегодня")
        #expect(ru.dayHeader(today.adding(days: 1), now: now) == "Завтра")
        #expect(ru.dayHeader(LocalDate(iso: "2026-11-07")!, now: now) == "Суббота, 7 ноября")
        #expect(ba.dayHeader(today, now: now) == "Бөгөн")
        #expect(ba.dayHeader(LocalDate(iso: "2026-11-07")!, now: now) == "Шәмбе, 7 ноябрь")
    }

    @Test("Строка сеанса и выставки")
    func sessionLines() {
        let ru = EventDateFormatter(language: .ru)
        #expect(ru.session(start: at("2026-11-02T19:00"), end: nil, isRange: false, now: now) == "сегодня, 19:00")
        #expect(ru.session(start: at("2026-11-07T11:00"), end: nil, isRange: false, now: now) == "сб, 7 ноября, 11:00")
        #expect(ru.session(start: at("2026-10-01T10:00"), end: at("2026-11-30T18:00"), isRange: true, now: now) == "до 30 ноября")
        #expect(ru.session(start: at("2027-01-10T10:00"), end: nil, isRange: false, now: now) == "вс, 10 января 2027, 10:00")
        #expect(EventDateFormatter(language: .ba).session(start: at("2026-11-03T18:30"), end: nil, isRange: false, now: now) == "иртәгә, 18:30")
    }

    @Test("Диапазоны дат")
    func ranges() {
        let ru = EventDateFormatter(language: .ru)
        #expect(ru.range(DateRange(from: LocalDate(iso: "2026-11-07")!, to: LocalDate(iso: "2026-11-08")!)) == "7–8 ноября")
        #expect(ru.range(DateRange(from: LocalDate(iso: "2026-10-31")!, to: LocalDate(iso: "2026-11-01")!)) == "31 октября – 1 ноября")
    }

    @Test("«Проверено N назад» с плюрализацией CLDR")
    func agoPlurals() {
        let ru = EventDateFormatter(language: .ru)
        #expect(ru.verifiedAgo(now.addingTimeInterval(-30), now: now) == "Проверено только что")
        #expect(ru.verifiedAgo(now.addingTimeInterval(-40 * 60), now: now) == "Проверено 40 мин назад")
        #expect(ru.ago(now.addingTimeInterval(-86400), now: now) == "1 день назад")
        #expect(ru.ago(now.addingTimeInterval(-3 * 86400), now: now) == "3 дня назад")
        #expect(ru.ago(now.addingTimeInterval(-11 * 86400), now: now) == "11 дней назад")
        #expect(ru.ago(now.addingTimeInterval(-21 * 86400), now: now) == "21 день назад")
        #expect(EventDateFormatter(language: .ba).verifiedAgo(now.addingTimeInterval(-5 * 60), now: now) == "Тикшерелде: 5 минут элек")
    }

    @Test("Ромб с датой: короткие день недели и месяц")
    func rhombusParts() {
        let date = LocalDate(iso: "2026-11-07")!
        #expect(EventDateFormatter(language: .ru).weekdayShort(date) == "сб")
        #expect(EventDateFormatter(language: .ru).monthShort(date) == "ноя")
        #expect(EventDateFormatter(language: .ba).weekdayShort(date) == "шб")
        #expect(EventDateFormatter(language: .ba).monthShort(LocalDate(iso: "2026-01-07")!) == "ғин")
    }

    @Test("Заглавная первая буква учитывает башкирские буквы")
    func capitalization() {
        #expect("әйтеү".capitalizedFirst == "Әйтеү")
        #expect("ҡурай".capitalizedFirst == "Ҡурай")
    }
}
