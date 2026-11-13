package ru.tamasha.afisha.core.database

import android.content.Context
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config

/** Room на JVM (Robolectric): избранное, кэш паспортов, напоминания. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [36])
class AfishaDatabaseTest {
    private lateinit var db: AfishaDatabase

    @Before
    fun setUp() {
        db = Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext<Context>(), AfishaDatabase::class.java)
            .allowMainThreadQueries()
            .build()
    }

    @After
    fun tearDown() = db.close()

    private fun favorite(id: String, startsAt: Long) =
        FavoriteEntity(id, "o-$id", "Событие $id", "2026-11-07T19:00:00+05:00", startsAt, "{}", "scheduled", 1L, 1L)

    @Test
    fun `избранное сортируется по началу и удаляется`() = runTest {
        val dao = db.favorites()
        dao.upsert(favorite("b", 200))
        dao.upsert(favorite("a", 100))
        assertEquals(listOf("a", "b"), dao.observeAll().first().map { it.eventId })
        dao.delete("a")
        assertEquals(listOf("b"), dao.observeIds().first())
    }

    @Test
    fun `кэш паспортов не удаляет события из избранного`() = runTest {
        db.favorites().upsert(favorite("fav", 1))
        db.eventCache().upsert(EventCacheEntity("fav", "ru", "{}", savedAtMillis = 1))
        db.eventCache().upsert(EventCacheEntity("old", "ru", "{}", savedAtMillis = 1))
        db.eventCache().prune(olderThan = 100)
        assertNotNull(db.eventCache().get("fav", "ru"))
        assertNull(db.eventCache().get("old", "ru"))
    }

    @Test
    fun `сработавшие напоминания чистятся`() = runTest {
        val dao = db.reminders()
        dao.upsert(ReminderEntity("o1", "e1", "A", "2026-11-07T19:00:00+05:00", triggerAtMillis = 10))
        dao.upsert(ReminderEntity("o2", "e2", "B", "2026-11-08T19:00:00+05:00", triggerAtMillis = 1_000))
        dao.deleteFired(now = 100)
        assertEquals(listOf("o2"), dao.observeIds().first())
    }
}
