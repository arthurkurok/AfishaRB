package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.illustration.Ornament
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.theme.HoneyDropShape
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.BadgeShape
import ru.tamasha.afisha.core.model.DisplayStatus

/**
 * Значок формы статуса (docs/07-design.md §4.3): ромб + стрелка, перечёркнутый ромб,
 * пустой ромб, капля мёда, ромб с точкой. Форма дублирует цвет — для дальтоников и ч/б печати.
 */
@Composable
public fun StatusShapeIcon(shape: BadgeShape, color: Color, modifier: Modifier = Modifier, size: Dp = 14.dp) {
    Canvas(modifier.size(size)) {
        val c = Offset(this.size.width / 2f, this.size.height / 2f)
        val h = this.size.minDimension / 2f * 0.9f
        val stroke = Stroke(width = this.size.minDimension * 0.13f, cap = StrokeCap.Round)
        val d = Ornament.diamond(c, h)
        when (shape) {
            BadgeShape.None -> Unit
            BadgeShape.HoneyDrop -> {
                val outline = HoneyDropShape.createOutline(this.size, layoutDirection, this)
                drawPath((outline as androidx.compose.ui.graphics.Outline.Generic).path, color)
            }
            BadgeShape.EmptyDiamond -> drawPath(d, color, style = stroke)
            BadgeShape.DiamondArrow -> {
                drawPath(d, color, style = stroke)
                drawLine(color, Offset(c.x - h * 0.4f, c.y), Offset(c.x + h * 0.4f, c.y), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(c.x + h * 0.4f, c.y), Offset(c.x + h * 0.1f, c.y - h * 0.3f), stroke.width, StrokeCap.Round)
                drawLine(color, Offset(c.x + h * 0.4f, c.y), Offset(c.x + h * 0.1f, c.y + h * 0.3f), stroke.width, StrokeCap.Round)
            }
            BadgeShape.CrossedDiamond -> {
                drawPath(d, color, style = stroke)
                drawLine(color, Offset(c.x - h * 0.75f, c.y + h * 0.75f), Offset(c.x + h * 0.75f, c.y - h * 0.75f), stroke.width, StrokeCap.Round)
            }
            BadgeShape.DottedDiamond -> {
                drawPath(d, color, style = stroke)
                drawCircle(color, h * 0.22f, c)
            }
        }
    }
}

/**
 * Бейдж статуса: форма + текст + цвет. «Мало билетов» — шафрановый фон под тёмным текстом.
 * [text] — готовая подпись (например, «Перенесено → 19 ноября»); по умолчанию — из ресурсов.
 */
@Composable
public fun StatusBadge(status: DisplayStatus, modifier: Modifier = Modifier, text: String? = null) {
    if (status == DisplayStatus.None) return
    val colors = AfishaTheme.colors
    val label = text ?: status.label() ?: return
    val isHoney = status == DisplayStatus.FewLeft
    val fg = if (isHoney) colors.onHoney else colors.status(status)
    val bg = if (isHoney) colors.honey else colors.surface2
    Row(
        modifier
            .background(bg, RoundedCornerShape(Tokens.Radius.Pill))
            .padding(horizontal = Tokens.Space.S2, vertical = Tokens.Space.S1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S1),
    ) {
        StatusShapeIcon(status.shape, fg)
        Text(label, style = AfishaTheme.type.caption, color = fg, maxLines = 2, overflow = TextOverflow.Ellipsis)
    }
}

/** Нейтральный чип-метка карточки: «от 400 ₽», «12+», «Пушкинская карта». */
@Composable
public fun MetaChip(
    text: String,
    modifier: Modifier = Modifier,
    emphasis: MetaChipEmphasis = MetaChipEmphasis.Neutral,
    contentDescription: String? = null,
) {
    val colors = AfishaTheme.colors
    val (bg, fg) = when (emphasis) {
        MetaChipEmphasis.Neutral -> colors.surface2 to colors.ink
        MetaChipEmphasis.Free -> colors.surface2 to colors.meadow
        MetaChipEmphasis.Pushkin -> colors.honey to colors.onHoney
        MetaChipEmphasis.Outline -> Color.Transparent to colors.ink
    }
    Box(
        modifier
            .background(bg, RoundedCornerShape(Tokens.Radius.S))
            .then(if (emphasis == MetaChipEmphasis.Outline) Modifier.border(1.dp, colors.ink2, RoundedCornerShape(Tokens.Radius.S)) else Modifier)
            .padding(horizontal = Tokens.Space.S2, vertical = 2.dp)
            .then(if (contentDescription != null) Modifier.semantics { this.contentDescription = contentDescription } else Modifier),
    ) {
        Text(text, style = AfishaTheme.type.caption, color = fg, maxLines = 1)
    }
}

public enum class MetaChipEmphasis { Neutral, Free, Pushkin, Outline }

/** Возрастной знак — показывается всегда (436-ФЗ). */
@Composable
public fun AgeBadge(rating: Int, modifier: Modifier = Modifier) {
    val text = AfishaTheme.formatter.age(rating)
    MetaChip(text, modifier, MetaChipEmphasis.Outline, contentDescription = stringResource(R.string.card_age_cd, text))
}

/** Чип причины в подборке Гида (по reason_codes, не по тексту модели). */
@Composable
public fun ReasonChip(text: String, modifier: Modifier = Modifier) {
    val colors = AfishaTheme.colors
    Row(
        modifier
            .border(1.dp, colors.line, RoundedCornerShape(Tokens.Radius.Pill))
            .padding(horizontal = Tokens.Space.S2, vertical = Tokens.Space.S1),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S1),
    ) {
        DiamondBullet(colors.meadow, size = 8.dp)
        Text(text, style = AfishaTheme.type.caption, color = colors.ink)
    }
}

/**
 * Чип понимания запроса Гида: сплошной контур — сказано пользователем, пунктир — достроено
 * (docs/07-design.md §7). Тап — изменить.
 */
@Composable
public fun UnderstandingChip(
    text: String,
    explicit: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    stateDescription: String? = null,
) {
    val colors = AfishaTheme.colors
    val radius = Tokens.Radius.Pill
    Box(
        modifier
            .heightIn(min = Tokens.Touch.MinAndroid)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(vertical = Tokens.Space.S1),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .drawBehind {
                    val stroke = Stroke(
                        width = 1.5.dp.toPx(),
                        pathEffect = if (explicit) null else PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())),
                    )
                    val r = minOf(radius.toPx(), size.height / 2f)
                    drawRoundRect(colors.ink2, cornerRadius = CornerRadius(r), style = stroke)
                }
                .padding(horizontal = Tokens.Space.S3, vertical = 6.dp)
                .then(if (stateDescription != null) Modifier.semantics { this.contentDescription = "$text, $stateDescription" } else Modifier),
        ) {
            Text(text, style = AfishaTheme.type.caption, color = colors.ink, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
    }
}

/** Ромб-буллет. */
@Composable
public fun DiamondBullet(color: Color, modifier: Modifier = Modifier, size: Dp = 10.dp, filled: Boolean = true) {
    Canvas(modifier.size(size)) {
        val p = Ornament.diamond(Offset(this.size.width / 2f, this.size.height / 2f), this.size.minDimension / 2f)
        if (filled) drawPath(p, color) else drawPath(p, color, style = Stroke(this.size.minDimension * 0.15f))
    }
}
