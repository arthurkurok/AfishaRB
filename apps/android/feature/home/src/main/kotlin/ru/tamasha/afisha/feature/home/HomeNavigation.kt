package ru.tamasha.afisha.feature.home

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import kotlinx.serialization.Serializable

/** Главная. Диплинк `afisha://today` — ярлык «Сегодня». */
@Serializable
public data object HomeRoute

public fun NavGraphBuilder.homeScreen(actions: HomeActions) {
    composable<HomeRoute>(deepLinks = listOf(navDeepLink { uriPattern = "afisha://today" })) {
        HomeScreen(actions)
    }
}
