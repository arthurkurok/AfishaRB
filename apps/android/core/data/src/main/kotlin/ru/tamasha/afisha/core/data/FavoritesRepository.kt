package ru.tamasha.afisha.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import ru.tamasha.afisha.core.database.FavoriteEntity
import ru.tamasha.afisha.core.database.FavoritesDao
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.OccurrenceStatus
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.network.AfishaJson
import javax.inject.Inject
import javax.inject.Singleton

/** Карточка в избранном: снимок сеанса и когда его сохранили. */
public data class FavoriteItem(val occurrence: Occurrence, val addedAtMillis: Long, val syncedAtMillis: Long)

/** Изменение статуса сеанса из избранного, замеченное при синхронизации. */
public data class StatusChange(val occurrence: Occurrence, val previous: OccurrenceStatus)

/** Избранное: офлайн, локально на устройстве. */
@Singleton
public class FavoritesRepository @Inject constructor(
    private val dao: FavoritesDao,
    private val regionClock: RegionClock,
    private val time: TimeSource,
) {
    public val favorites: Flow<List<FavoriteItem>> = dao.observeAll().map { list -> list.mapNotNull { it.toItem() } }

    public val favoriteIds: Flow<Set<String>> = dao.observeIds().map { it.toSet() }

    public suspend fun isFavorite(eventId: String): Boolean = dao.get(eventId) != null

    public suspend fun add(occurrence: Occurrence) {
        val now = time.nowMillis()
        dao.upsert(occurrence.toEntity(addedAt = dao.get(occurrence.event.id)?.addedAtMillis ?: now, syncedAt = now))
    }

    public suspend fun remove(eventId: String): Unit = dao.delete(eventId)

    /** Возвращает новое состояние: true — добавлено. */
    public suspend fun toggle(occurrence: Occurrence): Boolean =
        if (isFavorite(occurrence.event.id)) {
            remove(occurrence.event.id)
            false
        } else {
            add(occurrence)
            true
        }

    /**
     * Обновляет снимок избранного по свежему паспорту: ближайший актуальный сеанс
     * (или тот же, если он отменён/перенесён — человек должен это увидеть).
     * Возвращает изменение статуса, если оно было.
     */
    public suspend fun refreshSnapshot(details: EventDetails): StatusChange? {
        val existing = dao.get(details.summary.id) ?: return null
        val previous = OccurrenceStatus.fromCode(existing.statusCode)
        val sameSession = details.occurrences.firstOrNull { it.id == existing.occurrenceId }
        val upcoming = details.occurrences
            .filter { !regionClock.isPast(it.startsAt, it.endsAt) || it.isRange }
            .minByOrNull { regionClock.parse(it.startsAt)?.toEpochSecond() ?: Long.MAX_VALUE }
        val fresh = when {
            sameSession != null && sameSession.status != OccurrenceStatus.Scheduled -> sameSession
            sameSession != null && !regionClock.isPast(sameSession.startsAt, sameSession.endsAt) -> sameSession
            upcoming != null -> upcoming
            else -> sameSession ?: return null
        }
        dao.upsert(fresh.toEntity(addedAt = existing.addedAtMillis, syncedAt = time.nowMillis()))
        return if (fresh.id == existing.occurrenceId && fresh.status != previous) StatusChange(fresh, previous) else null
    }

    public suspend fun allEventIds(): List<String> = dao.getAll().map { it.eventId }

    private fun Occurrence.toEntity(addedAt: Long, syncedAt: Long) = FavoriteEntity(
        eventId = event.id,
        occurrenceId = id,
        title = event.title,
        startsAt = startsAt,
        startsAtEpochMillis = regionClock.parse(startsAt)?.toInstant()?.toEpochMilli() ?: Long.MAX_VALUE,
        snapshotJson = AfishaJson.encodeToString(Occurrence.serializer(), this),
        statusCode = status.code,
        addedAtMillis = addedAt,
        syncedAtMillis = syncedAt,
    )

    private fun FavoriteEntity.toItem(): FavoriteItem? = runCatching {
        FavoriteItem(AfishaJson.decodeFromString(Occurrence.serializer(), snapshotJson), addedAtMillis, syncedAtMillis)
    }.getOrNull()
}
