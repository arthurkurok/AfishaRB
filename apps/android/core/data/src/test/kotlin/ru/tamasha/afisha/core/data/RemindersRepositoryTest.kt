package ru.tamasha.afisha.core.data

import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test


class RemindersRepositoryTest {
    private val clock = clockAt("2026-11-02T12:00:00")
    private val scheduled = mutableListOf<ScheduledReminder>()
    private val cancelled = mutableListOf<String>()
    private val scheduler = object : ReminderScheduler {
        override fun schedule(reminder: ScheduledReminder) { scheduled += reminder }
        override fun cancel(occurrenceId: String) { cancelled += occurrenceId }
    }
    private val repo = RemindersRepository(FakeRemindersDao(), scheduler, clock)

    @Test
    fun `напоминание накануне в 18 00 по времени региона`() {
        val start = clock.parse("2026-11-07T11:00:00+05:00")!!
        val t = repo.triggerTimeFor(start)!!
        assertEquals("2026-11-06T18:00+05:00", t.toOffsetDateTime().toString())
    }

    @Test
    fun `если вечер накануне прошёл — за 3 часа`() {
        val start = clock.parse("2026-11-02T19:00:00+05:00")!!
        assertEquals(16, repo.triggerTimeFor(start)!!.hour)
    }

    @Test
    fun `слишком поздно — не напоминаем`() {
        assertNull(repo.triggerTimeFor(clock.parse("2026-11-02T13:00:00+05:00")!!))
    }

    @Test
    fun `переключение планирует и отменяет задачу`() = runTest {
        val s = session("o1", "2026-11-07T11:00:00+05:00")
        assertTrue(repo.toggle(s))
        assertEquals("o1", scheduled.single().occurrenceId)
        assertFalse(repo.toggle(s))
        assertEquals(listOf("o1"), cancelled)
    }
}
