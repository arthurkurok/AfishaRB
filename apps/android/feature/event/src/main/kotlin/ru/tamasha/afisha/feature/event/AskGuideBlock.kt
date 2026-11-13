package ru.tamasha.afisha.feature.event

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.illustration.BeeLoader
import ru.tamasha.afisha.core.designsystem.illustration.BeeMascot
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.LoadState

/**
 * «Спросить Гида об этом событии» прямо в паспорте: вопрос → ответ по полям карточки.
 * Нет данных — Гид так и говорит и даёт ссылку на источник (решает сервер).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AskGuideBlock(
    question: String?,
    answer: LoadState<String>?,
    onAsk: (String) -> Unit,
    onOpenChat: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = AfishaTheme.colors
    var input by rememberSaveable { mutableStateOf("") }
    Column(
        modifier
            .fillMaxWidth()
            .background(colors.surface2, RoundedCornerShape(Tokens.Radius.L))
            .padding(Tokens.Space.S4),
        verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            BeeMascot(BeeMood.Greeting, size = 40.dp, decorative = true)
            Spacer(Modifier.width(Tokens.Space.S2))
            Text(stringResource(R.string.event_ask_title), style = AfishaTheme.type.title, modifier = Modifier.semantics { heading() })
        }
        val examples = listOf(R.string.event_ask_example_time, R.string.event_ask_example_price, R.string.event_ask_example_kids).map { stringResource(it) }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
            examples.forEach { q -> SuggestionChip(onClick = { onAsk(q) }, label = { Text(q) }, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) }
        }
        Row(verticalAlignment = Alignment.CenterVertically) {
            OutlinedTextField(
                value = input,
                onValueChange = { input = it.take(MAX_QUESTION) },
                placeholder = { Text(stringResource(R.string.event_ask_hint)) },
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
                keyboardActions = KeyboardActions(onSend = { onAsk(input); input = "" }),
                modifier = Modifier.weight(1f),
            )
            Spacer(Modifier.width(Tokens.Space.S2))
            FilledIconButton(onClick = { onAsk(input); input = "" }, enabled = input.isNotBlank() && answer != LoadState.Loading) {
                Icon(Icons.AutoMirrored.Outlined.Send, contentDescription = stringResource(R.string.event_ask_send))
            }
        }
        if (question != null) {
            Text(question, style = AfishaTheme.type.caption, color = colors.ink2)
        }
        when (answer) {
            null -> Unit
            LoadState.Loading -> BeeLoader(size = 40.dp)
            is LoadState.Failed -> Text(stringResource(R.string.event_ask_failed), style = AfishaTheme.type.body, color = colors.statusCancelled)
            is LoadState.Ready -> Text(
                answer.value,
                style = AfishaTheme.type.body,
                color = colors.ink,
                modifier = Modifier
                    .fillMaxWidth()
                    .background(colors.surface, RoundedCornerShape(Tokens.Radius.M))
                    .padding(Tokens.Space.S3)
                    .semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        TextButton(onClick = onOpenChat, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) {
            Text(stringResource(R.string.event_ask_open_chat))
        }
    }
}

private const val MAX_QUESTION = 300
