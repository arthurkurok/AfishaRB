package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.theme.DiamondShape
import java.time.LocalDate

/**
 * Дата в ромбе: день крупно (Commissioner 800), месяц мелко (docs/07-design.md §7).
 * [crossed] — перечёркнутый ромб у отменённого сеанса. Озвучивается фразой карточки, поэтому скрыт от TalkBack.
 */
@Composable
public fun DateDiamond(
    date: LocalDate,
    modifier: Modifier = Modifier,
    size: Dp = 64.dp,
    crossed: Boolean = false,
) {
    val colors = AfishaTheme.colors
    val formatter = AfishaTheme.formatter
    val shape = DiamondShape(0.1f)
    // Текст в ромбе в sp: при масштабе шрифта до 200 % ромб растёт вместе с ним, цифры не обрезаются
    val scaled = size * LocalDensity.current.fontScale.coerceIn(1f, 2f)
    Box(
        modifier
            .size(scaled)
            .clearAndSetSemantics { }
            .background(colors.surface, shape)
            .border(2.dp, if (crossed) colors.statusCancelled else colors.accent, shape)
            .drawWithContent {
                drawContent()
                if (crossed) {
                    drawLine(
                        colors.statusCancelled,
                        Offset(this.size.width * 0.2f, this.size.height * 0.8f),
                        Offset(this.size.width * 0.8f, this.size.height * 0.2f),
                        2.dp.toPx(),
                        StrokeCap.Round,
                    )
                }
            },
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = date.dayOfMonth.toString(),
                style = AfishaTheme.type.dateBig.copy(fontSize = AfishaTheme.type.dateBig.fontSize * (size.value / 80f), lineHeight = AfishaTheme.type.dateBig.lineHeight * (size.value / 80f)),
                color = colors.ink,
                textAlign = TextAlign.Center,
                maxLines = 1,
            )
            Text(
                text = formatter.monthShort(date),
                style = AfishaTheme.type.caption.copy(fontSize = AfishaTheme.type.caption.fontSize * 0.85f),
                color = colors.ink2,
                maxLines = 1,
            )
        }
    }
}
