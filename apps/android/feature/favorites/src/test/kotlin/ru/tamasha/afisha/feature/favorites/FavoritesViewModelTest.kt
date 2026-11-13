package ru.tamasha.afisha.feature.favorites

import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.data.TimeSource
import ru.tamasha.afisha.core.database.FavoriteEntity
import ru.tamasha.afisha.core.database.FavoritesDao
import ru.tamasha.afisha.core.model.Availability
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.EventSummary
import ru.tamasha.afisha.core.model.Freshness
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.OccurrenceStatus
import ru.tamasha.afisha.core.model.Price
import ru.tamasha.afisha.core.model.RegionClock
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

@OptIn(ExperimentalCoroutinesApi::class)
class FavoritesViewModelTest {

    private class Dao : FavoritesDao {
        val rows = MutableStateFlow<Map<String, FavoriteEntity>>(emptyMap())
        override fun observeAll(): Flow<List<FavoriteEntity>> = rows.map { it.values.sortedBy(FavoriteEntity::startsAtEpochMillis) }
        override fun observeIds(): Flow<List<String>> = rows.map { it.keys.toList() }
        override suspend fun getAll() = rows.value.values.toList()
        override suspend fun get(eventId: String) = rows.value[eventId]
        override suspend fun upsert(entity: FavoriteEntity) { rows.value = rows.value + (entity.eventId to entity) }
        override suspend fun delete(eventId: String) { rows.value = rows.value - eventId }
    }

    // 2 ноября 2026, 12:00 по Уфе
    private val clock = RegionClock(clock = Clock.fixed(Instant.parse("2026-11-02T07:00:00Z"), ZoneOffset.UTC))
    private val repo = FavoritesRepository(Dao(), clock, TimeSource { 0L })

    private fun occ(eventId: String, startsAt: String, isRange: Boolean = false, endsAt: String? = null) = Occurrence(
        id = "o-$eventId",
        event = EventSummary(eventId, "Событие $eventId", "", listOf(Category.Museum), emptySet(), 0, false, Price(null, null, true), null, null),
        venue = null, startsAt = startsAt, endsAt = endsAt, isRange = isRange, status = OccurrenceStatus.Scheduled,
        statusReason = null, previousStartsAt = null, availability = Availability.Unknown, ticketUrl = null,
        moreDates = 0, distanceKm = null, reasons = emptyList(), freshness = Freshness.Fresh,
    )

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `прошедшие отделены от предстоящих, выставка в процессе — впереди`() = runTest {
        repo.add(occ("past", "2026-10-30T19:00:00+05:00"))
        repo.add(occ("soon", "2026-11-07T19:00:00+05:00"))
        repo.add(occ("expo", "2026-10-01T10:00:00+05:00", isRange = true, endsAt = "2026-12-31T18:00:00+05:00"))
        val vm = FavoritesViewModel(repo, clock)
        val job = launch { vm.state.collect { } }
        val state = vm.state.first { !it.loading }
        assertEquals(setOf("soon", "expo"), state.upcoming.map { it.occurrence.event.id }.toSet())
        assertEquals(listOf("past"), state.past.map { it.occurrence.event.id })
        job.cancel()
    }

    @Test
    fun `удаление и «Вернуть»`() = runTest {
        val o = occ("soon", "2026-11-07T19:00:00+05:00")
        repo.add(o)
        val vm = FavoritesViewModel(repo, clock)
        vm.remove(o)
        assertTrue(!repo.isFavorite("soon"))
        vm.restore(o)
        assertTrue(repo.isFavorite("soon"))
    }
}
