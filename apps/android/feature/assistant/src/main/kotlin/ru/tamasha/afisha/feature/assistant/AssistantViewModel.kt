package ru.tamasha.afisha.feature.assistant

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
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonElement
import ru.tamasha.afisha.core.data.AssistantGateway
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.AssistantKind
import ru.tamasha.afisha.core.model.AssistantMode
import ru.tamasha.afisha.core.model.AssistantReply
import ru.tamasha.afisha.core.model.Clarification
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.QuickReply
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException

/** Сообщение в чате с Гидом. */
public sealed interface ChatItem {
    public val id: Long

    public data class User(override val id: Long, val text: String) : ChatItem
    public data class Guide(override val id: Long, val reply: AssistantReply) : ChatItem
    public data class Failure(override val id: Long, val retry: Request) : ChatItem
}

/** Запрос к Гиду: текст или нажатие кнопки (патч слотов). */
public data class Request(val text: String? = null, val patch: Map<String, JsonElement?>? = null)

public data class AssistantUiState(
    val items: List<ChatItem> = emptyList(),
    val sending: Boolean = false,
    val mode: AssistantMode? = null,
    val eventId: String? = null,
    /** Уточнение, которое показываем нижним листом (docs/05-ai-agent.md §6). */
    val clarifySheet: Clarification? = null,
)

/**
 * Чат с Гидом (MVVM + UDF). Факты — только из ответа сервера (карточки из БД),
 * клиент ничего не «додумывает»: показывает чипы понимания, уточнения, карточки с причинами.
 */
@HiltViewModel
public class AssistantViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val gateway: AssistantGateway,
    private val favorites: FavoritesRepository,
) : ViewModel() {

    private val route = runCatching { savedStateHandle.toRoute<AssistantRoute>() }.getOrDefault(AssistantRoute())

    /** Открыт из паспорта события или по запросу — показываем «Назад». */
    public val showBack: Boolean = route.eventId != null || route.prompt != null

    private val _state = MutableStateFlow(AssistantUiState(eventId = route.eventId))
    public val state: StateFlow<AssistantUiState> = _state.asStateFlow()

    public val favoriteIds: StateFlow<Set<String>> = favorites.favoriteIds
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), emptySet())

    private var conversationId: String? = null
    private var nextId = 0L

    init {
        route.prompt?.takeIf { it.isNotBlank() }?.let { send(it) }
    }

    public fun send(text: String) {
        val clean = text.trim()
        if (clean.isEmpty() || _state.value.sending) return
        submit(Request(text = clean), userText = clean)
    }

    /** Кнопка уточнения, «быстрый ответ» или правка чипа. */
    public fun quickReply(reply: QuickReply) {
        if (_state.value.sending) return
        _state.update { it.copy(clarifySheet = null) }
        submit(Request(patch = reply.patch), userText = reply.label)
    }

    public fun applyPatch(label: String, patch: Map<String, JsonElement?>) {
        if (patch.isEmpty()) return
        quickReply(QuickReply(id = "edit", label = label, patch = patch))
    }

    public fun dismissClarify() {
        _state.update { it.copy(clarifySheet = null) }
    }

    public fun retry(item: ChatItem.Failure) {
        _state.update { s -> s.copy(items = s.items - item) }
        submit(item.retry, userText = null)
    }

    public fun newConversation() {
        conversationId = null
        _state.update { AssistantUiState(eventId = null) }
    }

    public fun toggleFavorite(occurrence: Occurrence) {
        viewModelScope.launch { favorites.toggle(occurrence) }
    }

    private fun submit(request: Request, userText: String?) {
        _state.update { s ->
            s.copy(
                items = if (userText != null) s.items + ChatItem.User(nextId++, userText) else s.items,
                sending = true,
            )
        }
        viewModelScope.launch {
            try {
                val reply = gateway.ask(
                    conversationId = conversationId,
                    text = request.text,
                    patch = request.patch,
                    eventId = _state.value.eventId,
                )
                conversationId = reply.conversationId
                _state.update { s ->
                    s.copy(
                        items = s.items + ChatItem.Guide(nextId++, reply),
                        sending = false,
                        mode = reply.mode,
                        clarifySheet = reply.clarify?.takeIf { reply.kind == AssistantKind.Clarify },
                    )
                }
            } catch (e: CancellationException) {
                throw e
            } catch (_: AfishaError) {
                _state.update { s -> s.copy(items = s.items + ChatItem.Failure(nextId++, request), sending = false) }
            }
        }
    }
}
