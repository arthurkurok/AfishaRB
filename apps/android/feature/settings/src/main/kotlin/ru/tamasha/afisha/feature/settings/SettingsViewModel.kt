package ru.tamasha.afisha.feature.settings

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.data.EventsRepository
import ru.tamasha.afisha.core.data.SettingsRepository
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.Municipality
import ru.tamasha.afisha.core.model.ThemeMode
import ru.tamasha.afisha.core.model.UserSettings
import javax.inject.Inject

@HiltViewModel
public class SettingsViewModel @Inject constructor(
    private val settings: SettingsRepository,
    private val events: EventsRepository,
) : ViewModel() {

    public val state: StateFlow<UserSettings?> = settings.settings
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    private val _municipalities = MutableStateFlow<List<Municipality>>(emptyList())
    public val municipalities: StateFlow<List<Municipality>> = _municipalities.asStateFlow()

    /**
     * Язык внутри приложения: Android не знает локаль `ba` во многих прошивках, поэтому
     * собственный переключатель (docs/07-design.md §12). AppCompat сохраняет выбор сам
     * и применяет его до Android 13; на 13+ — системный выбор языка приложения.
     */
    public fun setLanguage(language: AppLanguage) {
        viewModelScope.launch {
            settings.setLanguage(language)
            AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(language.tag))
        }
    }

    public fun loadMunicipalities() {
        if (_municipalities.value.isNotEmpty()) return
        viewModelScope.launch { runCatching { events.municipalities() }.onSuccess { _municipalities.value = it } }
    }

    public fun setCity(m: Municipality?) {
        viewModelScope.launch { settings.setCity(m?.id, m?.name) }
    }

    public fun setTheme(mode: ThemeMode) { viewModelScope.launch { settings.setThemeMode(mode) } }
    public fun setLargeText(on: Boolean) { viewModelScope.launch { settings.setLargeText(on) } }
    public fun setSimpleMode(on: Boolean) { viewModelScope.launch { settings.setSimpleMode(on) } }
    public fun setAssistantUsesCity(on: Boolean) { viewModelScope.launch { settings.setAssistantUsesCity(on) } }
    public fun setHideSoldOut(on: Boolean) { viewModelScope.launch { settings.setHideSoldOutByDefault(on) } }
    public fun setFavoriteAlerts(on: Boolean) { viewModelScope.launch { settings.setFavoriteAlerts(on) } }
}
