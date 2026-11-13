package ru.tamasha.afisha

import android.content.Intent
import android.os.Bundle
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.appcompat.app.AppCompatActivity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavHostController
import androidx.navigation.compose.rememberNavController
import androidx.activity.compose.setContent
import dagger.hilt.android.AndroidEntryPoint
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.ThemeMode
import ru.tamasha.afisha.navigation.AfishaApp
import javax.inject.Inject

/**
 * Единственная Activity. AppCompatActivity — ради смены языка внутри приложения на Android < 13
 * (AppCompatDelegate.setApplicationLocales). Диплинки afisha://… обрабатывает NavHost.
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private val viewModel: MainViewModel by viewModels()

    @Inject lateinit var regionClock: RegionClock

    private var navController: NavHostController? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        val splash = installSplashScreen()
        super.onCreate(savedInstanceState)
        // Сплэш держим, пока не прочитаны настройки (тема и язык) — без мигания
        splash.setKeepOnScreenCondition { viewModel.settings.value == null }
        viewModel.reconcileLanguage()
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(android.graphics.Color.TRANSPARENT, android.graphics.Color.TRANSPARENT),
        )
        setContent {
            val settings by viewModel.settings.collectAsStateWithLifecycle()
            val online by viewModel.isOnline.collectAsStateWithLifecycle()
            val s = settings ?: return@setContent
            val dark = when (s.themeMode) {
                ThemeMode.System -> isSystemInDarkTheme()
                ThemeMode.Light -> false
                ThemeMode.Dark -> true
            }
            val clock = remember { regionClock }
            AfishaTheme(darkTheme = dark, language = s.language, largeText = s.largeText, simpleMode = s.simpleMode, regionClock = clock) {
                val nav = rememberNavController()
                navController = nav
                AfishaApp(navController = nav, isOnline = online)
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        // singleTop: диплинк из уведомления/виджета/ярлыка, когда приложение уже открыто
        navController?.handleDeepLink(intent)
    }
}
