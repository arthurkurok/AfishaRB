package ru.tamasha.afisha.feature.settings

import androidx.navigation.NavGraphBuilder
import androidx.navigation.compose.composable
import androidx.navigation.navDeepLink
import kotlinx.serialization.Serializable

@Serializable
public data object SettingsRoute

@Serializable
public data object RecommendationRulesRoute

@Serializable
public data object AboutRoute

/** Что приложение сообщает «О приложении». */
public data class AppInfo(val versionName: String, val apiBaseUrl: String)

public data class SettingsActions(
    val back: (() -> Unit)?,
    val openRules: () -> Unit,
    val openAbout: () -> Unit,
    /** Запросить разрешение на уведомления (Android 13+) при включении оповещений. */
    val requestNotifications: () -> Unit,
    val appInfo: AppInfo,
)

public fun NavGraphBuilder.settingsScreens(actions: SettingsActions, back: () -> Unit) {
    composable<SettingsRoute>(deepLinks = listOf(navDeepLink { uriPattern = "afisha://settings" })) { SettingsScreen(actions) }
    composable<RecommendationRulesRoute> { RecommendationRulesScreen(back) }
    composable<AboutRoute> { AboutScreen(actions.appInfo, back) }
}
