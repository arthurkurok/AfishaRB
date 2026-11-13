package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.DisplayStatus
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.displayStatus

/** Порог масштаба шрифта, с которого карточка перестраивается в вертикальную (масштаб до 200 %). */
public const val VERTICAL_CARD_FONT_SCALE: Float = 1.5f

/** Текст бейджа с учётом переноса: «Перенесено → 19 ноября». */
@Composable
public fun statusText(occurrence: Occurrence, status: DisplayStatus): String? {
    if (status == DisplayStatus.Rescheduled) {
        val date = AfishaTheme.clock.localDateOf(occurrence.startsAt)
        if (date != null) return stringResource(R.string.status_rescheduled_to, AfishaTheme.formatter.dayMonth(date))
    }
    return status.label()
}

/**
 * Карточка события (docs/07-design.md §7): постер со срезом ҡусҡар, дата в ромбе, название
 * (2 строки), площадка и район, чипы цены/возраста/Пушкинской карты, статус, кайма категории.
 *
 * Для TalkBack карточка — одна фраза («Спектакль „Буратино“, 0+, суббота 8 ноября, 11:00, …»)
 * и действие «в избранное». При масштабе шрифта ≥ 150 % и в режиме «Просто» — вертикальная.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
public fun EventCard(
    occurrence: Occurrence,
    isFavorite: Boolean,
    onClick: () -> Unit,
    onFavoriteChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    compact: Boolean = false,
) {
    val colors = AfishaTheme.colors
    val formatter = AfishaTheme.formatter
    val clock = AfishaTheme.clock
    val event = occurrence.event
    val status = occurrence.displayStatus(clock)
    val statusLabel = statusText(occurrence, status)
    val speech = formatter.cardSpeech(occurrence, statusLabel)
    val openLabel = stringResource(R.string.card_open)
    val favLabel = stringResource(if (isFavorite) R.string.favorite_remove else R.string.favorite_add)
    val categoryColor = colors.category(event.primaryCategory)
    val vertical = !compact && (AfishaTheme.simpleMode || LocalDensity.current.fontScale >= VERTICAL_CARD_FONT_SCALE)
    val start = clock.parse(occurrence.startsAt)

    val shape = RoundedCornerShape(Tokens.Radius.M)
    Box(
        modifier
            .fillMaxWidth()
            .clip(shape)
            .background(colors.surface)
            .drawBehind {
                // Кайма 4 dp снизу в цвете категории — как орнамент по подолу
                val h = 4.dp.toPx()
                drawRect(categoryColor, topLeft = Offset(0f, size.height - h), size = Size(size.width, h))
            }
            .clickable(onClick = onClick)
            .clearAndSetSemantics {
                contentDescription = speech
                role = Role.Button
                onClick(label = openLabel) { onClick(); true }
                customActions = listOf(CustomAccessibilityAction(favLabel) { onFavoriteChange(!isFavorite); true })
            },
    ) {
        val poster: @Composable (Modifier) -> Unit = { m ->
            Box(m) {
                Poster(event.image, event.primaryCategory, event.title, Modifier.fillMaxSize(), inactive = status.isInactive)
                if (start != null && !occurrence.isRange) {
                    DateDiamond(
                        date = start.toLocalDate(),
                        size = if (compact) 48.dp else 60.dp,
                        crossed = status == DisplayStatus.Cancelled,
                        modifier = Modifier.align(Alignment.BottomStart).then(
                            if (vertical) Modifier.padding(start = Tokens.Space.S3, bottom = Tokens.Space.S2) else Modifier.offset(x = (-6).dp, y = 6.dp),
                        ),
                    )
                }
            }
        }
        val details: @Composable (Modifier) -> Unit = { m ->
            Column(m, verticalArrangement = Arrangement.spacedBy(Tokens.Space.S1)) {
                Row(verticalAlignment = Alignment.Top) {
                    Text(
                        text = event.title,
                        style = AfishaTheme.type.title,
                        color = colors.ink,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f).padding(top = Tokens.Space.S2),
                    )
                    FavoriteDiamondButton(isFavorite, onFavoriteChange)
                }
                WhenLine(occurrence, status)
                occurrence.venue?.let { v ->
                    Text(
                        text = listOfNotNull(v.name, v.municipality).distinct().joinToString(" · "),
                        style = AfishaTheme.type.caption,
                        color = colors.ink2,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S1), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S1)) {
                    formatter.priceChip(event.price)?.let {
                        MetaChip(it, emphasis = if (event.price.isFree) MetaChipEmphasis.Free else MetaChipEmphasis.Neutral)
                    }
                    AgeBadge(event.ageRating)
                    if (event.pushkinCard) MetaChip(stringResource(R.string.card_pushkin), emphasis = MetaChipEmphasis.Pushkin)
                    occurrence.distanceKm?.let { MetaChip(formatter.distance(it)) }
                }
                if (status != DisplayStatus.None) StatusBadge(status, text = statusLabel)
                Spacer(Modifier.height(Tokens.Space.S2))
            }
        }
        if (vertical) {
            Column {
                poster(Modifier.fillMaxWidth().aspectRatio(16f / 9f))
                details(Modifier.padding(start = Tokens.Space.S4, end = Tokens.Space.S1, top = Tokens.Space.S3))
            }
        } else {
            Row(Modifier.padding(Tokens.Space.S3), verticalAlignment = Alignment.Top) {
                poster(Modifier.width(if (compact) 96.dp else 112.dp).aspectRatio(0.8f))
                Spacer(Modifier.width(Tokens.Space.S3))
                details(Modifier.weight(1f))
            }
        }
    }
}

/** Когда: «Сегодня, 19:00 · ещё 3 даты»; у выставки — период; у переноса — старая дата зачёркнута. */
@Composable
private fun WhenLine(occurrence: Occurrence, status: DisplayStatus) {
    val formatter = AfishaTheme.formatter
    val colors = AfishaTheme.colors
    val style: TextStyle = AfishaTheme.type.caption.copy(fontWeight = AfishaTheme.type.title.fontWeight)
    Column {
        if (status == DisplayStatus.Rescheduled && occurrence.previousStartsAt != null) {
            Text(
                formatter.sessionShort(occurrence.previousStartsAt!!),
                style = AfishaTheme.type.caption.copy(textDecoration = TextDecoration.LineThrough),
                color = colors.ink2,
            )
        }
        val main = if (occurrence.isRange) formatter.range(occurrence.startsAt, occurrence.endsAt) else formatter.sessionShort(occurrence.startsAt)
        val more = if (occurrence.moreDates > 0) {
            " · " + pluralStringResource(R.plurals.card_more_dates, occurrence.moreDates, occurrence.moreDates)
        } else {
            ""
        }
        Text(main + more, style = style, color = colors.accent, maxLines = 2)
    }
}
/** Скелетон карточки на время загрузки (без мерцания при «Убрать анимации»). */
@Composable
public fun EventCardSkeleton(modifier: Modifier = Modifier) {
    val colors = AfishaTheme.colors
    val reduce = AfishaTheme.reduceMotion
    val alpha by rememberInfiniteTransition(label = "skeleton").animateFloat(
        initialValue = 0.5f,
        targetValue = if (reduce) 0.5f else 1f,
        animationSpec = infiniteRepeatable(tween(Tokens.Motion.Slow * 2), RepeatMode.Reverse),
        label = "a",
    )
    Row(
        modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(Tokens.Radius.M))
            .background(colors.surface)
            .padding(Tokens.Space.S3)
            .alpha(alpha)
            .clearAndSetSemantics { },
    ) {
        Box(Modifier.width(112.dp).aspectRatio(0.8f).clip(RoundedCornerShape(Tokens.Radius.M)).background(colors.surface2))
        Spacer(Modifier.width(Tokens.Space.S3))
        Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2), modifier = Modifier.padding(top = Tokens.Space.S2)) {
            Box(Modifier.fillMaxWidth(0.9f).height(18.dp).background(colors.surface2, RoundedCornerShape(Tokens.Radius.S)))
            Box(Modifier.fillMaxWidth(0.6f).height(14.dp).background(colors.surface2, RoundedCornerShape(Tokens.Radius.S)))
            Box(Modifier.fillMaxWidth(0.7f).height(14.dp).background(colors.surface2, RoundedCornerShape(Tokens.Radius.S)))
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S1)) {
                repeat(3) { Box(Modifier.size(width = 52.dp, height = 20.dp).background(colors.surface2, RoundedCornerShape(Tokens.Radius.S))) }
            }
        }
    }
}
