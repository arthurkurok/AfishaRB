package ru.tamasha.afisha.core.designsystem.theme

import androidx.compose.material3.Typography
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.ExperimentalTextApi
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontVariation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.LineHeightStyle
import androidx.compose.ui.unit.TextUnit
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.tokens.FontRole
import ru.tamasha.afisha.core.designsystem.tokens.TypeToken
import ru.tamasha.afisha.core.designsystem.tokens.Tokens

/*
 * Шрифты с полным набором башкирских букв (Ә Ғ Ҙ Ҡ Ң Ө Ҫ Ү Һ) — docs/07-design.md §5.
 * Оба — вариативные (OFL): одно начертание на файл, вес задаётся осью wght.
 */

@OptIn(ExperimentalTextApi::class)
private fun golos(weight: Int) = Font(
    R.font.golos_text,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight)),
)

@OptIn(ExperimentalTextApi::class)
private fun commissioner(weight: Int, flare: Float) = Font(
    R.font.commissioner,
    weight = FontWeight(weight),
    variationSettings = FontVariation.Settings(FontVariation.weight(weight), FontVariation.Setting("FLAR", flare)),
)

/** Golos Text — текст и интерфейс. */
public val GolosText: FontFamily = FontFamily(golos(400), golos(500), golos(600), golos(700))

/** Commissioner — заголовки, даты, цифры. */
public val Commissioner: FontFamily = FontFamily(commissioner(600, 0f), commissioner(700, 0f), commissioner(800, 0f))

/** Commissioner с осью «расклёшенность» FLAR 60 — только для `type.display`. */
public val CommissionerFlared: FontFamily = FontFamily(commissioner(700, 60f), commissioner(800, 60f))

private fun TypeToken.style(scale: Float, family: FontFamily? = null): TextStyle = TextStyle(
    fontFamily = family ?: if (role == FontRole.Display) Commissioner else GolosText,
    fontWeight = weight,
    fontSize = size * scale,
    lineHeight = lineHeight * scale,
    lineHeightStyle = LineHeightStyle(LineHeightStyle.Alignment.Center, LineHeightStyle.Trim.None),
)

private operator fun TextUnit.times(k: Float): TextUnit = TextUnit(value * k, type)

/** Фирменные ступени, которых нет в Material 3. */
@Immutable
public data class AfishaTypography(
    val display: TextStyle,
    val h1: TextStyle,
    val h2: TextStyle,
    val title: TextStyle,
    val body: TextStyle,
    val caption: TextStyle,
    /** День в ромбе даты. */
    val dateBig: TextStyle,
)

/**
 * [scale] — режим «Крупный текст» поверх системного размера шрифта (sp и так масштабируются до 200 %).
 */
public fun afishaTypography(scale: Float = 1f): AfishaTypography = AfishaTypography(
    display = Tokens.Type.Display.style(scale, CommissionerFlared),
    h1 = Tokens.Type.H1.style(scale),
    h2 = Tokens.Type.H2.style(scale),
    title = Tokens.Type.Title.style(scale),
    body = Tokens.Type.Body.style(scale),
    caption = Tokens.Type.Caption.style(scale),
    dateBig = Tokens.Type.DateBig.style(scale),
)

/** Роли Material 3 строятся из тех же токенов, чтобы стандартные компоненты говорили фирменным голосом. */
internal fun AfishaTypography.toMaterial(): Typography = Typography(
    displayLarge = display,
    displayMedium = display,
    displaySmall = h1,
    headlineLarge = h1,
    headlineMedium = h2,
    headlineSmall = h2,
    titleLarge = h2,
    titleMedium = title,
    titleSmall = body.copy(fontWeight = title.fontWeight),
    bodyLarge = body,
    bodyMedium = body,
    bodySmall = caption,
    labelLarge = body.copy(fontWeight = title.fontWeight),
    labelMedium = caption,
    labelSmall = caption,
)

public val LocalAfishaTypography = staticCompositionLocalOf { afishaTypography() }
