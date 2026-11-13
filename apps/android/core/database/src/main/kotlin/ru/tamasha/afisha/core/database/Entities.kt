package ru.tamasha.afisha.core.database

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Избранное хранится локально и привязано к устройству (вход не нужен, docs/08-mobile.md §6).
 * [snapshotJson] — полный снимок карточки ([ru.tamasha.afisha.core.model.Occurrence]),
 * чтобы избранное открывалось без сети.
 */
@Entity(tableName = "favorites", indices = [Index("startsAtEpochMillis")])
public data class FavoriteEntity(
    @PrimaryKey val eventId: String,
    val occurrenceId: String,
    val title: String,
    val startsAt: String,
    val startsAtEpochMillis: Long,
    val snapshotJson: String,
    /** Последний известный статус (код API) — чтобы заметить отмену/перенос при синхронизации. */
    val statusCode: String,
    val addedAtMillis: Long,
    val syncedAtMillis: Long,
)

/** Офлайн-кэш паспорта события. */
@Entity(tableName = "event_cache")
public data class EventCacheEntity(
    @PrimaryKey val eventId: String,
    val language: String,
    val json: String,
    val savedAtMillis: Long,
)

/** Офлайн-кэш лент (главная «Сегодня/Завтра/Выходные», виджет). Ключ — запрос. */
@Entity(tableName = "feed_cache")
public data class FeedCacheEntity(
    @PrimaryKey val key: String,
    val json: String,
    val savedAtMillis: Long,
)

/** Локальное напоминание о сеансе (резерв на случай недоступного push). */
@Entity(tableName = "reminders")
public data class ReminderEntity(
    @PrimaryKey val occurrenceId: String,
    val eventId: String,
    val title: String,
    val startsAt: String,
    val triggerAtMillis: Long,
)
