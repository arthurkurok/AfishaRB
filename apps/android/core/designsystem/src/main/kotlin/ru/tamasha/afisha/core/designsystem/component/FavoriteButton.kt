package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.illustration.Ornament
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens

/**
 * «В избранное»: ромб наполняется мёдом снизу вверх (docs/07-design.md §9).
 * При «Убрать анимации» — без наполнения, мгновенно. Область касания ≥ 48 dp.
 */
@Composable
public fun FavoriteDiamondButton(
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    iconSize: Dp = 26.dp,
    outline: Color = AfishaTheme.colors.ink,
) {
    val colors = AfishaTheme.colors
    val reduce = AfishaTheme.reduceMotion
    val level by animateFloatAsState(
        targetValue = if (checked) 1f else 0f,
        animationSpec = tween(if (reduce) 0 else Tokens.Motion.Slow, easing = Tokens.Motion.Easing),
        label = "honey",
    )
    val label = stringResource(if (checked) R.string.favorite_remove else R.string.favorite_add)
    Box(
        modifier
            .size(Tokens.Touch.MinAndroid)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = onCheckedChange)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.size(iconSize)) {
            val c = Offset(size.width / 2f, size.height / 2f)
            val path = Ornament.diamond(c, size.minDimension / 2f * 0.92f)
            if (level > 0f) {
                clipPath(path) {
                    val top = size.height * (1f - level)
                    drawRect(colors.honey, topLeft = Offset(0f, top))
                }
            }
            drawPath(path, outline, style = Stroke(width = 2.dp.toPx()))
        }
    }
}

/** Иконка «Избранное» для навигации: ромб, заполненный мёдом у выбранной вкладки. */
@Composable
public fun FavoriteDiamondIcon(filled: Boolean, modifier: Modifier = Modifier, size: Dp = 24.dp) {
    val colors = AfishaTheme.colors
    val tint = androidx.compose.material3.LocalContentColor.current
    Canvas(modifier.size(size)) {
        val path = Ornament.diamond(Offset(this.size.width / 2f, this.size.height / 2f), this.size.minDimension / 2f * 0.8f)
        if (filled) drawPath(path, colors.honey)
        drawPath(path, tint, style = Stroke(width = 2.dp.toPx()))
    }
}
