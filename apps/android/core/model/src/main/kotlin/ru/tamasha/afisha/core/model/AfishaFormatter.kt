package ru.tamasha.afisha.core.model

import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Duration
import java.time.LocalDate
import java.time.ZonedDateTime

/**
 * Форматирование значений (даты, время, цены, возраст, «проверено N мин назад») на ru и ba.
 *
 * Почему не `java.text`/ICU: в ICU Android нет данных для башкирского (`ba`), а даты должны
 * совпадать во всех каналах. Поэтому — собственный словарь (docs/07-design.md §12),
 * сверенный с русскими правилами CLDR. Тексты интерфейса при этом живут в ресурсах.
 *
 * Всё считается в поясе региона через [RegionClock].
 */
public class AfishaFormatter(
    public val language: AppLanguage,
    private val clock: RegionClock,
) {
    private val dict: Dictionary = if (language == AppLanguage.Ba) Ba else Ru

    // ---------- Даты и время ----------

    /** «19:00». */
    public fun time(moment: ZonedDateTime): String = "%02d:%02d".format(moment.hour, moment.minute)

    public fun time(rfc3339: String): String = clock.parse(rfc3339)?.let(::time).orEmpty()

    /** «7 ноября» / «7 ноябрь». */
    public fun dayMonth(date: LocalDate): String = "${date.dayOfMonth}${NBSP}${dict.monthsGenitive[date.monthValue - 1]}"

    /** Короткий месяц для ромба даты: «ноя». */
    public fun monthShort(date: LocalDate): String = dict.monthsShort[date.monthValue - 1]

    public fun weekday(date: LocalDate): String = dict.weekdays[date.dayOfWeek.value - 1]

    public fun weekdayShort(date: LocalDate): String = dict.weekdaysShort[date.dayOfWeek.value - 1]

    /** Заголовок дня в ленте: «Сегодня, 2 ноября», «Завтра, 3 ноября», «Суббота, 7 ноября». */
    public fun dayHeader(date: LocalDate): String = when (clock.relativeDay(date)) {
        RelativeDay.Today -> "${dict.today}, ${dayMonth(date)}"
        RelativeDay.Tomorrow -> "${dict.tomorrow}, ${dayMonth(date)}"
        RelativeDay.Other -> "${weekday(date).capitalizeFirst()}, ${dayMonth(date)}"
    }

    /** Строка сеанса: «Сегодня, 19:00», «Сб, 7 ноября, 11:00». */
    public fun sessionShort(rfc3339: String): String {
        val m = clock.parse(rfc3339) ?: return ""
        val date = m.toLocalDate()
        val day = when (clock.relativeDay(date)) {
            RelativeDay.Today -> dict.today
            RelativeDay.Tomorrow -> dict.tomorrow
            RelativeDay.Other -> "${weekdayShort(date).capitalizeFirst()}, ${dayMonth(date)}"
        }
        return "$day, ${time(m)}"
    }

    /** Полная строка сеанса для паспорта: «Суббота, 7 ноября · 11:00». */
    public fun sessionLong(rfc3339: String): String {
        val m = clock.parse(rfc3339) ?: return ""
        return "${dayHeader(m.toLocalDate())} · ${time(m)}"
    }

    /** Период длительного события (выставки): «до 30 ноября» или «2–30 ноября». */
    public fun range(startsAt: String, endsAt: String?): String {
        val from = clock.localDateOf(startsAt) ?: return ""
        val to = clock.localDateOf(endsAt) ?: return dayMonth(from)
        if (!from.isAfter(clock.today())) return dict.until(dayMonth(to))
        return if (from.month == to.month && from.year == to.year) {
            "${from.dayOfMonth}–${dayMonth(to)}"
        } else {
            "${dayMonth(from)} — ${dayMonth(to)}"
        }
    }

    /** Подпись диапазона дат: «7–8 ноября». */
    public fun dateRange(range: DateRange): String = when {
        range.isSingleDay -> dayMonth(range.from)
        range.from.month == range.to.month -> "${range.from.dayOfMonth}–${dayMonth(range.to)}"
        else -> "${dayMonth(range.from)} — ${dayMonth(range.to)}"
    }

    /** «Проверено 40 мин назад». */
    public fun verifiedAgo(rfc3339: String?): String? {
        val at = clock.parse(rfc3339) ?: return null
        val minutes = Duration.between(at, clock.now()).toMinutes().coerceAtLeast(0)
        return when {
            minutes < 1 -> dict.verifiedJustNow
            minutes < 60 -> dict.verifiedMinutes(minutes)
            minutes < 24 * 60 -> dict.verifiedHours(minutes / 60)
            else -> dict.verifiedOn(dayMonth(at.toLocalDate()))
        }
    }

    // ---------- Цены и возраст ----------

    /** Чип карточки: «Бесплатно», «от 400 ₽», «400 ₽». null — цена неизвестна. */
    public fun priceChip(price: Price): String? {
        if (price.isFree) return dict.free
        val min = price.min ?: return null
        val max = price.max
        if (max != null && max.compareTo(min) == 0) return "${money(min)}$NBSP₽"
        if (min.signum() == 0) return dict.free
        return dict.fromPrice(money(min))
    }

    /** Паспорт события: «400–1 200 ₽», «Бесплатно», «от 400 ₽». */
    public fun priceRange(price: Price): String? {
        if (price.isFree) return dict.free
        val min = price.min
        val max = price.max
        return when {
            min != null && max != null && max.compareTo(min) != 0 -> "${money(min)}–${money(max)}$NBSP₽"
            min != null -> priceChip(price)
            max != null -> dict.upToPrice(money(max))
            else -> null
        }
    }

    /** Возрастной знак: всегда показывается (436-ФЗ). */
    public fun age(rating: Int): String = "$rating+"

    /** «1,2 км». */
    public fun distance(km: Double): String = if (km < 10) {
        BigDecimal(km).setScale(1, RoundingMode.HALF_UP).toPlainString().replace('.', ',') + "${NBSP}км"
    } else {
        "${km.toInt()}${NBSP}км"
    }

    // ---------- Скринридер ----------

    /** Цена словами для TalkBack: «от 400 рублей», «бесплатно». */
    public fun priceSpeech(price: Price): String? {
        if (price.isFree) return dict.free.lowercase()
        val min = price.min ?: return null
        val rub = min.setScale(0, RoundingMode.DOWN).toLong()
        val words = dict.rubles(rub)
        return if (price.max != null && price.max.compareTo(min) == 0) words else dict.fromSpeech(words)
    }

    /**
     * Карточка читается одной фразой (docs/07-design.md §11):
     * «Спектакль „Буратино“, 0+, суббота 8 ноября, 11:00, театр кукол, от 400 рублей, мало билетов».
     * [statusLabel] — уже локализованный текст бейджа (из ресурсов) или null.
     */
    public fun cardSpeech(occurrence: Occurrence, statusLabel: String?): String {
        val parts = mutableListOf<String>()
        parts += occurrence.event.title
        parts += age(occurrence.event.ageRating)
        if (occurrence.isRange) {
            parts += range(occurrence.startsAt, occurrence.endsAt)
        } else {
            clock.parse(occurrence.startsAt)?.let { m ->
                val date = m.toLocalDate()
                val day = when (clock.relativeDay(date)) {
                    RelativeDay.Today -> "${dict.today.lowercase()} ${dayMonth(date)}"
                    RelativeDay.Tomorrow -> "${dict.tomorrow.lowercase()} ${dayMonth(date)}"
                    RelativeDay.Other -> "${weekday(date)} ${dayMonth(date)}"
                }
                parts += day
                parts += time(m)
            }
        }
        occurrence.venue?.name?.let { parts += it }
        priceSpeech(occurrence.event.price)?.let { parts += it }
        statusLabel?.takeIf { it.isNotBlank() }?.let { parts += it.lowercase() }
        return parts.joinToString(", ").replace(NBSP, ' ')
    }

    // ---------- Служебное ----------

    /** 1200 → «1 200», 350.50 → «350,50». */
    public fun money(value: BigDecimal): String {
        val whole = value.setScale(0, RoundingMode.DOWN)
        val fraction = value.subtract(whole).abs()
        val grouped = whole.toPlainString().reversed().chunked(3).joinToString(NBSP.toString()).reversed()
        return if (fraction.signum() == 0) {
            grouped
        } else {
            grouped + "," + fraction.setScale(2, RoundingMode.HALF_UP).toPlainString().substringAfter('.')
        }
    }

    private fun String.capitalizeFirst(): String = replaceFirstChar { it.titlecase() }

    /** Словарь языка: только то, чего нет в ресурсах Android (данные CLDR и склонения). */
    private interface Dictionary {
        val monthsGenitive: List<String>
        val monthsShort: List<String>
        val weekdays: List<String>
        val weekdaysShort: List<String>
        val today: String
        val tomorrow: String
        val free: String
        val verifiedJustNow: String
        fun verifiedMinutes(n: Long): String
        fun verifiedHours(n: Long): String
        fun verifiedOn(date: String): String
        fun fromPrice(amount: String): String
        fun upToPrice(amount: String): String
        fun until(date: String): String
        fun rubles(n: Long): String
        fun fromSpeech(words: String): String
    }

    private object Ru : Dictionary {
        override val monthsGenitive = listOf(
            "января", "февраля", "марта", "апреля", "мая", "июня",
            "июля", "августа", "сентября", "октября", "ноября", "декабря",
        )
        override val monthsShort = listOf("янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")
        override val weekdays = listOf("понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье")
        override val weekdaysShort = listOf("пн", "вт", "ср", "чт", "пт", "сб", "вс")
        override val today = "Сегодня"
        override val tomorrow = "Завтра"
        override val free = "Бесплатно"
        override val verifiedJustNow = "Проверено только что"
        override fun verifiedMinutes(n: Long) = "Проверено $n${NBSP}мин назад"
        override fun verifiedHours(n: Long) = "Проверено $n${NBSP}ч назад"
        override fun verifiedOn(date: String) = "Проверено $date"
        override fun fromPrice(amount: String) = "от $amount$NBSP₽"
        override fun upToPrice(amount: String) = "до $amount$NBSP₽"
        override fun until(date: String) = "до $date"
        override fun rubles(n: Long) = "$n ${plural(n, "рубль", "рубля", "рублей")}"
        override fun fromSpeech(words: String) = "от $words"
    }

    /**
     * Башкирский: месяцы — заимствования без падежного окончания после числа («7 ноябрь»),
     * дни недели — дүшәмбе…йәкшәмбе. Существительное после числа не склоняется по числу.
     */
    private object Ba : Dictionary {
        override val monthsGenitive = listOf(
            "ғинуар", "февраль", "март", "апрель", "май", "июнь",
            "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь",
        )
        override val monthsShort = listOf("ғин", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек")
        override val weekdays = listOf("дүшәмбе", "шишәмбе", "шаршамбы", "кесаҙна", "йома", "шәмбе", "йәкшәмбе")
        override val weekdaysShort = listOf("дш", "шш", "шр", "кс", "йм", "шб", "йш")
        override val today = "Бөгөн"
        override val tomorrow = "Иртәгә"
        override val free = "Бушлай"
        override val verifiedJustNow = "Яңы ғына тикшерелде"
        override fun verifiedMinutes(n: Long) = "$n${NBSP}минут элек тикшерелде"
        override fun verifiedHours(n: Long) = "$n${NBSP}сәғәт элек тикшерелде"
        override fun verifiedOn(date: String) = "$date тикшерелде"
        override fun fromPrice(amount: String) = "$amount$NBSP₽-дан"
        override fun upToPrice(amount: String) = "$amount$NBSP₽-ға тиклем"
        override fun until(date: String) = "$date көнөнә тиклем"
        override fun rubles(n: Long) = "$n һум"
        override fun fromSpeech(words: String) = "${words}дан башлап"
    }

    public companion object {
        /** Неразрывный пробел: «400 ₽» не разрывается при переносе строки. */
        public const val NBSP: Char = ' '

        /** Русская плюрализация по CLDR: one (1, 21…), few (2–4, 22–24…), many (остальное). */
        public fun plural(n: Long, one: String, few: String, many: String): String {
            val mod10 = n % 10
            val mod100 = n % 100
            return when {
                mod10 == 1L && mod100 != 11L -> one
                mod10 in 2..4 && mod100 !in 12..14 -> few
                else -> many
            }
        }
    }
}
