package ru.tamasha.afisha

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.data.NetworkMonitor
import ru.tamasha.afisha.core.data.SettingsRepository
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.UserSettings
import javax.inject.Inject

/** Состояние оболочки: настройки темы/языка/режима и сеть. */
@HiltViewModel
class MainViewModel @Inject constructor(
    private val settingsRepository: SettingsRepository,
    networkMonitor: NetworkMonitor,
) : ViewModel() {

    val settings: StateFlow<UserSettings?> = settingsRepository.settings
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val isOnline: StateFlow<Boolean> = networkMonitor.isOnline
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), true)

    /**
     * Сверяем язык: если пользователь сменил его в системных настройках приложения (Android 13+),
     * запоминаем выбор; если язык приложения ещё не задан — применяем сохранённый.
     */
    fun reconcileLanguage() {
        viewModelScope.launch {
            val appLocales = AppCompatDelegate.getApplicationLocales()
            val stored = settingsRepository.current().language
            if (!appLocales.isEmpty) {
                val fromSystem = AppLanguage.fromTag(appLocales[0]?.language)
                if (fromSystem != stored) settingsRepository.setLanguage(fromSystem)
            } else if (stored != AppLanguage.Ru) {
                AppCompatDelegate.setApplicationLocales(LocaleListCompat.forLanguageTags(stored.tag))
            }
        }
    }
}
