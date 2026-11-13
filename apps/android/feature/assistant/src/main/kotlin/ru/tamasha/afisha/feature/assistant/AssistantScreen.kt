package ru.tamasha.afisha.feature.assistant

import android.app.Activity
import android.content.Intent
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.Send
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Mic
import androidx.compose.material.icons.outlined.RestartAlt
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SuggestionChip
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.tamasha.afisha.core.designsystem.component.EventCard
import ru.tamasha.afisha.core.designsystem.component.ReasonChip
import ru.tamasha.afisha.core.designsystem.component.UnderstandingChip
import ru.tamasha.afisha.core.designsystem.component.labelRes
import ru.tamasha.afisha.core.designsystem.illustration.BeeLoader
import ru.tamasha.afisha.core.designsystem.illustration.BeeMascot
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.AssistantKind
import ru.tamasha.afisha.core.model.AssistantMode
import ru.tamasha.afisha.core.model.AssistantReply
import ru.tamasha.afisha.core.model.Clarification
import ru.tamasha.afisha.core.model.QuickReply
import ru.tamasha.afisha.core.model.UnderstandingChip as Chip

/** Навигация из Гида (связывает :app). «Назад» — если Гид открыт не вкладкой. */
public data class AssistantActions(
    val openEvent: (String) -> Unit,
    val back: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun AssistantScreen(actions: AssistantActions, viewModel: AssistantViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val favoriteIds by viewModel.favoriteIds.collectAsStateWithLifecycle()
    var input by rememberSaveable { mutableStateOf("") }
    var editingChip by remember { mutableStateOf<Chip?>(null) }
    val listState = rememberLazyListState()
    val context = LocalContext.current
    val language = AfishaTheme.formatter.language

    // Голосовой ввод: системное распознавание (Google/Яндекс/Сбер — что установлено)
    val voiceAvailable = remember { SpeechRecognizer.isRecognitionAvailable(context) }
    val voice = rememberLauncherForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            result.data?.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let(viewModel::send)
        }
    }

    LaunchedEffect(state.items.size, state.sending) {
        val count = listState.layoutInfo.totalItemsCount
        if (count > 0) listState.animateScrollToItem(count - 1)
    }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        containerColor = AfishaTheme.colors.bg,
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BeeMascot(BeeMood.Greeting, size = 36.dp, decorative = true)
                        Spacer(Modifier.width(Tokens.Space.S2))
                        Column {
                            Text(stringResource(R.string.assistant_title), style = AfishaTheme.type.title)
                            Text(stringResource(R.string.assistant_subtitle), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2, maxLines = 1)
                        }
                    }
                },
                navigationIcon = {
                    if (viewModel.showBack) { IconButton(onClick = actions.back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, stringResource(R.string.assistant_back)) } }
                },
                actions = {
                    if (state.items.isNotEmpty()) {
                        IconButton(onClick = viewModel::newConversation) { Icon(Icons.Outlined.RestartAlt, stringResource(R.string.assistant_clear)) }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg),
            )
        },
        bottomBar = {
            InputBar(
                value = input,
                onValueChange = { input = it },
                enabled = !state.sending,
                onSend = { viewModel.send(input); input = "" },
                voiceAvailable = voiceAvailable,
                onVoice = {
                    voice.launch(
                        Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, if (language == AppLanguage.Ba) "ba-RU" else "ru-RU"),
                    )
                },
            )
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(Tokens.Space.S4),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
        ) {
            if (state.mode == AssistantMode.Rules) {
                item(key = "rules") { RulesBanner() }
            }
            if (state.items.isEmpty()) {
                item(key = "greeting") {
                    Greeting(
                        forEvent = state.eventId != null,
                        onExample = viewModel::send,
                    )
                }
            }
            items(state.items, key = { it.id }) { item ->
                when (item) {
                    is ChatItem.User -> UserBubble(item.text)
                    is ChatItem.Guide -> GuideMessage(
                        reply = item.reply,
                        favoriteIds = favoriteIds,
                        onChip = { if (ChipEdits.optionsFor(it).isNotEmpty()) editingChip = it },
                        onQuickReply = viewModel::quickReply,
                        onOpenEvent = actions.openEvent,
                        onFavorite = viewModel::toggleFavorite,
                        isLast = item == state.items.lastOrNull(),
                    )
                    is ChatItem.Failure -> FailureMessage { viewModel.retry(item) }
                }
            }
            if (state.sending) {
                item(key = "thinking") {
                    val label = stringResource(R.string.assistant_thinking)
                    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite; contentDescription = label }) {
                        BeeLoader(size = 48.dp)
                        Spacer(Modifier.width(Tokens.Space.S2))
                        Text(label, style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
                    }
                }
            }
        }
    }

    state.clarifySheet?.let { clarify ->
        ClarifySheet(clarify, onPick = viewModel::quickReply, onDismiss = viewModel::dismissClarify)
    }
    editingChip?.let { chip ->
        ChipEditSheet(
            chip = chip,
            onPick = { label, patch ->
                editingChip = null
                viewModel.applyPatch(label, patch)
            },
            onDismiss = { editingChip = null },
        )
    }
}

@Composable
private fun RulesBanner() {
    Row(
        Modifier.fillMaxWidth().background(AfishaTheme.colors.surface2, RoundedCornerShape(Tokens.Radius.M)).padding(Tokens.Space.S3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(Icons.Outlined.Info, contentDescription = null, tint = AfishaTheme.colors.focus)
        Spacer(Modifier.width(Tokens.Space.S2))
        Text(stringResource(R.string.assistant_rules_banner), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink)
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Greeting(forEvent: Boolean, onExample: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3)) {
        Row(verticalAlignment = Alignment.Top) {
            BeeMascot(BeeMood.Greeting, size = 64.dp, decorative = true)
            Spacer(Modifier.width(Tokens.Space.S2))
            GuideBubble(stringResource(if (forEvent) R.string.assistant_greeting_event else R.string.assistant_greeting))
        }
        if (!forEvent) {
            val examples = listOf(R.string.assistant_example_1, R.string.assistant_example_2, R.string.assistant_example_3).map { stringResource(it) }
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                examples.forEach { SuggestionChip(onClick = { onExample(it) }, label = { Text(it) }, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) }
            }
        }
    }
}

@Composable
private fun UserBubble(text: String) {
    val you = stringResource(R.string.assistant_you)
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
        Text(
            text,
            style = AfishaTheme.type.body,
            color = AfishaTheme.colors.onAccent,
            modifier = Modifier
                .widthIn(max = 320.dp)
                .background(AfishaTheme.colors.accent, RoundedCornerShape(Tokens.Radius.L, Tokens.Radius.L, Tokens.Radius.S, Tokens.Radius.L))
                .padding(horizontal = Tokens.Space.S4, vertical = Tokens.Space.S3)
                .semantics { contentDescription = "$you: $text" },
        )
    }
}

@Composable
private fun GuideBubble(text: String) {
    Text(
        text,
        style = AfishaTheme.type.body,
        color = AfishaTheme.colors.ink,
        modifier = Modifier
            .background(AfishaTheme.colors.surface, RoundedCornerShape(Tokens.Radius.S, Tokens.Radius.L, Tokens.Radius.L, Tokens.Radius.L))
            .padding(horizontal = Tokens.Space.S4, vertical = Tokens.Space.S3)
            .semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** Ответ Гида: чипы понимания → текст → уточнение → карточки с причинами → быстрые ответы. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun GuideMessage(
    reply: AssistantReply,
    favoriteIds: Set<String>,
    onChip: (Chip) -> Unit,
    onQuickReply: (QuickReply) -> Unit,
    onOpenEvent: (String) -> Unit,
    onFavorite: (ru.tamasha.afisha.core.model.Occurrence) -> Unit,
    isLast: Boolean,
) {
    val mood = when (reply.kind) {
        AssistantKind.Results -> BeeMood.Found
        AssistantKind.Clarify -> BeeMood.Clarifying
        AssistantKind.Empty -> BeeMood.NotFound
        AssistantKind.Error -> BeeMood.Offline
        AssistantKind.Answer, AssistantKind.Help, AssistantKind.Offtopic -> BeeMood.Greeting
    }
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
        if (reply.chips.isNotEmpty()) {
            Text(stringResource(R.string.assistant_understood), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2, modifier = Modifier.semantics { heading() })
            val explicit = stringResource(R.string.assistant_chip_explicit)
            val inferred = stringResource(R.string.assistant_chip_inferred)
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                reply.chips.forEach { chip ->
                    UnderstandingChip(
                        text = chip.label,
                        explicit = chip.source.isExplicit,
                        onClick = { onChip(chip) },
                        stateDescription = if (chip.source.isExplicit) explicit else inferred,
                    )
                }
            }
        }
        Row(verticalAlignment = Alignment.Top) {
            BeeMascot(mood, size = 40.dp, decorative = true)
            Spacer(Modifier.width(Tokens.Space.S2))
            GuideBubble(reply.text)
        }
        if (reply.relaxed.isNotEmpty() && reply.kind == AssistantKind.Results) {
            Text(
                stringResource(R.string.assistant_relaxed, reply.relaxed.joinToString(", ")),
                style = AfishaTheme.type.caption,
                color = AfishaTheme.colors.ink2,
            )
        }
        reply.clarify?.let { clarify ->
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                clarify.options.forEach { o ->
                    OutlinedButton(onClick = { onQuickReply(o) }, enabled = isLast, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) { Text(o.label) }
                }
            }
        }
        reply.picks.forEach { pick ->
            Column(
                Modifier.fillMaxWidth().background(AfishaTheme.colors.surface2, RoundedCornerShape(Tokens.Radius.M)).padding(Tokens.Space.S2),
                verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2),
            ) {
                EventCard(
                    occurrence = pick.occurrence,
                    isFavorite = pick.occurrence.event.id in favoriteIds,
                    onClick = { onOpenEvent(pick.occurrence.event.id) },
                    onFavoriteChange = { onFavorite(pick.occurrence) },
                    compact = true,
                )
                if (pick.reasonCodes.isNotEmpty()) {
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S1), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S1)) {
                        pick.reasonCodes.forEach { ReasonChip(stringResource(it.labelRes())) }
                    }
                }
                // Текст прошёл верификатор фактов на сервере
                Text(pick.reasonText, style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
            }
        }
        if (reply.followups.isNotEmpty() && isLast) {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                reply.followups.forEach { f ->
                    SuggestionChip(onClick = { onQuickReply(f) }, label = { Text(f.label) }, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid))
                }
            }
        }
    }
}

@Composable
private fun FailureMessage(onRetry: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        BeeMascot(BeeMood.Offline, size = 40.dp, decorative = true)
        Spacer(Modifier.width(Tokens.Space.S2))
        Column(Modifier.weight(1f)) {
            GuideBubble(stringResource(R.string.assistant_error))
            TextButton(onClick = onRetry, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) { Text(stringResource(R.string.assistant_retry)) }
        }
    }
}

@Composable
private fun InputBar(
    value: String,
    onValueChange: (String) -> Unit,
    enabled: Boolean,
    onSend: () -> Unit,
    voiceAvailable: Boolean,
    onVoice: () -> Unit,
) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(AfishaTheme.colors.bg)
            .navigationBarsPadding()
            .imePadding()
            .padding(horizontal = Tokens.Space.S3, vertical = Tokens.Space.S2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        OutlinedTextField(
            value = value,
            onValueChange = onValueChange,
            placeholder = { Text(stringResource(R.string.assistant_hint)) },
            maxLines = 4,
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Send),
            keyboardActions = KeyboardActions(onSend = { if (value.isNotBlank()) onSend() }),
            modifier = Modifier.weight(1f),
        )
        if (voiceAvailable && value.isBlank()) {
            IconButton(onClick = onVoice, enabled = enabled) { Icon(Icons.Outlined.Mic, stringResource(R.string.assistant_voice)) }
        } else {
            Spacer(Modifier.width(Tokens.Space.S2))
            FilledIconButton(onClick = onSend, enabled = enabled && value.isNotBlank()) {
                Icon(Icons.AutoMirrored.Outlined.Send, stringResource(R.string.assistant_send))
            }
        }
    }
}

/** Уточнение — нижним листом с вариантами (docs/05-ai-agent.md §6, iOS/Android). */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
private fun ClarifySheet(clarify: Clarification, onPick: (QuickReply) -> Unit, onDismiss: () -> Unit) {
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                BeeMascot(BeeMood.Clarifying, size = 56.dp, decorative = true)
                Spacer(Modifier.width(Tokens.Space.S2))
                Text(clarify.question, style = AfishaTheme.type.title, modifier = Modifier.semantics { heading() })
            }
            clarify.options.forEach { o ->
                OutlinedButton(onClick = { onPick(o) }, modifier = Modifier.fillMaxWidth().heightIn(min = Tokens.Touch.MinAndroid)) { Text(o.label) }
            }
            Spacer(Modifier.padding(bottom = Tokens.Space.S4))
        }
    }
}

/** Правка чипа понимания: «убрать условие», для даты — быстрые варианты. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChipEditSheet(chip: Chip, onPick: (String, Map<String, kotlinx.serialization.json.JsonElement?>) -> Unit, onDismiss: () -> Unit) {
    val clock = AfishaTheme.clock
    val formatter = AfishaTheme.formatter
    val wholeRepublic = stringResource(R.string.assistant_whole_republic)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.padding(Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
            Text(stringResource(R.string.assistant_change), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
            Text(chip.label, style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
            ChipEdits.optionsFor(chip).forEach { edit ->
                val label = stringResource(
                    when (edit) {
                        ChipEdit.Remove -> R.string.assistant_remove
                        ChipEdit.Today -> R.string.assistant_today
                        ChipEdit.Tomorrow -> R.string.assistant_tomorrow
                        ChipEdit.Weekend -> R.string.assistant_weekend
                    },
                )
                OutlinedButton(
                    onClick = { onPick(label, ChipEdits.patch(chip, edit, clock, formatter, wholeRepublic)) },
                    modifier = Modifier.fillMaxWidth().heightIn(min = Tokens.Touch.MinAndroid),
                ) { Text(label) }
            }
            Spacer(Modifier.padding(bottom = Tokens.Space.S4))
        }
    }
}
