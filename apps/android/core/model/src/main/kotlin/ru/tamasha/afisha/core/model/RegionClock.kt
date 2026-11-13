package ru.tamasha.afisha.core.model

import java.time.Clock
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeParseException

/** Диапазон дат включительно (в календаре региона). */
public data class DateRange(val from: LocalDate, val to: LocalDate) {
    init {
        require(!to.isBefore(from)) { "Конец диапазона $to раньше начала $from" }
    }

    val isSingleDay: Boolean get() = from == to
}

/** Быстрые периоды выдачи — совпадают с `when` в API. */
public enum class WhenPreset(public val code: String) {
    Today("today"),
    Tomorrow("tomorrow"),
    Weekend("weekend"),
    Week("week"),
    Month("month"),
}

/** Относительный день для заголовков «Сегодня», «Завтра». */
public enum class RelativeDay { Today, Tomorrow, Other }

/**
 * Время региона. «Сегодня», «в субботу», «вечером» считаются в часовом поясе региона
 * (Asia/Yekaterinburg, UTC+5), а не в поясе телефона (CLAUDE.md, инвариант 2):
 * турист из Москвы видит «сегодня» Уфы. Часы внедряются — правила проверяются тестами.
 */
public class RegionClock(
    public val zone: ZoneId = DEFAULT_ZONE,
    private val clock: Clock = Clock.systemUTC(),
) {
    public fun now(): ZonedDateTime = ZonedDateTime.now(clock).withZoneSameInstant(zone)

    public fun today(): LocalDate = now().toLocalDate()

    /** RFC 3339 из API → момент в поясе региона. null, если строка битая (не роняем экран). */
    public fun parse(rfc3339: String?): ZonedDateTime? {
        if (rfc3339.isNullOrBlank()) return null
        return try {
            OffsetDateTime.parse(rfc3339).atZoneSameInstant(zone)
        } catch (_: DateTimeParseException) {
            null
        }
    }

    public fun localDateOf(rfc3339: String?): LocalDate? = parse(rfc3339)?.toLocalDate()

    public fun relativeDay(date: LocalDate): RelativeDay {
        val today = today()
        return when (date) {
            today -> RelativeDay.Today
            today.plusDays(1) -> RelativeDay.Tomorrow
            else -> RelativeDay.Other
        }
    }

    /**
     * Ближайшие выходные (как на сервере, apps/api search/dates.ts):
     * пн–пт — ближайшие сб–вс; суббота — эти сб–вс; воскресенье до 18:00 — только сегодня,
     * после 18:00 — следующие сб–вс.
     */
    public fun weekendRange(): DateRange {
        val now = now()
        val today = now.toLocalDate()
        return when (today.dayOfWeek) {
            DayOfWeek.SATURDAY -> DateRange(today, today.plusDays(1))
            DayOfWeek.SUNDAY ->
                if (now.hour >= EVENING_HOUR) DateRange(today.plusDays(6), today.plusDays(7)) else DateRange(today, today)
            else -> {
                val toSaturday = DayOfWeek.SATURDAY.value - today.dayOfWeek.value
                DateRange(today.plusDays(toSaturday.toLong()), today.plusDays(toSaturday.toLong() + 1))
            }
        }
    }

    public fun rangeFor(preset: WhenPreset): DateRange {
        val today = today()
        return when (preset) {
            WhenPreset.Today -> DateRange(today, today)
            WhenPreset.Tomorrow -> DateRange(today.plusDays(1), today.plusDays(1))
            WhenPreset.Weekend -> weekendRange()
            WhenPreset.Week -> DateRange(today, today.plusDays(6))
            WhenPreset.Month -> DateRange(today, today.plusDays(30))
        }
    }

    /** Прошёл ли сеанс: конец (или начало, если конца нет) раньше «сейчас». */
    public fun isPast(startsAt: String, endsAt: String?): Boolean {
        val end = parse(endsAt) ?: parse(startsAt) ?: return false
        return end.isBefore(now())
    }

    public companion object {
        public val DEFAULT_ZONE: ZoneId = ZoneId.of("Asia/Yekaterinburg")
        private const val EVENING_HOUR = 18

        /** Максимальный возрастной знак для ребёнка данного возраста (436-ФЗ), как на сервере. */
        public fun maxRatingForChild(age: Int): Int = when {
            age >= 16 -> 16
            age >= 12 -> 12
            age >= 6 -> 6
            else -> 0
        }
    }
}
