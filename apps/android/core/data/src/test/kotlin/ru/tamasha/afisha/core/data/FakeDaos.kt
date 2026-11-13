package ru.tamasha.afisha.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import ru.tamasha.afisha.core.database.FavoriteEntity
import ru.tamasha.afisha.core.database.FavoritesDao
import ru.tamasha.afisha.core.database.ReminderEntity
import ru.tamasha.afisha.core.database.RemindersDao

internal class FakeFavoritesDao : FavoritesDao {
    val rows = MutableStateFlow<Map<String, FavoriteEntity>>(emptyMap())
    override fun observeAll(): Flow<List<FavoriteEntity>> = rows.map { it.values.sortedBy(FavoriteEntity::startsAtEpochMillis) }
    override fun observeIds(): Flow<List<String>> = rows.map { it.keys.toList() }
    override suspend fun getAll(): List<FavoriteEntity> = rows.value.values.toList()
    override suspend fun get(eventId: String): FavoriteEntity? = rows.value[eventId]
    override suspend fun upsert(entity: FavoriteEntity) { rows.value = rows.value + (entity.eventId to entity) }
    override suspend fun delete(eventId: String) { rows.value = rows.value - eventId }
}

internal class FakeRemindersDao : RemindersDao {
    val rows = MutableStateFlow<Map<String, ReminderEntity>>(emptyMap())
    override fun observeIds(): Flow<List<String>> = rows.map { it.keys.toList() }
    override suspend fun get(occurrenceId: String): ReminderEntity? = rows.value[occurrenceId]
    override suspend fun upsert(entity: ReminderEntity) { rows.value = rows.value + (entity.occurrenceId to entity) }
    override suspend fun delete(occurrenceId: String) { rows.value = rows.value - occurrenceId }
    override suspend fun deleteFired(now: Long) { rows.value = rows.value.filterValues { it.triggerAtMillis >= now } }
}
