package ru.tamasha.afisha.feature.event

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import kotlinx.serialization.Serializable

/** Паспорт события. Диплинк `afisha://event/{id}` (push, виджет, ярлыки, «Поделиться»). */
@Serializable
public data class EventRoute(val id: String)

/** Страница площадки (`GET /v1/venues/{id}`). Диплинк `afisha://venue/{id}`. */
@Serializable
public data class VenueRoute(val id: String)

public fun NavGraphBuilder.eventScreen(actions: EventActions) {
    composable<EventRoute>(deepLinks = listOf(navDeepLink<EventRoute>(basePath = "afisha://event"))) {
        EventScreen(actions)
    }
    composable<VenueRoute>(deepLinks = listOf(navDeepLink<VenueRoute>(basePath = "afisha://venue"))) {
        VenueScreen(actions)
    }
}
