package ru.tamasha.afisha.feature.favorites

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import kotlinx.serialization.Serializable

/** Избранное. Диплинк `afisha://favorites` (ярлык). */
@Serializable
public data object FavoritesRoute

public fun NavGraphBuilder.favoritesScreen(actions: FavoritesActions) {
    composable<FavoritesRoute>(deepLinks = listOf(navDeepLink { uriPattern = "afisha://favorites" })) {
        FavoritesScreen(actions)
    }
}
