package ru.tamasha.afisha.feature.event

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.toRoute
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.data.AssistantGateway
import ru.tamasha.afisha.core.data.EventsRepository
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.data.RemindersRepository
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.LoadState
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.ReportReason
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.WhenPreset
import ru.tamasha.afisha.core.model.displayStatus
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException

public data class EventUiState(
    val details: LoadState<EventDetails> = LoadState.Loading,
    val similar: List<Occurrence> = emptyList(),
    val reportSending: Boolean = false,
    /** Вопрос Гиду об этом событии (kind = answer) и ответ по данным паспорта. */
    val question: String? = null,
    val answer: LoadState<String>? = null,
)

/** Одноразовые события экрана (снекбары). */
public sealed interface EventEffect {
    public data object ReminderSet : EventEffect
    public data object ReminderRemoved : EventEffect
    public data object ReminderTooLate : EventEffect
    public data object ReportSent : EventEffect
    public data object ReportFailed : EventEffect
}

@HiltViewModel
public class EventViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val events: EventsRepository,
    private val favorites: FavoritesRepository,
    private val reminders: RemindersRepository,
    private val assistant: AssistantGateway,
    private val clock: RegionClock,
) : ViewModel() {

    public val eventId: String = savedStateHandle.toRoute<EventRoute>().id

    private val _state = MutableStateFlow(EventUiState())
    public val state: StateFlow<EventUiState> = _state.asStateFlow()

    private val effects = Channel<EventEffect>(Channel.BUFFERED)
    public val effect: Flow<EventEffect> = effects.receiveAsFlow()

    public val isFavorite: StateFlow<Boolean> = favorites.favoriteIds.map { eventId in it }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), false)

    public val reminderIds: StateFlow<Set<String>> = reminders.reminderIds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())

    init {
        load()
    }

    public fun load() {
        _state.update { it.copy(details = LoadState.Loading) }
        viewModelScope.launch {
            try {
                val cached = events.event(eventId)
                _state.update { it.copy(details = LoadState.Ready(cached.value, cached.fromCache, cached.savedAtMillis)) }
                if (!cached.fromCache) loadSimilar(cached.value)
            } catch (e: CancellationException) {
                throw e
            } catch (e: AfishaError) {
                _state.update { it.copy(details = LoadState.Failed(e)) }
            }
        }
    }

    /** Ближайший актуальный сеанс — для карточки, календаря и избранного. */
    public fun primaryOccurrence(details: EventDetails): Occurrence? {
        val list = details.occurrences
        return list.filter { !it.displayStatus(clock).isInactive }.minByOrNull { clock.parse(it.startsAt)?.toEpochSecond() ?: Long.MAX_VALUE }
            ?: list.firstOrNull()
    }

    public fun toggleFavorite() {
        val details = _state.value.details.valueOrNull ?: return
        val occ = primaryOccurrence(details) ?: return
        viewModelScope.launch { favorites.toggle(occ) }
    }

    public fun toggleReminder(occurrence: Occurrence) {
        viewModelScope.launch {
            val wasSet = occurrence.id in reminderIds.value
            val nowSet = reminders.toggle(occurrence)
            effects.send(
                when {
                    nowSet -> EventEffect.ReminderSet
                    wasSet -> EventEffect.ReminderRemoved
                    else -> EventEffect.ReminderTooLate
                },
            )
        }
    }

    public fun report(reason: ReportReason, comment: String, occurrenceId: String?) {
        _state.update { it.copy(reportSending = true) }
        viewModelScope.launch {
            val ok = try {
                events.report(eventId, occurrenceId, reason, comment)
                true
            } catch (e: CancellationException) {
                throw e
            } catch (_: AfishaError) {
                false
            }
            _state.update { it.copy(reportSending = false) }
            effects.send(if (ok) EventEffect.ReportSent else EventEffect.ReportFailed)
        }
    }

    /**
     * «Спросить Гида» прямо в паспорте: `POST /v1/assistant {event_id, text}` → ответ строится
     * только из полей карточки и площадки (docs/05-ai-agent.md §2.8).
     */
    public fun askAboutEvent(text: String) {
        val q = text.trim()
        if (q.isEmpty() || _state.value.answer == LoadState.Loading) return
        _state.update { it.copy(question = q, answer = LoadState.Loading) }
        viewModelScope.launch {
            val result = try {
                val reply = assistant.ask(conversationId = null, text = q, eventId = eventId)
                LoadState.Ready(reply.text)
            } catch (e: CancellationException) {
                throw e
            } catch (e: AfishaError) {
                LoadState.Failed(e)
            }
            _state.update { it.copy(answer = result) }
        }
    }

    public fun toggleSimilarFavorite(occurrence: Occurrence) {
        viewModelScope.launch { favorites.toggle(occurrence) }
    }

    /** «Похожие»: та же категория в ближайший месяц, тот же город — без самого события. */
    private suspend fun loadSimilar(details: EventDetails) {
        val category = details.summary.categories.firstOrNull() ?: return
        val city = details.occurrences.firstNotNullOfOrNull { it.venue?.municipalityId }
        val filters = SearchFilters(
            whenPreset = WhenPreset.Month,
            categories = setOf(category),
            municipalities = setOfNotNull(city),
        )
        val similar = runCatching { events.search(filters, limit = SIMILAR_LIMIT + 1).items }.getOrDefault(emptyList())
            .filter { it.event.id != eventId }
            .take(SIMILAR_LIMIT)
        _state.update { it.copy(similar = similar) }
    }

    private companion object {
        const val SIMILAR_LIMIT = 8
    }
}
