package ru.tamasha.afisha.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.TimeZone

/** Даты считаются в Asia/Yekaterinburg, а не в поясе устройства или сервера (инвариант 2). */
class RegionClockTest {

    @Test
    fun `тесты запускаются в чужом поясе, чтобы поймать зависимость от устройства`() {
        assertEquals("America/Los_Angeles", TimeZone.getDefault().id)
    }

    @Test
    fun `сегодня считается в поясе региона, а не UTC`() {
        // 20:30 UTC 1 ноября — в Уфе уже 01:30 2 ноября
        val clock = RegionClock(clock = Clock.fixed(Instant.parse("2026-11-01T20:30:00Z"), ZoneOffset.UTC))
        assertEquals(LocalDate.of(2026, 11, 2), clock.today())
    }

    @Test
    fun `время из API с офсетом региона не сдвигается`() {
        val clock = regionAt("2026-11-02T12:00:00")
        val m = clock.parse("2026-11-07T11:00:00+05:00")!!
        assertEquals(11, m.hour)
        assertEquals(LocalDate.of(2026, 11, 7), m.toLocalDate())
    }

    @Test
    fun `время в UTC переводится в местное`() {
        val m = regionAt("2026-11-02T12:00:00").parse("2026-11-07T06:00:00Z")!!
        assertEquals(11, m.hour)
    }

    @Test
    fun `битая дата не роняет разбор`() {
        assertNull(regionAt("2026-11-02T12:00:00").parse("завтра"))
        assertNull(regionAt("2026-11-02T12:00:00").parse(null))
    }

    @Test
    fun `в будни выходные — ближайшие суббота и воскресенье`() {
        // понедельник 2 ноября 2026
        val r = regionAt("2026-11-02T10:00:00").weekendRange()
        assertEquals(DateRange(LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 8)), r)
    }

    @Test
    fun `в пятницу вечером выходные — эти суббота и воскресенье`() {
        val r = regionAt("2026-11-06T19:30:00").weekendRange()
        assertEquals(DateRange(LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 8)), r)
    }

    @Test
    fun `в субботу выходные начинаются сегодня`() {
        val r = regionAt("2026-11-07T09:00:00").weekendRange()
        assertEquals(DateRange(LocalDate.of(2026, 11, 7), LocalDate.of(2026, 11, 8)), r)
    }

    @Test
    fun `в воскресенье днём выходные — только сегодня`() {
        val r = regionAt("2026-11-08T17:59:00").weekendRange()
        assertEquals(DateRange(LocalDate.of(2026, 11, 8), LocalDate.of(2026, 11, 8)), r)
    }

    @Test
    fun `в воскресенье после 18 часов выходные — следующие`() {
        val r = regionAt("2026-11-08T18:00:00").weekendRange()
        assertEquals(DateRange(LocalDate.of(2026, 11, 14), LocalDate.of(2026, 11, 15)), r)
    }

    @Test
    fun `пресеты периода`() {
        val c = regionAt("2026-11-02T23:30:00")
        assertEquals(DateRange(LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 2)), c.rangeFor(WhenPreset.Today))
        assertEquals(DateRange(LocalDate.of(2026, 11, 3), LocalDate.of(2026, 11, 3)), c.rangeFor(WhenPreset.Tomorrow))
        assertEquals(DateRange(LocalDate.of(2026, 11, 2), LocalDate.of(2026, 11, 8)), c.rangeFor(WhenPreset.Week))
    }

    @Test
    fun `относительные дни`() {
        val c = regionAt("2026-11-02T23:59:00")
        assertEquals(RelativeDay.Today, c.relativeDay(LocalDate.of(2026, 11, 2)))
        assertEquals(RelativeDay.Tomorrow, c.relativeDay(LocalDate.of(2026, 11, 3)))
        assertEquals(RelativeDay.Other, c.relativeDay(LocalDate.of(2026, 11, 4)))
    }

    @Test
    fun `сеанс прошёл по времени окончания`() {
        val c = regionAt("2026-11-02T20:00:00")
        assertTrue(c.isPast("2026-11-02T10:00:00+05:00", "2026-11-02T19:00:00+05:00"))
        assertFalse(c.isPast("2026-11-02T10:00:00+05:00", "2026-11-02T21:00:00+05:00"))
        assertFalse(c.isPast("2026-11-02T21:00:00+05:00", null))
    }

    @Test
    fun `возрастной знак для ребёнка как на сервере`() {
        assertEquals(0, RegionClock.maxRatingForChild(5))
        assertEquals(6, RegionClock.maxRatingForChild(6))
        assertEquals(6, RegionClock.maxRatingForChild(11))
        assertEquals(12, RegionClock.maxRatingForChild(13))
        assertEquals(16, RegionClock.maxRatingForChild(17))
    }
}
