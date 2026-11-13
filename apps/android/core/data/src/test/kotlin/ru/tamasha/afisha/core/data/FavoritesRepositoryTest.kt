package ru.tamasha.afisha.core.data

import app.cash.turbine.test
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.tamasha.afisha.core.model.OccurrenceStatus

class FavoritesRepositoryTest {
    private val dao = FakeFavoritesDao()
    private val repo = FavoritesRepository(dao, clockAt("2026-11-02T12:00:00"), TimeSource { 1_000L })

    @Test
    fun `избранное переключается и хранит снимок для офлайна`() = runTest {
        val s = session("o1", "2026-11-07T19:00:00+05:00")
        assertTrue(repo.toggle(s))
        repo.favorites.test {
            val item = awaitItem().single()
            assertEquals("Концерт", item.occurrence.event.title)
            assertEquals("2026-11-07T19:00:00+05:00", item.occurrence.startsAt)
            cancelAndIgnoreRemainingEvents()
        }
        assertFalse(repo.toggle(s))
        assertTrue(dao.rows.value.isEmpty())
    }

    @Test
    fun `синхронизация замечает отмену сохранённого сеанса`() = runTest {
        repo.add(session("o1", "2026-11-07T19:00:00+05:00"))
        val change = repo.refreshSnapshot(details(session("o1", "2026-11-07T19:00:00+05:00", OccurrenceStatus.Cancelled)))
        assertEquals(OccurrenceStatus.Scheduled, change!!.previous)
        assertEquals(OccurrenceStatus.Cancelled, change.occurrence.status)
        assertEquals("cancelled", dao.rows.value.getValue("e1").statusCode)
    }

    @Test
    fun `прошедший сеанс в избранном заменяется ближайшим будущим без уведомления`() = runTest {
        repo.add(session("old", "2026-10-01T19:00:00+05:00"))
        val change = repo.refreshSnapshot(details(session("old", "2026-10-01T19:00:00+05:00"), session("new", "2026-11-20T19:00:00+05:00")))
        assertNull(change)
        assertEquals("new", dao.rows.value.getValue("e1").occurrenceId)
    }

    @Test
    fun `чужое событие не попадает в избранное при синхронизации`() = runTest {
        assertNull(repo.refreshSnapshot(details(session("o1", "2026-11-07T19:00:00+05:00"))))
        assertTrue(dao.rows.value.isEmpty())
    }
}
