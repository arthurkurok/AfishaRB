package ru.tamasha.afisha.core.designsystem.theme

import android.provider.Settings
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalContext
import ru.tamasha.afisha.core.model.AfishaFormatter
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.RegionClock

/** Часы региона: «сегодня» — по Уфе, а не по телефону. */
public val LocalRegionClock = staticCompositionLocalOf { RegionClock() }

/** Форматтер дат/цен на текущем языке интерфейса. */
public val LocalAfishaFormatter = staticCompositionLocalOf { AfishaFormatter(AppLanguage.Ru, RegionClock()) }

/** Режим «Просто»: крупные элементы, вертикальные карточки, меньше второстепенного. */
public val LocalSimpleMode = staticCompositionLocalOf { false }

/** «Убрать анимации» в системе → только смена прозрачности (docs/07-design.md §9). */
public val LocalReduceMotion = staticCompositionLocalOf { false }

/** Доступ к фирменным токенам из любого экрана. */
public object AfishaTheme {
    public val colors: AfishaColors
        @Composable @ReadOnlyComposable get() = LocalAfishaColors.current

    public val type: AfishaTypography
        @Composable @ReadOnlyComposable get() = LocalAfishaTypography.current

    public val formatter: AfishaFormatter
        @Composable @ReadOnlyComposable get() = LocalAfishaFormatter.current

    public val clock: RegionClock
        @Composable @ReadOnlyComposable get() = LocalRegionClock.current

    public val simpleMode: Boolean
        @Composable @ReadOnlyComposable get() = LocalSimpleMode.current

    public val reduceMotion: Boolean
        @Composable @ReadOnlyComposable get() = LocalReduceMotion.current
}

/** Коэффициент «Крупного текста» (поверх системного масштаба до 200 %). */
public const val LARGE_TEXT_SCALE: Float = 1.2f

/**
 * Тема приложения: Material 3 с собственной схемой из токенов, без Dynamic Color; тёмная тема обязательна.
 *
 * Material 3 Expressive (MaterialExpressiveTheme, MotionScheme.expressive) в стабильной material3 1.4
 * закрыт (internal), а 1.5 требует compileSdk 37 — проект собирается на android-36. «Выразительность»
 * дают фирменные формы (ромб, ҡусҡар) и движение из токенов `motion.*`; переход на Expressive —
 * замена MaterialTheme на MaterialExpressiveTheme после поднятия compileSdk.
 */
@Composable
public fun AfishaTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    language: AppLanguage = AppLanguage.Ru,
    largeText: Boolean = false,
    simpleMode: Boolean = false,
    regionClock: RegionClock = remember { RegionClock() },
    content: @Composable () -> Unit,
) {
    val colors = if (darkTheme) AfishaColors.Dark else AfishaColors.Light
    val scale = if (largeText || simpleMode) LARGE_TEXT_SCALE else 1f
    val typography = remember(scale) { afishaTypography(scale) }
    val formatter = remember(language, regionClock) { AfishaFormatter(language, regionClock) }
    val reduceMotion = rememberReduceMotion()
    CompositionLocalProvider(
        LocalAfishaColors provides colors,
        LocalAfishaTypography provides typography,
        LocalAfishaFormatter provides formatter,
        LocalRegionClock provides regionClock,
        LocalSimpleMode provides simpleMode,
        LocalReduceMotion provides reduceMotion,
    ) {
        MaterialTheme(
            colorScheme = colors.toColorScheme(),
            shapes = AfishaShapes,
            typography = typography.toMaterial(),
            content = content,
        )
    }
}

@Composable
private fun rememberReduceMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        runCatching {
            Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
        }.getOrDefault(false)
    }
}
