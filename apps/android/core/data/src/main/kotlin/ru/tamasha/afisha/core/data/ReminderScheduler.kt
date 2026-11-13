package ru.tamasha.afisha.core.data

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import ru.tamasha.afisha.core.database.ReminderEntity
import ru.tamasha.afisha.core.database.RemindersDao
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.RegionClock
import java.time.ZonedDateTime
import javax.inject.Inject
import javax.inject.Singleton

/** Что напомнить и когда (без зависимости :app от схемы БД). */
public data class ScheduledReminder(
    val occurrenceId: String,
    val eventId: String,
    val title: String,
    val startsAt: String,
    val triggerAtMillis: Long,
)

/** Планировщик локальных уведомлений (реализация — WorkManager в :app). */
public interface ReminderScheduler {
    public fun schedule(reminder: ScheduledReminder)
    public fun cancel(occurrenceId: String)
}

/**
 * Напоминания «за день в 18:00» или «за 3 часа» (docs/08-mobile.md §5) — локально,
 * как резерв на случай нестабильного push в РФ.
 */
@Singleton
public class RemindersRepository @Inject constructor(
    private val dao: RemindersDao,
    private val scheduler: ReminderScheduler,
    private val clock: RegionClock,
) {
    public val reminderIds: Flow<Set<String>> = dao.observeIds().map { it.toSet() }

    /** Когда напомнить: накануне в 18:00 по времени региона; если это уже прошло — за 3 часа. */
    public fun triggerTimeFor(startsAt: ZonedDateTime, now: ZonedDateTime = clock.now()): ZonedDateTime? {
        val eveBefore = startsAt.minusDays(1).withHour(EVENING_HOUR).withMinute(0).withSecond(0).withNano(0)
        val threeHours = startsAt.minusHours(3)
        return when {
            eveBefore.isAfter(now) -> eveBefore
            threeHours.isAfter(now) -> threeHours
            else -> null
        }
    }

    /** Возвращает false, если до начала слишком мало времени. */
    public suspend fun toggle(occurrence: Occurrence): Boolean {
        if (dao.get(occurrence.id) != null) {
            dao.delete(occurrence.id)
            scheduler.cancel(occurrence.id)
            return false
        }
        val start = clock.parse(occurrence.startsAt) ?: return false
        val trigger = triggerTimeFor(start) ?: return false
        val entity = ReminderEntity(occurrence.id, occurrence.event.id, occurrence.event.title, occurrence.startsAt, trigger.toInstant().toEpochMilli())
        dao.upsert(entity)
        scheduler.schedule(ScheduledReminder(entity.occurrenceId, entity.eventId, entity.title, entity.startsAt, entity.triggerAtMillis))
        return true
    }

    private companion object {
        const val EVENING_HOUR = 18
    }
}
