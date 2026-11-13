package ru.tamasha.afisha.work

import android.content.Context
import androidx.glance.appwidget.updateAll
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import ru.tamasha.afisha.R
import ru.tamasha.afisha.core.data.EventsRepository
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.data.SettingsRepository
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.AfishaFormatter
import ru.tamasha.afisha.core.model.OccurrenceStatus
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.widget.TodayWidget

/**
 * Обновляет избранное (паспорта в офлайн-кэш) и сообщает об отмене/переносе.
 * Работает по расписанию WorkManager и только при наличии сети.
 */
@HiltWorker
class FavoritesSyncWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val events: EventsRepository,
    private val favorites: FavoritesRepository,
    private val settings: SettingsRepository,
    private val clock: RegionClock,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val s = settings.current()
        val formatter = AfishaFormatter(s.language, clock)
        var failed = false
        for (id in favorites.allEventIds()) {
            try {
                val change = events.syncFavorite(id) ?: continue
                if (!s.favoriteAlerts) continue
                val o = change.occurrence
                val title = when (o.status) {
                    OccurrenceStatus.Cancelled -> applicationContext.getString(R.string.notify_cancelled, o.event.title)
                    OccurrenceStatus.Rescheduled -> applicationContext.getString(R.string.notify_rescheduled, o.event.title)
                    OccurrenceStatus.Postponed -> applicationContext.getString(R.string.notify_postponed, o.event.title)
                    OccurrenceStatus.SoldOut -> applicationContext.getString(R.string.notify_sold_out, o.event.title)
                    else -> applicationContext.getString(R.string.notify_status_changed, o.event.title)
                }
                val text = listOfNotNull(
                    applicationContext.getString(R.string.notify_new_time, formatter.sessionLong(o.startsAt)).takeIf { o.status == OccurrenceStatus.Rescheduled },
                    o.statusReason,
                    o.venue?.name,
                ).joinToString(" · ").replace(' ', ' ')
                Notifications.show(applicationContext, Notifications.CHANNEL_CHANGES, id.hashCode(), title, text, "afisha://event/$id")
            } catch (_: AfishaError.NotFound) {
                // Событие удалено из афиши — снимок в избранном остаётся, человек увидит последнее известное
            } catch (_: AfishaError) {
                failed = true
            }
        }
        events.pruneCache()
        return if (failed) Result.retry() else Result.success()
    }
}

/** Локальное напоминание о сеансе. */
@HiltWorker
class ReminderWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val settings: SettingsRepository,
    private val clock: RegionClock,
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val s = settings.current()
        if (!s.favoriteAlerts) return Result.success()
        val eventId = inputData.getString(KEY_EVENT_ID) ?: return Result.failure()
        val title = inputData.getString(KEY_TITLE).orEmpty()
        val startsAt = inputData.getString(KEY_STARTS_AT).orEmpty()
        val formatter = AfishaFormatter(s.language, clock)
        Notifications.show(
            applicationContext,
            Notifications.CHANNEL_REMINDERS,
            (inputData.getString(KEY_OCCURRENCE_ID) ?: eventId).hashCode(),
            applicationContext.getString(R.string.notify_reminder_title, title),
            applicationContext.getString(R.string.notify_reminder_text, formatter.sessionLong(startsAt)).replace(' ', ' '),
            "afisha://event/$eventId",
        )
        return Result.success()
    }

    companion object {
        const val KEY_EVENT_ID = "event_id"
        const val KEY_OCCURRENCE_ID = "occurrence_id"
        const val KEY_TITLE = "title"
        const val KEY_STARTS_AT = "starts_at"
    }
}

/** Обновление виджета «Сегодня рядом». */
@HiltWorker
class WidgetRefreshWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        TodayWidget().updateAll(applicationContext)
        return Result.success()
    }
}
