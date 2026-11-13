package ru.tamasha.afisha.navigation

import android.Manifest
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.StringRes
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffoldDefaults
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteType
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.navigation.NavDestination
import androidx.navigation.NavDestination.Companion.hasRoute
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.currentBackStackEntryAsState
import ru.tamasha.afisha.BuildConfig
import ru.tamasha.afisha.R
import ru.tamasha.afisha.core.designsystem.component.FavoriteDiamondIcon
import ru.tamasha.afisha.core.designsystem.component.OfflineBanner
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.WhenPreset
import ru.tamasha.afisha.feature.assistant.AssistantActions
import ru.tamasha.afisha.feature.assistant.AssistantRoute
import ru.tamasha.afisha.feature.assistant.assistantScreen
import ru.tamasha.afisha.feature.event.EventActions
import ru.tamasha.afisha.feature.event.EventRoute
import ru.tamasha.afisha.feature.event.VenueRoute
import ru.tamasha.afisha.feature.event.eventScreen
import ru.tamasha.afisha.feature.favorites.FavoritesActions
import ru.tamasha.afisha.feature.favorites.FavoritesRoute
import ru.tamasha.afisha.feature.favorites.favoritesScreen
import ru.tamasha.afisha.feature.home.HomeActions
import ru.tamasha.afisha.feature.home.HomeRoute
import ru.tamasha.afisha.feature.home.homeScreen
import ru.tamasha.afisha.feature.search.SearchActions
import ru.tamasha.afisha.feature.search.SearchRoute
import ru.tamasha.afisha.feature.search.searchScreen
import ru.tamasha.afisha.feature.settings.AboutRoute
import ru.tamasha.afisha.feature.settings.AppInfo
import ru.tamasha.afisha.feature.settings.RecommendationRulesRoute
import ru.tamasha.afisha.feature.settings.SettingsActions
import ru.tamasha.afisha.feature.settings.SettingsRoute
import ru.tamasha.afisha.feature.settings.settingsScreens
import kotlin.reflect.KClass
import ru.tamasha.afisha.core.designsystem.R as DsR

/** Вкладки верхнего уровня. */
private enum class TopLevel(
    val route: Any,
    val routeClass: KClass<*>,
    @StringRes val label: Int,
    val icon: ImageVector?,
    val selectedIcon: ImageVector?,
) {
    Home(HomeRoute, HomeRoute::class, R.string.nav_home, Icons.Outlined.Home, Icons.Filled.Home),
    Search(SearchRoute(), SearchRoute::class, R.string.nav_search, Icons.Outlined.Search, Icons.Filled.Search),
    Guide(AssistantRoute(), AssistantRoute::class, R.string.nav_guide, Icons.Outlined.AutoAwesome, Icons.Filled.AutoAwesome),
    Favorites(FavoritesRoute, FavoritesRoute::class, R.string.nav_favorites, null, null),
    Settings(SettingsRoute, SettingsRoute::class, R.string.nav_settings, Icons.Outlined.Settings, Icons.Filled.Settings),
}

private fun NavDestination?.isOn(cls: KClass<*>): Boolean = this?.hierarchy?.any { it.hasRoute(cls) } == true

/**
 * Оболочка: адаптивная навигация (нижняя панель на телефоне, рейл на планшете) + NavHost
 * с типобезопасными маршрутами. Панель скрыта на экранах деталей; системный «назад» —
 * predictive back (android:enableOnBackInvokedCallback).
 */
@Composable
fun AfishaApp(navController: NavHostController, isOnline: Boolean) {
    val backStack by navController.currentBackStackEntryAsState()
    val destination = backStack?.destination
    val showNav = TopLevel.entries.any { destination.isOn(it.routeClass) }

    val notificationsPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { }
    val requestNotifications = {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) notificationsPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
    }

    fun openTab(tab: TopLevel) {
        navController.navigate(tab.route) {
            popUpTo(navController.graph.findStartDestination().id) { saveState = true }
            launchSingleTop = true
            restoreState = true
        }
    }

    val openEvent: (String) -> Unit = { id -> navController.navigate(EventRoute(id)) }
    val back: () -> Unit = { navController.popBackStack() }

    NavigationSuiteScaffold(
        layoutType = if (showNav) {
            NavigationSuiteScaffoldDefaults.calculateFromAdaptiveInfo(androidx.compose.material3.adaptive.currentWindowAdaptiveInfo())
        } else {
            NavigationSuiteType.None
        },
        containerColor = AfishaTheme.colors.bg,
        navigationSuiteItems = {
            TopLevel.entries.forEach { tab ->
                val selected = destination.isOn(tab.routeClass)
                item(
                    selected = selected,
                    onClick = { openTab(tab) },
                    icon = {
                        if (tab.icon != null) {
                            Icon(if (selected) tab.selectedIcon!! else tab.icon, contentDescription = null)
                        } else {
                            FavoriteDiamondIcon(filled = selected)
                        }
                    },
                    label = { Text(stringResource(tab.label), maxLines = 1) },
                )
            }
        },
    ) {
        Column(Modifier.fillMaxSize()) {
            AnimatedVisibility(visible = !isOnline) {
                OfflineBanner(
                    stringResource(DsR.string.state_offline),
                    modifier = Modifier.windowInsetsPadding(WindowInsets.statusBars),
                )
            }
            NavHost(
                navController = navController,
                startDestination = HomeRoute,
                modifier = Modifier.fillMaxSize().then(if (!isOnline) Modifier.consumeWindowInsets(WindowInsets.statusBars) else Modifier),
            ) {
                homeScreen(
                    HomeActions(
                        openEvent = openEvent,
                        openSearch = { filters -> navController.navigate(SearchRoute.of(filters)) },
                        openAssistant = { prompt -> navController.navigate(AssistantRoute(prompt = prompt)) },
                        openSettings = { openTab(TopLevel.Settings) },
                        openNearMe = { navController.navigate(SearchRoute.of(SearchFilters(whenPreset = WhenPreset.Today)).copy(nearMe = true)) },
                    ),
                )
                searchScreen(
                    SearchActions(
                        openEvent = openEvent,
                        openAssistant = { prompt -> navController.navigate(AssistantRoute(prompt = prompt)) },
                        back = back,
                    ),
                )
                assistantScreen(AssistantActions(openEvent = openEvent, back = back))
                eventScreen(
                    EventActions(
                        back = back,
                        openEvent = openEvent,
                        openVenue = { id -> navController.navigate(VenueRoute(id)) },
                        askGuide = { id -> navController.navigate(AssistantRoute(eventId = id)) },
                    ),
                )
                favoritesScreen(FavoritesActions(openEvent = openEvent, openSearch = { openTab(TopLevel.Search) }))
                settingsScreens(
                    SettingsActions(
                        back = null,
                        openRules = { navController.navigate(RecommendationRulesRoute) },
                        openAbout = { navController.navigate(AboutRoute) },
                        requestNotifications = requestNotifications,
                        appInfo = AppInfo(BuildConfig.VERSION_NAME, BuildConfig.API_BASE_URL),
                    ),
                    back = back,
                )
            }
        }
    }
}
