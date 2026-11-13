package ru.tamasha.afisha.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.workDataOf
import dagger.hilt.android.qualifiers.ApplicationContext
import ru.tamasha.afisha.core.data.ReminderScheduler
import ru.tamasha.afisha.core.data.ScheduledReminder
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/** Расписание фоновых задач. */
@Singleton
class WorkScheduler @Inject constructor(@ApplicationContext private val context: Context) {
    fun schedulePeriodic() {
        val wm = WorkManager.getInstance(context)
        val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
        wm.enqueueUniquePeriodicWork(
            "favorites-sync",
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<FavoritesSyncWorker>(6, TimeUnit.HOURS).setConstraints(online).build(),
        )
        wm.enqueueUniquePeriodicWork(
            "widget-refresh",
            ExistingPeriodicWorkPolicy.KEEP,
            PeriodicWorkRequestBuilder<WidgetRefreshWorker>(2, TimeUnit.HOURS).setConstraints(online).build(),
        )
    }

    fun refreshWidgetNow() {
        WorkManager.getInstance(context).enqueueUniqueWork(
            "widget-refresh-now",
            ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<WidgetRefreshWorker>().build(),
        )
    }
}

/** Напоминания через WorkManager: переживают перезагрузку, не требуют точных будильников. */
@Singleton
class WorkManagerReminderScheduler @Inject constructor(@ApplicationContext private val context: Context) : ReminderScheduler {
    override fun schedule(reminder: ScheduledReminder) {
        val delay = (reminder.triggerAtMillis - System.currentTimeMillis()).coerceAtLeast(0)
        val request = OneTimeWorkRequestBuilder<ReminderWorker>()
            .setInitialDelay(delay, TimeUnit.MILLISECONDS)
            .setInputData(
                workDataOf(
                    ReminderWorker.KEY_EVENT_ID to reminder.eventId,
                    ReminderWorker.KEY_OCCURRENCE_ID to reminder.occurrenceId,
                    ReminderWorker.KEY_TITLE to reminder.title,
                    ReminderWorker.KEY_STARTS_AT to reminder.startsAt,
                ),
            )
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(name(reminder.occurrenceId), ExistingWorkPolicy.REPLACE, request)
    }

    override fun cancel(occurrenceId: String) {
        WorkManager.getInstance(context).cancelUniqueWork(name(occurrenceId))
    }

    private fun name(occurrenceId: String) = "reminder-$occurrenceId"
}
