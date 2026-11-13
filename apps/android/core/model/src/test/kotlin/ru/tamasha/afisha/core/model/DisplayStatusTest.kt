package ru.tamasha.afisha.core.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DisplayStatusTest {

    @Test
    fun `по плану без бейджа`() {
        assertEquals(DisplayStatus.None, displayStatusOf(OccurrenceStatus.Scheduled, Availability.Unknown))
        assertEquals(DisplayStatus.None, displayStatusOf(OccurrenceStatus.Scheduled, Availability.Available))
    }

    @Test
    fun `мало билетов — только если источник сообщает`() {
        assertEquals(DisplayStatus.FewLeft, displayStatusOf(OccurrenceStatus.Scheduled, Availability.FewLeft))
    }

    @Test
    fun `распродано по статусу или по наличию`() {
        assertEquals(DisplayStatus.SoldOut, displayStatusOf(OccurrenceStatus.SoldOut, Availability.Unknown))
        assertEquals(DisplayStatus.SoldOut, displayStatusOf(OccurrenceStatus.Scheduled, Availability.SoldOut))
    }

    @Test
    fun `отмена важнее всего`() {
        assertEquals(DisplayStatus.Cancelled, displayStatusOf(OccurrenceStatus.Cancelled, Availability.FewLeft, isPast = true))
    }

    @Test
    fun `перенос, отложено, уточняется, прошло`() {
        assertEquals(DisplayStatus.Rescheduled, displayStatusOf(OccurrenceStatus.Rescheduled, Availability.Unknown))
        assertEquals(DisplayStatus.Postponed, displayStatusOf(OccurrenceStatus.Postponed, Availability.Unknown))
        assertEquals(DisplayStatus.Unverified, displayStatusOf(OccurrenceStatus.Unverified, Availability.Unknown))
        assertEquals(DisplayStatus.Ended, displayStatusOf(OccurrenceStatus.Ended, Availability.Unknown))
        assertEquals(DisplayStatus.Ended, displayStatusOf(OccurrenceStatus.Scheduled, Availability.FewLeft, isPast = true))
    }

    @Test
    fun `у каждого статуса с бейджем есть форма — не только цвет`() {
        DisplayStatus.entries.filter { it != DisplayStatus.None }.forEach {
            assertTrue("$it без формы", it.shape != BadgeShape.None)
        }
    }

    @Test
    fun `билеты не предлагаются для отменённых и прошедших`() {
        assertTrue(DisplayStatus.Cancelled.blocksTickets)
        assertTrue(DisplayStatus.Ended.blocksTickets)
        assertTrue(DisplayStatus.SoldOut.blocksTickets)
        assertFalse(DisplayStatus.FewLeft.blocksTickets)
        assertFalse(DisplayStatus.Rescheduled.blocksTickets)
    }

    @Test
    fun `неизвестный статус из будущего API — «уточняется», а не «по плану»`() {
        assertEquals(OccurrenceStatus.Unverified, OccurrenceStatus.fromCode("teleported"))
    }
}
