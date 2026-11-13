package ru.tamasha.afisha.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import ru.tamasha.afisha.BuildConfig
import ru.tamasha.afisha.core.data.ApiConfig
import ru.tamasha.afisha.core.data.ReminderScheduler
import ru.tamasha.afisha.work.WorkManagerReminderScheduler

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    /** Base URL — из BuildConfig (-Pafisha.apiBaseUrl), по умолчанию хост с эмулятора. */
    @Provides
    fun apiConfig(): ApiConfig = ApiConfig(
        baseUrl = BuildConfig.API_BASE_URL,
        userAgent = "Tamasha-Android/${BuildConfig.VERSION_NAME}",
        debugLogging = BuildConfig.DEBUG,
    )
}

@Module
@InstallIn(SingletonComponent::class)
abstract class AppBindings {
    @Binds
    abstract fun reminderScheduler(impl: WorkManagerReminderScheduler): ReminderScheduler
}
