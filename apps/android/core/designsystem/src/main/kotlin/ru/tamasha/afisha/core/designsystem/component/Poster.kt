package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ColorFilter
import androidx.compose.ui.graphics.ColorMatrix
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import coil3.compose.SubcomposeAsyncImage
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.illustration.CategoryIllustration
import ru.tamasha.afisha.core.designsystem.illustration.Ornament
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.theme.KuskarCutShape
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.EventImage

/**
 * Постер со срезом ҡусҡар. Нет фото или не загрузилось — фирменная иллюстрация категории.
 * [inactive] — отменено/прошло: постер обесцвечен.
 */
@Composable
public fun Poster(
    image: EventImage?,
    category: Category,
    title: String,
    modifier: Modifier = Modifier,
    inactive: Boolean = false,
    cut: Dp = 28.dp,
    decorative: Boolean = true,
) {
    val shape = KuskarCutShape(cut)
    val placeholder = image?.dominantColor?.let(::parseHex) ?: AfishaTheme.colors.surface2
    val filter = if (inactive) ColorFilter.colorMatrix(ColorMatrix().apply { setToSaturation(0f) }) else null
    val alpha = if (inactive) 0.6f else 1f
    Box(modifier.clip(shape).background(placeholder)) {
        if (image == null) {
            CategoryIllustration(category, Modifier.fillMaxSize())
        } else {
            SubcomposeAsyncImage(
                model = image.url,
                contentDescription = if (decorative) null else stringResource(R.string.card_image_cd, title),
                contentScale = ContentScale.Crop,
                colorFilter = filter,
                alpha = alpha,
                modifier = Modifier.fillMaxSize(),
                error = { CategoryIllustration(category, Modifier.fillMaxSize()) },
            )
        }
        KuskarCurl(cut, AfishaTheme.colors.category(category), Modifier.fillMaxSize())
    }
}

/** Завиток в вырезе постера — «почерк» продукта. */
@Composable
public fun KuskarCurl(cut: Dp, color: Color, modifier: Modifier = Modifier) {
    val rtl = LocalLayoutDirection.current == LayoutDirection.Rtl
    Canvas(modifier) {
        val c = cut.toPx()
        val x = if (rtl) c * 0.42f else size.width - c * 0.42f
        val center = Offset(x, c * 0.42f)
        drawPath(
            Ornament.kuskar(center, c * 0.34f, 1.4f, startAngle = 0f, clockwise = !rtl),
            color,
            style = Stroke(width = c * 0.1f, cap = StrokeCap.Round),
        )
    }
}

private fun parseHex(hex: String): Color? = runCatching {
    val v = hex.removePrefix("#").toLong(16)
    Color(0xFF000000 or v)
}.getOrNull()
