package ru.tamasha.afisha.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.data.EventsRepository
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.data.SettingsRepository
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.EventTag
import ru.tamasha.afisha.core.model.LoadState
import ru.tamasha.afisha.core.model.Municipality
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.Stats
import ru.tamasha.afisha.core.model.WhenPreset
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException

/** День на главной: «Сегодня / Завтра / Выходные». */
public enum class HomeDay(public val preset: WhenPreset) { Today(WhenPreset.Today), Tomorrow(WhenPreset.Tomorrow), Weekend(WhenPreset.Weekend) }

/** Подборки главной — запросы к тому же поиску, что и у сайта. */
public enum class Collection(public val filters: SearchFilters) {
    Free(SearchFilters(whenPreset = WhenPreset.Week, freeOnly = true)),
    Kids(SearchFilters(whenPreset = WhenPreset.Week, categories = setOf(Category.Kids))),
    Pushkin(SearchFilters(whenPreset = WhenPreset.Month, pushkin = true)),
    OnBashkir(SearchFilters(whenPreset = WhenPreset.Month, tags = setOf(EventTag.OnBashkir))),
}

public data class HomeUiState(
    val day: HomeDay = HomeDay.Today,
    val cityId: String? = null,
    val cityName: String? = null,
    val feed: LoadState<List<Occurrence>> = LoadState.Loading,
    val total: Int = 0,
    val collections: Map<Collection, List<Occurrence>> = emptyMap(),
    val categoryCounts: Map<Category, Int> = emptyMap(),
    val stats: Stats? = null,
    val refreshing: Boolean = false,
    val simpleMode: Boolean = false,
)

@HiltViewModel
public class HomeViewModel @Inject constructor(
    private val events: EventsRepository,
    private val favorites: FavoritesRepository,
    private val settings: SettingsRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HomeUiState())
    public val state: StateFlow<HomeUiState> = _state.asStateFlow()

    public val favoriteIds: StateFlow<Set<String>> = favorites.favoriteIds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())

    private val _municipalities = MutableStateFlow<List<Municipality>>(emptyList())
    public val municipalities: StateFlow<List<Municipality>> = _municipalities.asStateFlow()

    init {
        // Город, язык и режим «Просто» — из настроек; смена города или языка перезагружает ленту
        viewModelScope.launch {
            settings.settings
                .map { Triple(it.municipalityId to it.municipalityName, it.language, it.simpleMode) }
                .distinctUntilChanged()
                .collect { (city, _, simple) ->
                    _state.update { it.copy(cityId = city.first, cityName = city.second, simpleMode = simple) }
                    loadAll()
                }
        }
    }

    public fun selectDay(day: HomeDay) {
        if (day == _state.value.day) return
        _state.update { it.copy(day = day, feed = LoadState.Loading) }
        viewModelScope.launch { loadFeed() }
    }

    public fun refresh() {
        _state.update { it.copy(refreshing = true) }
        viewModelScope.launch {
            loadAll()
            _state.update { it.copy(refreshing = false) }
        }
    }

    public fun toggleFavorite(occurrence: Occurrence) {
        viewModelScope.launch { favorites.toggle(occurrence) }
    }

    public fun loadMunicipalities() {
        if (_municipalities.value.isNotEmpty()) return
        viewModelScope.launch {
            runCatching { events.municipalities() }.onSuccess { _municipalities.value = it }
        }
    }

    public fun selectCity(m: Municipality?) {
        viewModelScope.launch { settings.setCity(m?.id, m?.name) }
    }

    private fun cityFilter(base: SearchFilters): SearchFilters =
        _state.value.cityId?.let { base.copy(municipalities = setOf(it)) } ?: base

    private suspend fun loadAll() = coroutineScope {
        val feed = async { loadFeed() }
        val side = async { loadSide() }
        feed.await()
        side.await()
    }

    private suspend fun loadFeed() {
        val day = _state.value.day
        try {
            val cached = events.feed(cityFilter(SearchFilters(whenPreset = day.preset)), limit = FEED_LIMIT)
            if (_state.value.day != day) return
            _state.update {
                it.copy(
                    feed = LoadState.Ready(cached.value.items, cached.fromCache, cached.savedAtMillis),
                    total = cached.value.total,
                )
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: AfishaError) {
            if (_state.value.day == day) _state.update { it.copy(feed = LoadState.Failed(e)) }
        }
    }

    /** Подборки, счётчики категорий и статистика — второстепенны: ошибки не мешают ленте. */
    private suspend fun loadSide() = coroutineScope {
        val collections = Collection.entries.map { c ->
            async { c to runCatching { events.feed(cityFilter(c.filters), limit = COLLECTION_LIMIT).value.items }.getOrDefault(emptyList()) }
        }
        val counts = async { runCatching { events.categories() }.getOrDefault(emptyList()) }
        val stats = async { runCatching { events.stats() }.getOrNull() }
        val result = collections.map { it.await() }.filter { it.second.isNotEmpty() }.toMap()
        _state.update { s ->
            s.copy(
                collections = result,
                categoryCounts = counts.await().mapNotNull { info -> info.count?.let { info.category to it } }.toMap(),
                stats = stats.await() ?: s.stats,
            )
        }
    }

    private companion object {
        const val FEED_LIMIT = 30
        const val COLLECTION_LIMIT = 10
    }
}

