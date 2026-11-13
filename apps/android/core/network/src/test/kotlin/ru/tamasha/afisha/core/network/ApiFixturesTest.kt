package ru.tamasha.afisha.core.network

import io.ktor.http.HttpStatusCode
import java.io.IOException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.AssistantKind
import ru.tamasha.afisha.core.model.AssistantMode
import ru.tamasha.afisha.core.model.AssistantQuery
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.SlotSource
import ru.tamasha.afisha.core.model.TrustLevel
import ru.tamasha.afisha.core.model.WhenPreset
import java.math.BigDecimal

/**
 * Сгенерированный клиент разбирает реальные ответы API (фикстуры сняты с http://localhost:8000).
 * Если контракт поменяется несовместимо — эти тесты упадут раньше, чем приложение у людей.
 */
class ApiFixturesTest {

    @Test
    fun `выдача на сегодня`() = runTest {
        val page = FixtureApi.serving("occurrences_today.json").api.occurrences(SearchFilters(whenPreset = WhenPreset.Today), AppLanguage.Ru)
        assertEquals(5, page.items.size)
        assertTrue(page.total >= page.items.size)
        assertNotNull(page.appliedDateFrom)
        val first = page.items.first()
        assertTrue(first.startsAt.endsWith("+05:00"))
        assertTrue(first.event.categories.isNotEmpty())
        assertTrue(first.event.ageRating in listOf(0, 6, 12, 16, 18))
        val venue = requireNotNull(first.venue)
        assertNotNull("координаты [lat, lon] разобраны", venue.geo)
        assertTrue(venue.geo!!.lat in 51.0..57.0) // Башкортостан
    }

    @Test
    fun `цены строками превращаются в BigDecimal`() = runTest {
        val page = FixtureApi.serving("occurrences_today.json").api.occurrences(SearchFilters(), AppLanguage.Ru)
        val paid = page.items.first { !it.event.price.isFree && it.event.price.min != null }
        assertTrue(paid.event.price.min!! > BigDecimal.ZERO)
    }

    @Test
    fun `HTML-сущности в подписи автора раскодированы`() = runTest {
        val page = FixtureApi.serving("occurrences_today.json").api.occurrences(SearchFilters(), AppLanguage.Ru)
        page.items.mapNotNull { it.event.image?.author }.forEach { assertFalse(it, it.contains("&quot;")) }
    }

    @Test
    fun `параметры поиска уходят в query`() = runTest {
        val fx = FixtureApi.serving("occurrences_weekend_ufa_ba.json")
        val page = fx.api.occurrences(
            SearchFilters(whenPreset = WhenPreset.Weekend, municipalities = setOf("ufa"), categories = setOf(Category.Theatre, Category.Music)),
            AppLanguage.Ba,
            limit = 5,
        )
        assertTrue(page.items.isNotEmpty())
        val url = fx.requests.single().url
        assertEquals("/v1/occurrences", url.encodedPath)
        assertEquals("weekend", url.parameters["when"])
        assertEquals("ba", url.parameters["lang"])
        assertEquals(listOf("music", "theatre"), url.parameters.getAll("categories"))
        assertEquals("ufa", url.parameters["municipality"])
        assertEquals("true", url.parameters["group"])
    }

    @Test
    fun `паспорт события с сеансами, источниками и историей`() = runTest {
        val e = FixtureApi.serving("event_detail.json").api.event("x", AppLanguage.Ru)
        assertTrue(e.occurrences.size > 1)
        assertTrue(e.occurrences.all { it.event.id == e.summary.id })
        assertTrue(e.provenance.sources.isNotEmpty())
        assertTrue(e.provenance.trustLevel in TrustLevel.entries)
        assertTrue(e.history.isNotEmpty())
        assertTrue(e.history.first().text.isNotBlank())
        assertTrue(e.descriptionHtml.isNotBlank())
    }

    @Test
    fun `страница площадки с ближайшими событиями`() = runTest {
        val fx = FixtureApi.serving("venue_detail.json")
        val v = fx.api.venue("v1", AppLanguage.Ru)
        assertTrue(v.venue.name.isNotBlank())
        assertNotNull(v.venue.geo)
        assertTrue(v.upcoming.isNotEmpty())
        assertTrue(v.upcomingTotal >= v.upcoming.size)
        assertTrue(v.upcoming.all { it.startsAt.isNotEmpty() })
        assertEquals("/v1/venues/v1", fx.requests.single().url.encodedPath)
    }

    @Test
    fun `Гид отвечает на вопрос без подборки — kind answer`() = runTest {
        val r = FixtureApi.serving("assistant_answer.json").api.assistant(AssistantQuery(text = "31 февраля"))
        assertEquals(AssistantKind.Answer, r.kind)
        assertTrue(r.text.isNotBlank())
        assertTrue(r.picks.isEmpty())
        assertTrue(r.followups.isNotEmpty())
    }

    @Test
    fun `несуществующее событие — NotFound`() = runTest {
        try {
            FixtureApi.serving("event_404.json", HttpStatusCode.NotFound).api.event("00000000-0000-0000-0000-000000000000", AppLanguage.Ru)
            fail("ожидалась ошибка")
        } catch (_: AfishaError.NotFound) {
        }
    }

    @Test
    fun `нет сети — Offline`() = runTest {
        val fx = FixtureApi { throw IOException("connection refused") }
        try {
            fx.api.stats()
            fail("ожидалась ошибка")
        } catch (_: AfishaError.Offline) {
        }
    }

    @Test
    fun `ошибка сервера — Server с кодом`() = runTest {
        try {
            FixtureApi.serving("event_404.json", HttpStatusCode.ServiceUnavailable).api.stats()
            fail("ожидалась ошибка")
        } catch (e: AfishaError.Server) {
            assertEquals(503, e.code)
        }
    }

    @Test
    fun `справочники категорий на ru и ba`() = runTest {
        val ru = FixtureApi.serving("categories.json").api.categories(AppLanguage.Ru)
        val ba = FixtureApi.serving("categories_ba.json").api.categories(AppLanguage.Ba)
        assertEquals(Category.entries.toSet(), ru.map { it.category }.toSet())
        assertEquals(7, ba.size)
    }

    @Test
    fun `муниципалитеты с двойными названиями`() = runTest {
        val list = FixtureApi.serving("municipalities_ba.json").api.municipalities(AppLanguage.Ba)
        val ufa = list.first { it.id == "ufa" }
        assertEquals("Уфа", ufa.nameRu)
        assertEquals("Өфө", ufa.nameBa)
        assertTrue(ufa.isCity)
        assertNotNull(ufa.center)
    }

    @Test
    fun `статистика`() = runTest {
        val s = FixtureApi.serving("stats.json").api.stats()
        assertTrue(s.events > 0)
        assertTrue(s.freeShare in 0.0..1.0)
    }

    @Test
    fun `Гид уточняет возраст ребёнка кнопками с патчами`() = runTest {
        val r = FixtureApi.serving("assistant_clarify.json").api.assistant(AssistantQuery(text = "куда с ребёнком"))
        assertEquals(AssistantKind.Clarify, r.kind)
        val clarify = requireNotNull(r.clarify)
        assertTrue(clarify.options.size >= 2)
        val age5 = clarify.options.first { it.id == "age_5" }
        assertEquals(5, age5.patch.getValue("kids_ages")!!.jsonArray.single().jsonPrimitive.content.toInt())
        assertTrue(r.chips.any { it.source == SlotSource.User })
        assertEquals(AssistantMode.Rules, r.mode)
    }

    @Test
    fun `у чипов понимания есть серверный патч «убрать условие»`() = runTest {
        val r = FixtureApi.serving("assistant_clarify.json").api.assistant(AssistantQuery(text = "x"))
        val city = r.chips.first { it.slot == "municipality" }
        val clear = requireNotNull(city.clear)
        assertTrue(clear.containsKey("municipality_id"))
    }

    @Test
    fun `вопрос о событии — ответ по данным паспорта`() = runTest {
        val fx = FixtureApi.serving("assistant_event_answer.json")
        val r = fx.api.assistant(AssistantQuery(text = "Во сколько начало?", eventId = "e1"))
        assertEquals(AssistantKind.Answer, r.kind)
        assertTrue(r.text.isNotBlank())
        val body = (fx.requests.single().body as io.ktor.http.content.OutgoingContent.ByteArrayContent).bytes().decodeToString()
        assertTrue(body, body.contains("\"event_id\":\"e1\""))
    }

    @Test
    fun `Гид отвечает на башкирском`() = runTest {
        val r = FixtureApi.serving("assistant_ba.json").api.assistant(AssistantQuery(text = "x", language = AppLanguage.Ba))
        assertTrue(r.text.any { it in "әҙҡңөҫүһғ" })
    }

    @Test
    fun `Гид отвечает подборкой с причинами`() = runTest {
        val r = FixtureApi.serving("assistant_results.json").api.assistant(AssistantQuery(text = "x"))
        assertEquals(AssistantKind.Results, r.kind)
        assertTrue(r.picks.isNotEmpty())
        r.picks.forEach {
            assertTrue(it.reasonText.isNotBlank())
            assertTrue(it.reasonCodes.isNotEmpty())
        }
        assertTrue(r.followups.isNotEmpty())
        assertNull(r.clarify)
    }

    @Test
    fun `Гид честно говорит, что ослабил условия`() = runTest {
        val r = FixtureApi.serving("assistant_relaxed.json").api.assistant(AssistantQuery(text = "x"))
        assertTrue(r.relaxed.isNotEmpty())
    }

    @Test
    fun `Гид вне темы`() = runTest {
        val r = FixtureApi.serving("assistant_offtopic.json").api.assistant(AssistantQuery(text = "погода"))
        assertEquals(AssistantKind.Offtopic, r.kind)
        assertTrue(r.picks.isEmpty())
    }

    @Test
    fun `нажатие кнопки уходит патчем без лишних null-полей`() = runTest {
        val fx = FixtureApi.serving("assistant_results.json")
        fx.api.assistant(
            AssistantQuery(conversationId = "c1", patch = mapOf("budget_per" to JsonPrimitive("ticket")), language = AppLanguage.Ba),
        )
        val body = (fx.requests.single().body as io.ktor.http.content.OutgoingContent.ByteArrayContent).bytes().decodeToString()
        assertTrue(body, body.contains("\"patch\":{\"budget_per\":\"ticket\"}"))
        assertTrue(body, body.contains("\"lang\":\"ba\""))
        assertFalse(body, body.contains("\"text\""))
    }
}
