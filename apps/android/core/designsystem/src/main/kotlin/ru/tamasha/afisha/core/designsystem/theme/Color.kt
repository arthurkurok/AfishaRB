package ru.tamasha.afisha.core.designsystem.theme

import androidx.compose.material3.ColorScheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.DisplayStatus

/**
 * Фирменная палитра «Живой орнамент» поверх Material 3. Dynamic Color не используем — бренд важнее
 * (docs/08-mobile.md §3.2). Все значения — из сгенерированного [Tokens].
 */
@Immutable
public data class AfishaColors(
    val bg: Color,
    val surface: Color,
    val surface2: Color,
    val ink: Color,
    val ink2: Color,
    val line: Color,
    val accent: Color,
    val onAccent: Color,
    /** Шафран — только фон под тёмным текстом [onHoney]. */
    val honey: Color,
    val onHoney: Color,
    val meadow: Color,
    val focus: Color,
    val statusRescheduled: Color,
    val statusCancelled: Color,
    val statusEnded: Color,
    val statusFewLeft: Color,
    val statusUnverified: Color,
    val isDark: Boolean,
) {
    /** Цвет категории одинаков в обеих темах: белый текст на нём читается (≥ 4,5:1). */
    public fun category(category: Category): Color = when (category) {
        Category.Theatre -> Tokens.Category.Theatre
        Category.Music -> Tokens.Category.Music
        Category.Museum -> Tokens.Category.Museum
        Category.Kids -> Tokens.Category.Kids
        Category.Folk -> Tokens.Category.Folk
        Category.Cinema -> Tokens.Category.Cinema
        Category.Education -> Tokens.Category.Education
    }

    /** Цвет бейджа статуса (всегда вместе с формой и текстом). */
    public fun status(status: DisplayStatus): Color = when (status) {
        DisplayStatus.None -> ink2
        DisplayStatus.FewLeft -> statusFewLeft
        DisplayStatus.SoldOut, DisplayStatus.Ended -> statusEnded
        DisplayStatus.Rescheduled, DisplayStatus.Postponed -> statusRescheduled
        DisplayStatus.Cancelled -> statusCancelled
        DisplayStatus.Unverified -> statusUnverified
    }

    public companion object {
        public val Light: AfishaColors = AfishaColors(
            bg = Tokens.Light.Bg, surface = Tokens.Light.Surface, surface2 = Tokens.Light.Surface2,
            ink = Tokens.Light.Ink, ink2 = Tokens.Light.Ink2, line = Tokens.Light.Line,
            accent = Tokens.Light.Accent, onAccent = Tokens.Light.OnAccent,
            honey = Tokens.Light.Honey, onHoney = Tokens.Light.Ink, meadow = Tokens.Light.Meadow, focus = Tokens.Light.Focus,
            statusRescheduled = Tokens.StatusLight.Rescheduled, statusCancelled = Tokens.StatusLight.Cancelled,
            statusEnded = Tokens.StatusLight.Ended, statusFewLeft = Tokens.StatusLight.FewLeft,
            statusUnverified = Tokens.StatusLight.Unverified, isDark = false,
        )

        public val Dark: AfishaColors = AfishaColors(
            bg = Tokens.Dark.Bg, surface = Tokens.Dark.Surface, surface2 = Tokens.Dark.Surface2,
            ink = Tokens.Dark.Ink, ink2 = Tokens.Dark.Ink2, line = Tokens.Dark.Line,
            accent = Tokens.Dark.Accent, onAccent = Tokens.Dark.OnAccent,
            // Под шафраном всегда тёмный текст — в обеих темах
            honey = Tokens.Dark.Honey, onHoney = Tokens.Light.Ink, meadow = Tokens.Dark.Meadow, focus = Tokens.Dark.Focus,
            statusRescheduled = Tokens.StatusDark.Rescheduled, statusCancelled = Tokens.StatusDark.Cancelled,
            statusEnded = Tokens.StatusDark.Ended, statusFewLeft = Tokens.StatusDark.FewLeft,
            statusUnverified = Tokens.StatusDark.Unverified, isDark = true,
        )
    }
}

public val LocalAfishaColors = staticCompositionLocalOf { AfishaColors.Light }

/** Схема Material 3 из токенов: компоненты M3 сразу получают фирменные цвета. */
/** Схема Material 3 из токенов (используется и Glance-виджетом). */
public fun afishaColorScheme(dark: Boolean): ColorScheme = (if (dark) AfishaColors.Dark else AfishaColors.Light).toColorScheme()

internal fun AfishaColors.toColorScheme(): ColorScheme {
    val base = if (isDark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = accent,
        onPrimary = onAccent,
        primaryContainer = surface2,
        onPrimaryContainer = ink,
        inversePrimary = if (isDark) Tokens.Light.Accent else Tokens.Dark.Accent,
        secondary = meadow,
        onSecondary = onAccent,
        secondaryContainer = honey,
        onSecondaryContainer = onHoney,
        tertiary = focus,
        onTertiary = onAccent,
        tertiaryContainer = surface2,
        onTertiaryContainer = ink,
        background = bg,
        onBackground = ink,
        surface = surface,
        onSurface = ink,
        surfaceVariant = surface2,
        onSurfaceVariant = ink2,
        surfaceTint = accent,
        inverseSurface = if (isDark) Tokens.Light.Surface else Tokens.Dark.Surface,
        inverseOnSurface = if (isDark) Tokens.Light.Ink else Tokens.Dark.Ink,
        error = statusCancelled,
        onError = onAccent,
        errorContainer = surface2,
        onErrorContainer = statusCancelled,
        outline = ink2,
        outlineVariant = line,
        scrim = Tokens.Light.Ink,
        surfaceBright = surface,
        surfaceDim = surface2,
        surfaceContainerLowest = surface,
        surfaceContainerLow = surface,
        surfaceContainer = surface,
        surfaceContainerHigh = surface2,
        surfaceContainerHighest = surface2,
    )
}
