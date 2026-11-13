package ru.tamasha.afisha.feature.event

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.data.EventsRepository
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.LoadState
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.VenueDetails
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException

@HiltViewModel
public class VenueViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val events: EventsRepository,
    private val favorites: FavoritesRepository,
) : ViewModel() {
    private val venueId = savedStateHandle.toRoute<VenueRoute>().id

    private val _state = MutableStateFlow<LoadState<VenueDetails>>(LoadState.Loading)
    public val state: StateFlow<LoadState<VenueDetails>> = _state.asStateFlow()

    public val favoriteIds: StateFlow<Set<String>> = favorites.favoriteIds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())

    init {
        load()
    }

    public fun load() {
        _state.value = LoadState.Loading
        viewModelScope.launch {
            _state.value = try {
                LoadState.Ready(events.venue(venueId))
            } catch (e: CancellationException) {
                throw e
            } catch (e: AfishaError) {
                LoadState.Failed(e)
            }
        }
    }

    public fun toggleFavorite(occurrence: Occurrence) {
        viewModelScope.launch { favorites.toggle(occurrence) }
    }
}
