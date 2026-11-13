package ru.tamasha.afisha.feature.search

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.Job
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.drop
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.data.EventsRepository
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.data.LocationProvider
import ru.tamasha.afisha.core.data.SettingsRepository
import ru.tamasha.afisha.core.data.toNearParam
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.Municipality
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.SortOrder
import ru.tamasha.afisha.core.network.AfishaJson
import java.time.LocalDate
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException

/** Секция выдачи «по дням» с липким заголовком. */
public data class DaySection(val date: LocalDate?, val items: List<Occurrence>)

public data class SearchUiState(
    val filters: SearchFilters = SearchFilters(),
    val items: List<Occurrence> = emptyList(),
    val total: Int = 0,
    val nextCursor: String? = null,
    val loading: Boolean = true,
    val appending: Boolean = false,
    val error: Throwable? = null,
    val appendError: Boolean = false,
    val locating: Boolean = false,
) {
    val isEmpty: Boolean get() = !loading && error == null && items.isEmpty()
}

/**
 * Поиск с фильтрами. Запрос печатается — выдача обновляется с задержкой 400 мс;
 * фильтры меняются — сразу. Пагинация по курсору API.
 */
@OptIn(FlowPreview::class)
@HiltViewModel
public class SearchViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val events: EventsRepository,
    private val favorites: FavoritesRepository,
    private val settings: SettingsRepository,
    private val location: LocationProvider,
    private val clock: RegionClock,
) : ViewModel() {

    private val route = runCatching { savedStateHandle.toRoute<SearchRoute>() }.getOrDefault(SearchRoute())

    /** Открыт из другого экрана (подборка, категория) — показываем «Назад». */
    public val showBack: Boolean = route.filtersJson != null || route.category != null || route.query != null || route.nearMe

    /** Запросить геопозицию при открытии (ярлык «Рядом»). */
    public val requestNearMeOnStart: Boolean = route.nearMe

    private val _state = MutableStateFlow(SearchUiState(filters = route.initialFilters()))
    public val state: StateFlow<SearchUiState> = _state.asStateFlow()

    private val queryInput = MutableStateFlow(_state.value.filters.query)
    public val query: StateFlow<String> = queryInput.asStateFlow()

    public val favoriteIds: StateFlow<Set<String>> = favorites.favoriteIds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())

    private val _municipalities = MutableStateFlow<List<Municipality>>(emptyList())
    public val municipalities: StateFlow<List<Municipality>> = _municipalities.asStateFlow()

    private var loadJob: Job? = null

    init {
        viewModelScope.launch {
            // Город по умолчанию и «скрывать распроданные» — из настроек, если маршрут их не задал
            val s = settings.current()
            _state.update { st ->
                var f = st.filters
                if (route.filtersJson == null && route.category == null && s.municipalityId != null && f.near == null) {
                    f = f.copy(municipalities = setOf(s.municipalityId!!))
                }
                if (s.hideSoldOutByDefault) f = f.copy(hideSoldOut = true)
                st.copy(filters = f)
            }
            reload()
        }
        viewModelScope.launch {
            queryInput.drop(1).debounce(QUERY_DEBOUNCE_MS).distinctUntilChanged().collect { q ->
                applyFilters(_state.value.filters.copy(query = q))
            }
        }
        viewModelScope.launch { runCatching { events.municipalities() }.onSuccess { _municipalities.value = it } }
    }

    public fun onQueryChange(value: String) {
        queryInput.value = value
    }

    public fun applyFilters(filters: SearchFilters) {
        if (filters == _state.value.filters && _state.value.error == null && !_state.value.loading) return
        _state.update { it.copy(filters = filters) }
        reload()
    }

    public fun resetFilters() {
        queryInput.value = ""
        applyFilters(SearchFilters())
    }

    public fun retry(): Unit = reload()

    /** Геопозиция получена (разрешение выдано) — ищем рядом, сортируем по расстоянию. */
    public fun useMyLocation() {
        _state.update { it.copy(locating = true) }
        viewModelScope.launch {
            val point = location.current()
            _state.update { it.copy(locating = false) }
            if (point != null) {
                applyFilters(_state.value.filters.copy(near = point.toNearParam(), municipalities = emptySet(), sort = SortOrder.Distance))
            }
        }
    }

    public fun toggleFavorite(occurrence: Occurrence) {
        viewModelScope.launch { favorites.toggle(occurrence) }
    }

    public fun loadMore() {
        val s = _state.value
        val cursor = s.nextCursor ?: return
        if (s.appending || s.loading) return
        _state.update { it.copy(appending = true, appendError = false) }
        viewModelScope.launch {
            try {
                val page = events.search(s.filters, cursor)
                _state.update { st ->
                    val known = st.items.mapTo(HashSet()) { it.id }
                    st.copy(items = st.items + page.items.filter { it.id !in known }, nextCursor = page.nextCursor, appending = false)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: AfishaError) {
                _state.update { it.copy(appending = false, appendError = true) }
            }
        }
    }

    /** Группировка по дням (в поясе региона); выставки-«периоды» — отдельной секцией в конце. */
    public fun sections(items: List<Occurrence>): List<DaySection> {
        val (ranges, sessions) = items.partition { it.isRange }
        val byDay = sessions.groupBy { clock.localDateOf(it.startsAt) }
            .toSortedMap(compareBy(nullsLast()) { it })
            .map { (d, list) -> DaySection(d, list) }
        return if (ranges.isEmpty()) byDay else byDay + DaySection(null, ranges)
    }

    private fun reload() {
        loadJob?.cancel()
        _state.update { it.copy(loading = true, error = null, items = emptyList(), nextCursor = null, appendError = false) }
        loadJob = viewModelScope.launch {
            try {
                val page = events.search(_state.value.filters)
                _state.update { it.copy(items = page.items, total = page.total, nextCursor = page.nextCursor, loading = false) }
            } catch (e: CancellationException) {
                throw e
            } catch (e: AfishaError) {
                _state.update { it.copy(loading = false, error = e) }
            }
        }
    }

    private fun SearchRoute.initialFilters(): SearchFilters {
        val base = filtersJson?.let { runCatching { AfishaJson.decodeFromString(SearchFilters.serializer(), it) }.getOrNull() } ?: SearchFilters()
        return base.copy(
            query = query ?: base.query,
            categories = category?.let { code -> ru.tamasha.afisha.core.model.Category.fromCode(code) }?.let { base.categories + it } ?: base.categories,
        )
    }

    private companion object {
        const val QUERY_DEBOUNCE_MS = 400L
    }
}
