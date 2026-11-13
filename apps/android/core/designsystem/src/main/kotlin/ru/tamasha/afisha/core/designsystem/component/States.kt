package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.illustration.BeeLoader
import ru.tamasha.afisha.core.designsystem.illustration.BeeMascot
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.AfishaError

/** Пустое состояние: маскот + одна фраза + одно действие (docs/07-design.md §8). */
@Composable
public fun EmptyState(
    mood: BeeMood,
    text: String,
    modifier: Modifier = Modifier,
    actionLabel: String? = null,
    onAction: (() -> Unit)? = null,
    showMascot: Boolean = true,
) {
    Column(
        modifier.fillMaxWidth().padding(Tokens.Space.S6),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(Tokens.Space.S4),
    ) {
        if (showMascot) BeeMascot(mood, size = 120.dp, decorative = true)
        Text(
            text,
            style = AfishaTheme.type.body,
            color = AfishaTheme.colors.ink,
            textAlign = TextAlign.Center,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
        if (actionLabel != null && onAction != null) {
            Button(onClick = onAction, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) { Text(actionLabel) }
        }
    }
}

/** Ошибка загрузки. Уведомления об отмене — без маскота (серьёзный тон), здесь он уместен. */
@Composable
public fun ErrorState(error: Throwable?, onRetry: () -> Unit, modifier: Modifier = Modifier) {
    val (mood, text) = when (error) {
        is AfishaError.Offline -> BeeMood.Offline to stringResource(R.string.state_offline)
        is AfishaError.NotFound -> BeeMood.NotFound to stringResource(R.string.state_not_found)
        else -> BeeMood.NotFound to stringResource(R.string.state_error)
    }
    EmptyState(mood, text, modifier, actionLabel = stringResource(R.string.action_retry), onAction = onRetry)
}

@Composable
public fun LoadingState(modifier: Modifier = Modifier) {
    Box(modifier.fillMaxSize().padding(Tokens.Space.S6), contentAlignment = Alignment.Center) { BeeLoader() }
}

/** Баннер «нет сети — показываем сохранённое». */
@Composable
public fun OfflineBanner(text: String, modifier: Modifier = Modifier, onRetry: (() -> Unit)? = null) {
    val colors = AfishaTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .background(colors.honey)
            .padding(horizontal = Tokens.Space.S4, vertical = Tokens.Space.S2)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2),
    ) {
        BeeMascot(BeeMood.Offline, size = 28.dp, decorative = true)
        Text(text, style = AfishaTheme.type.caption, color = colors.onHoney, modifier = Modifier.weight(1f))
        if (onRetry != null) {
            TextButton(onClick = onRetry) { Text(stringResource(R.string.action_retry), color = colors.onHoney) }
        }
    }
}

/** Заголовок дня в ленте («Сегодня, 2 ноября») — липкий, с ромбом. */
@Composable
public fun DayHeader(text: String, modifier: Modifier = Modifier) {
    val colors = AfishaTheme.colors
    Row(
        modifier
            .fillMaxWidth()
            .background(colors.bg)
            .padding(horizontal = Tokens.Space.S4, vertical = Tokens.Space.S2)
            .semantics { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2),
    ) {
        DiamondBullet(colors.accent)
        Text(text, style = AfishaTheme.type.title, color = colors.ink)
    }
}

/** Заголовок раздела с необязательным действием («Все»). */
@Composable
public fun SectionHeader(title: String, modifier: Modifier = Modifier, actionLabel: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        modifier.fillMaxWidth().padding(horizontal = Tokens.Space.S4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = AfishaTheme.type.h2, color = AfishaTheme.colors.ink, modifier = Modifier.weight(1f).semantics { heading() })
        if (actionLabel != null && onAction != null) {
            TextButton(onClick = onAction, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) { Text(actionLabel) }
        }
    }
}
