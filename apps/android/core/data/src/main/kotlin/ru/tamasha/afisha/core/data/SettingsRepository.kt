package ru.tamasha.afisha.core.data

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.ThemeMode
import ru.tamasha.afisha.core.model.UserSettings
import javax.inject.Inject
import javax.inject.Singleton

private val Context.settingsStore: DataStore<Preferences> by preferencesDataStore(name = "settings")

/** Настройки пользователя в DataStore. Персональные данные не собираются — только выбор в интерфейсе. */
@Singleton
public class SettingsRepository @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val store = context.settingsStore

    public val settings: Flow<UserSettings> = store.data.map { p ->
        val defaults = UserSettings()
        UserSettings(
            language = AppLanguage.fromTag(p[LANGUAGE]),
            municipalityId = if (p.contains(CITY_ID)) p[CITY_ID]?.takeIf { it.isNotEmpty() } else defaults.municipalityId,
            municipalityName = if (p.contains(CITY_NAME)) p[CITY_NAME]?.takeIf { it.isNotEmpty() } else defaults.municipalityName,
            themeMode = p[THEME]?.let { runCatching { ThemeMode.valueOf(it) }.getOrNull() } ?: defaults.themeMode,
            largeText = p[LARGE_TEXT] ?: defaults.largeText,
            simpleMode = p[SIMPLE_MODE] ?: defaults.simpleMode,
            assistantUsesCity = p[ASSISTANT_CITY] ?: defaults.assistantUsesCity,
            hideSoldOutByDefault = p[HIDE_SOLD_OUT] ?: defaults.hideSoldOutByDefault,
            favoriteAlerts = p[FAVORITE_ALERTS] ?: defaults.favoriteAlerts,
            onboardingDone = p[ONBOARDING_DONE] ?: defaults.onboardingDone,
        )
    }.distinctUntilChanged()

    public suspend fun current(): UserSettings = settings.first()

    public suspend fun setLanguage(language: AppLanguage): Unit = edit { it[LANGUAGE] = language.tag }

    /** null — «вся республика». */
    public suspend fun setCity(id: String?, name: String?): Unit = edit {
        it[CITY_ID] = id.orEmpty()
        it[CITY_NAME] = name.orEmpty()
    }

    public suspend fun setThemeMode(mode: ThemeMode): Unit = edit { it[THEME] = mode.name }
    public suspend fun setLargeText(value: Boolean): Unit = edit { it[LARGE_TEXT] = value }
    public suspend fun setSimpleMode(value: Boolean): Unit = edit { it[SIMPLE_MODE] = value }
    public suspend fun setAssistantUsesCity(value: Boolean): Unit = edit { it[ASSISTANT_CITY] = value }
    public suspend fun setHideSoldOutByDefault(value: Boolean): Unit = edit { it[HIDE_SOLD_OUT] = value }
    public suspend fun setFavoriteAlerts(value: Boolean): Unit = edit { it[FAVORITE_ALERTS] = value }
    public suspend fun setOnboardingDone(): Unit = edit { it[ONBOARDING_DONE] = true }

    private suspend fun edit(block: (androidx.datastore.preferences.core.MutablePreferences) -> Unit) {
        store.edit { block(it) }
    }

    private companion object {
        val LANGUAGE = stringPreferencesKey("language")
        val CITY_ID = stringPreferencesKey("city_id")
        val CITY_NAME = stringPreferencesKey("city_name")
        val THEME = stringPreferencesKey("theme")
        val LARGE_TEXT = booleanPreferencesKey("large_text")
        val SIMPLE_MODE = booleanPreferencesKey("simple_mode")
        val ASSISTANT_CITY = booleanPreferencesKey("assistant_city")
        val HIDE_SOLD_OUT = booleanPreferencesKey("hide_sold_out")
        val FAVORITE_ALERTS = booleanPreferencesKey("favorite_alerts")
        val ONBOARDING_DONE = booleanPreferencesKey("onboarding_done")
    }
}
