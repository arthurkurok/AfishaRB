package ru.tamasha.afisha.feature.search

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import kotlinx.serialization.Serializable
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.network.AfishaJson

/**
 * Поиск. [filtersJson] — сериализованные [SearchFilters] (подборки главной, «Все»),
 * [category]/[query] — короткие параметры для диплинка `afisha://search?category=theatre&query=…`.
 */
@Serializable
public data class SearchRoute(
    val filtersJson: String? = null,
    val category: String? = null,
    val query: String? = null,
    /** «Рядом со мной» из режима «Просто»: сразу запросить геопозицию. */
    val nearMe: Boolean = false,
) {
    public companion object {
        public fun of(filters: SearchFilters): SearchRoute = SearchRoute(filtersJson = AfishaJson.encodeToString(SearchFilters.serializer(), filters))
    }
}

public fun NavGraphBuilder.searchScreen(actions: SearchActions) {
    composable<SearchRoute>(deepLinks = listOf(navDeepLink<SearchRoute>(basePath = "afisha://search"))) {
        SearchScreen(actions)
    }
}
