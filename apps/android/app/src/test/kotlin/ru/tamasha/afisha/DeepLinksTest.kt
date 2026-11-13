package ru.tamasha.afisha

import android.net.Uri
import androidx.navigation.NavDeepLinkRequest
import androidx.navigation.compose.ComposeNavigator
import androidx.navigation.createGraph
import androidx.navigation.testing.TestNavHostController
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.annotation.Config
import ru.tamasha.afisha.feature.assistant.AssistantActions
import ru.tamasha.afisha.feature.assistant.assistantScreen
import ru.tamasha.afisha.feature.event.EventActions
import ru.tamasha.afisha.feature.event.eventScreen
import ru.tamasha.afisha.feature.favorites.FavoritesActions
import ru.tamasha.afisha.feature.favorites.favoritesScreen
import ru.tamasha.afisha.feature.home.HomeActions
import ru.tamasha.afisha.feature.home.HomeRoute
import ru.tamasha.afisha.feature.home.homeScreen
import ru.tamasha.afisha.feature.search.SearchActions
import ru.tamasha.afisha.feature.search.searchScreen

/** Диплинки `afisha://…` (push, виджет, ярлыки, «Поделиться») попадают в нужные экраны. */
@RunWith(AndroidJUnit4::class)
@Config(sdk = [36], application = android.app.Application::class)
class DeepLinksTest {

    private val nav = TestNavHostController(ApplicationProvider.getApplicationContext()).apply {
        navigatorProvider.addNavigator(ComposeNavigator())
        graph = createGraph(startDestination = HomeRoute) {
            homeScreen(HomeActions({}, {}, {}, {}, {}))
            searchScreen(SearchActions({}, {}, {}))
            assistantScreen(AssistantActions({}, {}))
            eventScreen(EventActions({}, {}, {}, {}))
            favoritesScreen(FavoritesActions({}, {}))
        }
    }

    private fun match(uri: String) = nav.graph.matchDeepLink(NavDeepLinkRequest.Builder.fromUri(Uri.parse(uri)).build())

    @Test
    fun `паспорт события по afisha event id`() {
        val m = match("afisha://event/01a19c9d-5f75-7380-9231-6be33e8ddd68")
        assertNotNull(m)
        assertEquals("01a19c9d-5f75-7380-9231-6be33e8ddd68", m!!.matchingArgs?.getString("id"))
    }

    @Test
    fun `площадка, поиск, Гид, избранное, сегодня`() {
        assertTrue(nav.graph.hasDeepLink(Uri.parse("afisha://venue/abc")))
        assertTrue(nav.graph.hasDeepLink(Uri.parse("afisha://search?category=theatre")))
        assertTrue(nav.graph.hasDeepLink(Uri.parse("afisha://assistant?prompt=концерт")))
        assertTrue(nav.graph.hasDeepLink(Uri.parse("afisha://favorites")))
        assertTrue(nav.graph.hasDeepLink(Uri.parse("afisha://today")))
    }
}
