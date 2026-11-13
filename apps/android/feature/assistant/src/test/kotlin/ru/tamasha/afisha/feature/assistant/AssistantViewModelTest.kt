package ru.tamasha.afisha.feature.assistant

import androidx.lifecycle.SavedStateHandle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import ru.tamasha.afisha.core.data.AssistantGateway
import ru.tamasha.afisha.core.data.FavoritesRepository
import ru.tamasha.afisha.core.data.TimeSource
import ru.tamasha.afisha.core.database.FavoriteEntity
import ru.tamasha.afisha.core.database.FavoritesDao
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.AssistantKind
import ru.tamasha.afisha.core.model.AssistantMode
import ru.tamasha.afisha.core.model.AssistantReply
import ru.tamasha.afisha.core.model.Clarification
import ru.tamasha.afisha.core.model.QuickReply
import ru.tamasha.afisha.core.model.RegionClock

@OptIn(ExperimentalCoroutinesApi::class)
class AssistantViewModelTest {

    private class Call(val conversationId: String?, val text: String?, val patch: Map<String, JsonElement?>?, val eventId: String?)

    private class FakeGateway : AssistantGateway {
        val calls = mutableListOf<Call>()
        val replies = ArrayDeque<Result<AssistantReply>>()
        override suspend fun ask(conversationId: String?, text: String?, patch: Map<String, JsonElement?>?, eventId: String?, near: String?): AssistantReply {
            calls += Call(conversationId, text, patch, eventId)
            return replies.removeFirst().getOrThrow()
        }
    }

    private object EmptyDao : FavoritesDao {
        override fun observeAll(): Flow<List<FavoriteEntity>> = flowOf(emptyList())
        override fun observeIds(): Flow<List<String>> = flowOf(emptyList())
        override suspend fun getAll(): List<FavoriteEntity> = emptyList()
        override suspend fun get(eventId: String): FavoriteEntity? = null
        override suspend fun upsert(entity: FavoriteEntity) = Unit
        override suspend fun delete(eventId: String) = Unit
    }

    private val gateway = FakeGateway()
    private val favorites = FavoritesRepository(EmptyDao, RegionClock(), TimeSource { 0L })

    private fun reply(kind: AssistantKind, clarify: Clarification? = null, mode: AssistantMode = AssistantMode.Rules) = AssistantReply(
        conversationId = "c1", kind = kind, text = "…", chips = emptyList(), clarify = clarify, picks = emptyList(),
        relaxed = emptyList(), followups = emptyList(), mode = mode,
    )

    @Before
    fun setUp() = Dispatchers.setMain(UnconfinedTestDispatcher())

    @After
    fun tearDown() = Dispatchers.resetMain()

    @Test
    fun `уточнение открывает лист с вариантами, ответ кнопкой уходит патчем`() = runTest {
        val option = QuickReply("age_5", "3–5 лет", mapOf("kids_ages" to JsonPrimitive(5)))
        gateway.replies += Result.success(reply(AssistantKind.Clarify, Clarification("kids", "Сколько лет ребёнку?", listOf(option))))
        gateway.replies += Result.success(reply(AssistantKind.Results))
        val vm = AssistantViewModel(SavedStateHandle(), gateway, favorites)

        vm.send("с ребёнком в субботу")
        assertNotNull(vm.state.value.clarifySheet)
        assertEquals(AssistantMode.Rules, vm.state.value.mode)

        vm.quickReply(option)
        assertNull(vm.state.value.clarifySheet)
        val second = gateway.calls[1]
        assertEquals("c1", second.conversationId)
        assertEquals(option.patch, second.patch)
        assertNull(second.text)
        val items = vm.state.value.items
        assertEquals(listOf("с ребёнком в субботу", "3–5 лет"), items.filterIsInstance<ChatItem.User>().map { it.text })
        assertEquals(2, items.filterIsInstance<ChatItem.Guide>().size)
    }

    @Test
    fun `ошибка сети — сообщение с повтором того же запроса`() = runTest {
        gateway.replies += Result.failure(AfishaError.Offline())
        gateway.replies += Result.success(reply(AssistantKind.Results))
        val vm = AssistantViewModel(SavedStateHandle(), gateway, favorites)

        vm.send("концерт")
        val failure = vm.state.value.items.last() as ChatItem.Failure
        assertEquals("концерт", failure.retry.text)

        vm.retry(failure)
        assertTrue(vm.state.value.items.last() is ChatItem.Guide)
        assertEquals("концерт", gateway.calls.last().text)
    }

    @Test
    fun `пустой текст не отправляется`() = runTest {
        val vm = AssistantViewModel(SavedStateHandle(), gateway, favorites)
        vm.send("   ")
        assertTrue(gateway.calls.isEmpty())
    }
}
