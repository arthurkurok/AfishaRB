package ru.tamasha.afisha.feature.favorites

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.data.FavoriteItem
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.RegionClock
import javax.inject.Inject

public data class FavoritesUiState(
    val loading: Boolean = true,
    val upcoming: List<FavoriteItem> = emptyList(),
    val past: List<FavoriteItem> = emptyList(),
) {
    val isEmpty: Boolean get() = !loading && upcoming.isEmpty() && past.isEmpty()
}

/** Избранное из Room — работает офлайн. Прошедшие уходят вниз, но не удаляются сами. */
@HiltViewModel
public class FavoritesViewModel @Inject constructor(
    private val favorites: FavoritesRepository,
    private val clock: RegionClock,
) : ViewModel() {

    public val state: StateFlow<FavoritesUiState> = favorites.favorites
        .map { list ->
            val (past, upcoming) = list.partition { item ->
                val o = item.occurrence
                if (o.isRange) clock.isPast(o.endsAt ?: o.startsAt, null) else clock.isPast(o.startsAt, o.endsAt)
            }
            FavoritesUiState(loading = false, upcoming = upcoming, past = past.sortedByDescending { it.occurrence.startsAt })
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), FavoritesUiState())

    public fun remove(occurrence: Occurrence) {
        viewModelScope.launch { favorites.remove(occurrence.event.id) }
    }

    public fun restore(occurrence: Occurrence) {
        viewModelScope.launch { favorites.add(occurrence) }
    }
}
