package ru.tamasha.afisha.feature.assistant

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import kotlinx.serialization.Serializable

/**
 * Гид. [eventId] — вопрос о конкретном событии, [prompt] — запрос, который сразу уходит Гиду
 * (ярлык «Спросить Гида», пустой поиск). Диплинк `afisha://assistant?prompt=…`.
 */
@Serializable
public data class AssistantRoute(val eventId: String? = null, val prompt: String? = null)

public fun NavGraphBuilder.assistantScreen(actions: AssistantActions) {
    composable<AssistantRoute>(deepLinks = listOf(navDeepLink<AssistantRoute>(basePath = "afisha://assistant"))) {
        AssistantScreen(actions)
    }
}
