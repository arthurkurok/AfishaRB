package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.illustration.CategoryIcon
import ru.tamasha.afisha.core.designsystem.illustration.Ornament
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.theme.DiamondShape
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.Category

/**
 * «Зонтик курая» — навигатор категорий (docs/07-design.md §7). Не семилепестковый цветок
 * в круге (элемент госсимволики РБ), а соцветие-зонтик: лучи расходятся от общей линии,
 * на концах — мотивы категорий в ромбах. На мобильном — горизонтальная лента лучей.
 *
 * [counts] — число событий на категорию (из `/v1/categories`), если известно.
 */
@Composable
public fun KuraiUmbrella(
    selected: Set<Category>,
    onSelect: (Category?) -> Unit,
    modifier: Modifier = Modifier,
    counts: Map<Category, Int> = emptyMap(),
    showAll: Boolean = true,
) {
    val colors = AfishaTheme.colors
    val description = stringResource(R.string.umbrella_cd)
    LazyRow(
        modifier = modifier
            .fillMaxWidth()
            .semantics { contentDescription = description },
        contentPadding = PaddingValues(horizontal = Tokens.Space.S4),
        horizontalArrangement = Arrangement.spacedBy(0.dp),
    ) {
        if (showAll) {
            item(key = "all") {
                UmbrellaRay(
                    label = stringResource(R.string.umbrella_all),
                    color = colors.accent,
                    selected = selected.isEmpty(),
                    count = null,
                    first = true,
                    last = false,
                    onClick = { onSelect(null) },
                ) { tint -> AllMotif(tint) }
            }
        }
        items(Category.entries, key = { it.code }) { category ->
            UmbrellaRay(
                label = stringResource(category.shortTitleRes()),
                color = colors.category(category),
                selected = category in selected,
                count = counts[category],
                first = !showAll && category == Category.entries.first(),
                last = category == Category.entries.last(),
                onClick = { onSelect(category) },
            ) { tint -> CategoryIcon(category, tint = tint, size = 24.dp) }
        }
    }
}

@Composable
private fun UmbrellaRay(
    label: String,
    color: Color,
    selected: Boolean,
    count: Int?,
    first: Boolean,
    last: Boolean,
    onClick: () -> Unit,
    icon: @Composable (Color) -> Unit,
) {
    val colors = AfishaTheme.colors
    val fill by animateColorAsState(if (selected) color else colors.surface, label = "fill")
    val tint = if (selected) Tokens.Light.OnAccent else color
    val a11y = if (count != null) stringResource(R.string.umbrella_item_cd, label, count) else label
    val shape = DiamondShape(0.12f)
    Column(
        modifier = Modifier
            .width(76.dp)
            .selectable(selected = selected, role = Role.Tab, onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = a11y
                this.selected = selected
                role = Role.Tab
                onClick { onClick(); true }
            },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // Луч зонтика: от общей линии-«соцветия» к ромбу
        Canvas(Modifier.fillMaxWidth().height(18.dp)) {
            val cx = size.width / 2f
            val lineColor = colors.line
            val startX = if (first) cx else 0f
            val endX = if (last) cx else size.width
            drawLine(lineColor, Offset(startX, 2.dp.toPx()), Offset(endX, 2.dp.toPx()), 1.5.dp.toPx(), StrokeCap.Round)
            drawLine(if (selected) color else lineColor, Offset(cx, 2.dp.toPx()), Offset(cx, size.height), 1.5.dp.toPx(), StrokeCap.Round)
            drawPath(Ornament.diamond(Offset(cx, 2.dp.toPx()), 3.dp.toPx()), if (selected) color else lineColor)
        }
        Box(
            Modifier
                .size(52.dp)
                .background(fill, shape)
                .border(2.dp, color, shape),
            contentAlignment = Alignment.Center,
        ) { icon(tint) }
        Text(
            text = label,
            style = AfishaTheme.type.caption,
            color = if (selected) colors.ink else colors.ink2,
            textAlign = TextAlign.Center,
            maxLines = 2,
            modifier = Modifier.width(72.dp),
        )
    }
}

/** Мотив «все категории» — ромб из четырёх ромбов. */
@Composable
private fun AllMotif(tint: Color) {
    Canvas(Modifier.size(24.dp)) {
        val q = size.minDimension / 4f
        val c = Offset(size.width / 2f, size.height / 2f)
        for (o in listOf(Offset(0f, -q), Offset(q, 0f), Offset(0f, q), Offset(-q, 0f))) {
            drawPath(Ornament.diamond(c + o, q * 0.8f), tint)
        }
    }
}
