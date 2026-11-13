package ru.tamasha.afisha.core.database

import androidx.room.Dao
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
public interface FavoritesDao {
    @Query("SELECT * FROM favorites ORDER BY startsAtEpochMillis ASC")
    public fun observeAll(): Flow<List<FavoriteEntity>>

    @Query("SELECT eventId FROM favorites")
    public fun observeIds(): Flow<List<String>>

    @Query("SELECT * FROM favorites")
    public suspend fun getAll(): List<FavoriteEntity>

    @Query("SELECT * FROM favorites WHERE eventId = :eventId")
    public suspend fun get(eventId: String): FavoriteEntity?

    @Upsert
    public suspend fun upsert(entity: FavoriteEntity)

    @Query("DELETE FROM favorites WHERE eventId = :eventId")
    public suspend fun delete(eventId: String)
}

@Dao
public interface EventCacheDao {
    @Query("SELECT * FROM event_cache WHERE eventId = :eventId AND language = :language")
    public suspend fun get(eventId: String, language: String): EventCacheEntity?

    @Upsert
    public suspend fun upsert(entity: EventCacheEntity)

    /** Чистим старый кэш, но паспорта избранного не трогаем — они нужны офлайн. */
    @Query("DELETE FROM event_cache WHERE savedAtMillis < :olderThan AND eventId NOT IN (SELECT eventId FROM favorites)")
    public suspend fun prune(olderThan: Long)
}

@Dao
public interface FeedCacheDao {
    @Query("SELECT * FROM feed_cache WHERE `key` = :key")
    public suspend fun get(key: String): FeedCacheEntity?

    @Query("SELECT * FROM feed_cache WHERE `key` = :key")
    public fun observe(key: String): Flow<FeedCacheEntity?>

    @Upsert
    public suspend fun upsert(entity: FeedCacheEntity)
}

@Dao
public interface RemindersDao {
    @Query("SELECT occurrenceId FROM reminders")
    public fun observeIds(): Flow<List<String>>

    @Query("SELECT * FROM reminders WHERE occurrenceId = :occurrenceId")
    public suspend fun get(occurrenceId: String): ReminderEntity?

    @Upsert
    public suspend fun upsert(entity: ReminderEntity)

    @Query("DELETE FROM reminders WHERE occurrenceId = :occurrenceId")
    public suspend fun delete(occurrenceId: String)

    @Query("DELETE FROM reminders WHERE triggerAtMillis < :now")
    public suspend fun deleteFired(now: Long)
}
