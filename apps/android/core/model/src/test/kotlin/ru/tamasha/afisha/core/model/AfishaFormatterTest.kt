package ru.tamasha.afisha.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.math.BigDecimal
import java.time.LocalDate

class AfishaFormatterTest {
    private val clock = regionAt("2026-11-02T12:00:00") // понедельник
    private val ru = AfishaFormatter(AppLanguage.Ru, clock)
    private val ba = AfishaFormatter(AppLanguage.Ba, clock)

    /** Неразрывные пробелы в ожиданиях пишем обычными — так тесты читаются. */
    private fun String.plain() = replace(AfishaFormatter.NBSP, ' ')

    private fun price(min: String?, max: String?, free: Boolean = false) =
        Price(min?.let(::BigDecimal), max?.let(::BigDecimal), free)

    @Test
    fun `бесплатное событие`() {
        assertEquals("Бесплатно", ru.priceChip(price("0.00", "0.00", free = true)))
        assertEquals("Бушлай", ba.priceChip(price("0.00", "0.00", free = true)))
    }

    @Test
    fun `цена от минимальной`() {
        assertEquals("от 400 ₽", ru.priceChip(price("400.00", "1200.00"))!!.plain())
        assertEquals("400 ₽-дан", ba.priceChip(price("400.00", "1200.00"))!!.plain())
    }

    @Test
    fun `одна цена без «от»`() {
        assertEquals("350 ₽", ru.priceChip(price("350.00", "350.00"))!!.plain())
    }

    @Test
    fun `разряды и копейки`() {
        assertEquals("1 200", ru.money(BigDecimal("1200.00")).plain())
        assertEquals("12 500", ru.money(BigDecimal("12500")).plain())
        assertEquals("350,50", ru.money(BigDecimal("350.50")))
        assertEquals("от 1 200 ₽", ru.priceChip(price("1200.00", null))!!.plain())
    }

    @Test
    fun `неизвестная цена не выдумывается`() {
        assertNull(ru.priceChip(price(null, null)))
        assertNull(ru.priceRange(price(null, null)))
    }

    @Test
    fun `диапазон цен в паспорте`() {
        assertEquals("400–1 200 ₽", ru.priceRange(price("400.00", "1200.00"))!!.plain())
        assertEquals("до 900 ₽", ru.priceRange(price(null, "900.00"))!!.plain())
    }

    @Test
    fun `возрастной знак`() {
        assertEquals("0+", ru.age(0))
        assertEquals("18+", ba.age(18))
    }

    @Test
    fun `заголовки дней на русском`() {
        assertEquals("Сегодня, 2 ноября", ru.dayHeader(LocalDate.of(2026, 11, 2)).plain())
        assertEquals("Завтра, 3 ноября", ru.dayHeader(LocalDate.of(2026, 11, 3)).plain())
        assertEquals("Суббота, 7 ноября", ru.dayHeader(LocalDate.of(2026, 11, 7)).plain())
    }

    @Test
    fun `заголовки дней на башкирском`() {
        assertEquals("Бөгөн, 2 ноябрь", ba.dayHeader(LocalDate.of(2026, 11, 2)).plain())
        assertEquals("Иртәгә, 3 ноябрь", ba.dayHeader(LocalDate.of(2026, 11, 3)).plain())
        assertEquals("Шәмбе, 7 ноябрь", ba.dayHeader(LocalDate.of(2026, 11, 7)).plain())
        assertEquals("Ғинуар", ba.dayMonth(LocalDate.of(2027, 1, 5)).substringAfter(AfishaFormatter.NBSP).replaceFirstChar { it.uppercase() })
    }

    @Test
    fun `время и сеансы в поясе региона`() {
        assertEquals("19:00", ru.time("2026-11-02T14:00:00Z"))
        assertEquals("Сегодня, 19:00", ru.sessionShort("2026-11-02T19:00:00+05:00"))
        assertEquals("Сб, 7 ноября, 11:00", ru.sessionShort("2026-11-07T11:00:00+05:00").plain())
        assertEquals("Суббота, 7 ноября · 11:00", ru.sessionLong("2026-11-07T11:00:00+05:00").plain())
    }

    @Test
    fun `период выставки`() {
        assertEquals("до 30 ноября", ru.range("2026-10-01T10:00:00+05:00", "2026-11-30T18:00:00+05:00").plain())
        assertEquals("30 ноябрь көнөнә тиклем", ba.range("2026-10-01T10:00:00+05:00", "2026-11-30T18:00:00+05:00").plain())
        assertEquals("10–30 ноября", ru.range("2026-11-10T10:00:00+05:00", "2026-11-30T18:00:00+05:00").plain())
        assertEquals("10 ноября — 5 декабря", ru.range("2026-11-10T10:00:00+05:00", "2026-12-05T18:00:00+05:00").plain())
    }

    @Test
    fun `проверено N минут назад`() {
        assertEquals("Проверено 40 мин назад", ru.verifiedAgo("2026-11-02T11:20:00+05:00")!!.plain())
        assertEquals("Проверено 3 ч назад", ru.verifiedAgo("2026-11-02T09:00:00+05:00")!!.plain())
        assertEquals("40 минут элек тикшерелде", ba.verifiedAgo("2026-11-02T11:20:00+05:00")!!.plain())
        assertEquals("Проверено 30 октября", ru.verifiedAgo("2026-10-30T09:00:00+05:00")!!.plain())
    }

    @Test
    fun `расстояние`() {
        assertEquals("1,2 км", ru.distance(1.23).plain())
        assertEquals("15 км", ru.distance(15.4).plain())
    }

    @Test
    fun `русская плюрализация`() {
        assertEquals("рубль", AfishaFormatter.plural(21, "рубль", "рубля", "рублей"))
        assertEquals("рубля", AfishaFormatter.plural(3, "рубль", "рубля", "рублей"))
        assertEquals("рублей", AfishaFormatter.plural(11, "рубль", "рубля", "рублей"))
        assertEquals("рублей", AfishaFormatter.plural(400, "рубль", "рубля", "рублей"))
    }

    @Test
    fun `карточка читается одной фразой`() {
        val occurrence = sampleOccurrence()
        assertEquals(
            "Спектакль «Буратино», 0+, суббота 7 ноября, 11:00, Театр кукол, от 400 рублей, мало билетов",
            ru.cardSpeech(occurrence, "Мало билетов"),
        )
        assertEquals(
            "Спектакль «Буратино», 0+, шәмбе 7 ноябрь, 11:00, Театр кукол, 400 һумдан башлап",
            ba.cardSpeech(occurrence, null),
        )
    }

    private fun sampleOccurrence() = Occurrence(
        id = "o1",
        event = EventSummary(
            id = "e1",
            title = "Спектакль «Буратино»",
            summary = "",
            categories = listOf(Category.Theatre, Category.Kids),
            tags = emptySet(),
            ageRating = 0,
            pushkinCard = false,
            price = price("400.00", "800.00"),
            image = null,
            organization = null,
        ),
        venue = Venue("v1", "Театр кукол", null, null, "ufa", "Уфа"),
        startsAt = "2026-11-07T11:00:00+05:00",
        endsAt = null,
        isRange = false,
        status = OccurrenceStatus.Scheduled,
        statusReason = null,
        previousStartsAt = null,
        availability = Availability.FewLeft,
        ticketUrl = null,
        moreDates = 0,
        distanceKm = null,
        reasons = emptyList(),
        freshness = Freshness.Fresh,
    )
}
