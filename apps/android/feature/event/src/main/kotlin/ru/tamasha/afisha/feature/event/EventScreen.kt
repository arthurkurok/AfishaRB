package ru.tamasha.afisha.feature.event

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.Directions
import androidx.compose.material.icons.outlined.EventAvailable
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.NotificationsActive
import androidx.compose.material.icons.outlined.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.fromHtml
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.tamasha.afisha.core.designsystem.component.AgeBadge
import ru.tamasha.afisha.core.designsystem.component.DateDiamond
import ru.tamasha.afisha.core.designsystem.component.DiamondBullet
import ru.tamasha.afisha.core.designsystem.component.ErrorState
import ru.tamasha.afisha.core.designsystem.component.EventCard
import ru.tamasha.afisha.core.designsystem.component.FavoriteDiamondButton
import ru.tamasha.afisha.core.designsystem.component.LoadingState
import ru.tamasha.afisha.core.designsystem.component.MetaChip
import ru.tamasha.afisha.core.designsystem.component.MetaChipEmphasis
import ru.tamasha.afisha.core.designsystem.component.OfflineBanner
import ru.tamasha.afisha.core.designsystem.component.Poster
import ru.tamasha.afisha.core.designsystem.component.SectionHeader
import ru.tamasha.afisha.core.designsystem.component.StatusBadge
import ru.tamasha.afisha.core.designsystem.component.labelRes
import ru.tamasha.afisha.core.designsystem.component.statusText
import ru.tamasha.afisha.core.designsystem.component.titleRes
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.theme.DiamondShape
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.DisplayStatus
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.Freshness
import ru.tamasha.afisha.core.model.HistoryEntry
import ru.tamasha.afisha.core.model.LoadState
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.TrustLevel
import ru.tamasha.afisha.core.model.displayStatus
import ru.tamasha.afisha.core.designsystem.R as DsR

/** Навигация из паспорта события (связывает :app). */
public data class EventActions(
    val back: () -> Unit,
    val openEvent: (String) -> Unit,
    val openVenue: (String) -> Unit,
    /** Открыть Гида с вопросом об этом событии (event_id). */
    val askGuide: (eventId: String) -> Unit,
)

/**
 * Паспорт события (docs/03-functional-spec.md §1.5): обложка, название, возраст, статус,
 * сеансы со статусами, цена и билеты, площадка и маршрут, описание, блок доверия «Паспорт»
 * (источники-печати, «проверено N мин назад», история изменений) и действия.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun EventScreen(actions: EventActions, viewModel: EventViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val isFavorite by viewModel.isFavorite.collectAsStateWithLifecycle()
    val reminderIds by viewModel.reminderIds.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    var reportOpen by rememberSaveable { mutableStateOf(false) }
    val details = state.details.valueOrNull

    val msgReminderSet = stringResource(R.string.event_remind_set)
    val msgReminderOff = stringResource(R.string.event_remind_off)
    val msgTooLate = stringResource(R.string.event_remind_too_late)
    val msgReportSent = stringResource(R.string.report_sent)
    val msgReportFailed = stringResource(R.string.report_failed)
    LaunchedEffect(viewModel) {
        viewModel.effect.collect { e ->
            val text = when (e) {
                EventEffect.ReminderSet -> msgReminderSet
                EventEffect.ReminderRemoved -> msgReminderOff
                EventEffect.ReminderTooLate -> msgTooLate
                EventEffect.ReportSent -> {
                    reportOpen = false
                    msgReportSent
                }
                EventEffect.ReportFailed -> msgReportFailed
            }
            snackbar.showSnackbar(text)
        }
    }
    LaunchedEffect(details?.summary?.id) { details?.let { PlatformActions.pushRecentShortcut(context, it) } }

    val shareChooser = stringResource(R.string.event_share_chooser)
    val formatter = AfishaTheme.formatter
    Scaffold(
        containerColor = AfishaTheme.colors.bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = { Text(details?.summary?.title.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis, style = AfishaTheme.type.title) },
                navigationIcon = {
                    IconButton(onClick = actions.back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = stringResource(R.string.event_back)) }
                },
                actions = {
                    if (details != null) {
                        val primary = viewModel.primaryOccurrence(details)
                        IconButton(onClick = {
                            val whenText = primary?.let { if (it.isRange) formatter.range(it.startsAt, it.endsAt) else formatter.sessionLong(it.startsAt) }.orEmpty()
                            val where = primary?.venue?.let { listOfNotNull(it.name, it.address).joinToString(", ") }.orEmpty()
                            val text = context.getString(R.string.event_share_text, details.summary.title, listOf(whenText, where).filter { it.isNotBlank() }.joinToString(" · "), PlatformActions.deepLink(details.summary.id))
                            PlatformActions.share(context, shareChooser, text.replace(' ', ' '))
                        }) { Icon(Icons.Outlined.Share, contentDescription = stringResource(R.string.event_share)) }
                        FavoriteDiamondButton(isFavorite, { viewModel.toggleFavorite() })
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg),
            )
        },
    ) { padding ->
        when (val d = state.details) {
            LoadState.Loading -> LoadingState(Modifier.padding(padding))
            is LoadState.Failed -> ErrorState(d.error, onRetry = viewModel::load, modifier = Modifier.padding(padding))
            is LoadState.Ready -> EventContent(
                details = d.value,
                fromCache = d.fromCache,
                viewModel = viewModel,
                reminderIds = reminderIds,
                similar = state.similar,
                actions = actions,
                onReport = { reportOpen = true },
                modifier = Modifier.padding(padding),
            )
        }
    }

    if (reportOpen && details != null) {
        ReportSheet(
            sending = state.reportSending,
            onSend = { reason, comment -> viewModel.report(reason, comment, viewModel.primaryOccurrence(details)?.id) },
            onDismiss = { reportOpen = false },
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun EventContent(
    details: EventDetails,
    fromCache: Boolean,
    viewModel: EventViewModel,
    reminderIds: Set<String>,
    similar: List<Occurrence>,
    actions: EventActions,
    onReport: () -> Unit,
    modifier: Modifier,
) {
    val context = LocalContext.current
    val formatter = AfishaTheme.formatter
    val clock = AfishaTheme.clock
    val colors = AfishaTheme.colors
    val summary = details.summary
    val primary = viewModel.primaryOccurrence(details)
    val status = primary?.displayStatus(clock) ?: DisplayStatus.None
    val ticketUrl = primary?.ticketUrl ?: details.ticketUrl
    var sessionsExpanded by rememberSaveable { mutableStateOf(false) }
    var descriptionExpanded by rememberSaveable { mutableStateOf(false) }

    LazyColumn(modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = Tokens.Space.S7), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S4)) {
        if (fromCache) item(key = "offline") { OfflineBanner(stringResource(R.string.event_cached), onRetry = viewModel::load) }

        // 1. Обложка с подписью правообладателя
        item(key = "poster") {
            Column(Modifier.padding(horizontal = Tokens.Space.S4)) {
                Poster(
                    image = summary.image,
                    category = summary.primaryCategory,
                    title = summary.title,
                    inactive = status.isInactive,
                    cut = 44.dp,
                    decorative = false,
                    modifier = Modifier.fillMaxWidth().aspectRatio(16f / 10f),
                )
                summary.image?.let { img ->
                    val credit = listOfNotNull(img.author, img.license).joinToString(", ")
                    if (credit.isNotBlank()) {
                        Text(stringResource(R.string.event_image_credit, credit), style = AfishaTheme.type.caption, color = colors.ink2, maxLines = 2, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }

        // 2. Название, категории, возраст (всегда), статус
        item(key = "title") {
            Column(Modifier.padding(horizontal = Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                Text(summary.title, style = AfishaTheme.type.h1, color = colors.ink, modifier = Modifier.semantics { heading() })
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S1)) {
                    AgeBadge(summary.ageRating)
                    summary.categories.forEach { MetaChip(stringResource(it.titleRes())) }
                    if (summary.pushkinCard) MetaChip(stringResource(DsR.string.card_pushkin), emphasis = MetaChipEmphasis.Pushkin)
                    summary.tags.filter { it != ru.tamasha.afisha.core.model.EventTag.Pushkin }.forEach { MetaChip(stringResource(it.labelRes()), emphasis = MetaChipEmphasis.Outline) }
                    if (details.isPermanent) MetaChip(stringResource(R.string.event_permanent), emphasis = MetaChipEmphasis.Outline)
                }
                if (primary != null && status != DisplayStatus.None) {
                    StatusBadge(status, text = statusText(primary, status))
                    primary.statusReason?.let { Text(stringResource(R.string.event_status_reason, it), style = AfishaTheme.type.caption, color = colors.ink2) }
                }
            }
        }

        // 3. Ближайший сеанс
        primary?.let { occ ->
            item(key = "nearest") {
                Row(
                    Modifier.padding(horizontal = Tokens.Space.S4).fillMaxWidth().background(colors.surface, RoundedCornerShape(Tokens.Radius.M)).padding(Tokens.Space.S3),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    clock.localDateOf(occ.startsAt)?.takeIf { !occ.isRange }?.let { DateDiamond(it, crossed = status == DisplayStatus.Cancelled) }
                    Spacer(Modifier.width(Tokens.Space.S3))
                    Column(Modifier.weight(1f)) {
                        Text(stringResource(R.string.event_nearest), style = AfishaTheme.type.caption, color = colors.ink2)
                        Text(
                            if (occ.isRange) formatter.range(occ.startsAt, occ.endsAt) else formatter.sessionLong(occ.startsAt),
                            style = AfishaTheme.type.title,
                            color = colors.accent,
                        )
                        occ.previousStartsAt?.let {
                            Text(
                                stringResource(R.string.event_previous_date, formatter.sessionLong(it)),
                                style = AfishaTheme.type.caption.copy(textDecoration = TextDecoration.LineThrough),
                                color = colors.ink2,
                            )
                        }
                        occ.venue?.let { Text(it.name, style = AfishaTheme.type.caption, color = colors.ink2) }
                    }
                }
            }
        }

        // 4. Цена и билеты
        item(key = "price") {
            Column(Modifier.padding(horizontal = Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                val price = formatter.priceRange(summary.price)
                Text(price ?: stringResource(R.string.event_price_unknown), style = if (price != null) AfishaTheme.type.h2 else AfishaTheme.type.body, color = if (summary.price.isFree) colors.meadow else colors.ink)
                if (ticketUrl != null && !status.blocksTickets) {
                    Button(onClick = { PlatformActions.openUrl(context, ticketUrl) }, modifier = Modifier.fillMaxWidth().heightIn(min = Tokens.Touch.MinAndroid)) {
                        Icon(Icons.Outlined.ConfirmationNumber, contentDescription = null)
                        Spacer(Modifier.width(Tokens.Space.S2))
                        Text(stringResource(R.string.event_tickets))
                    }
                    Text(stringResource(R.string.event_tickets_source), style = AfishaTheme.type.caption, color = colors.ink2)
                }
            }
        }

        // 8. Действия
        item(key = "actions") {
            val reminderOn = primary?.id in reminderIds
            FlowRow(Modifier.padding(horizontal = Tokens.Space.S4), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                if (primary != null && !status.isInactive) {
                    ActionButton(Icons.Outlined.EventAvailable, stringResource(R.string.event_calendar)) { PlatformActions.addToCalendar(context, details, primary, clock) }
                    if (!primary.isRange) {
                        ActionButton(
                            if (reminderOn) Icons.Outlined.NotificationsActive else Icons.Outlined.Notifications,
                            stringResource(if (reminderOn) R.string.event_remind_on else R.string.event_remind),
                        ) { viewModel.toggleReminder(primary) }
                    }
                }
                ActionButton(Icons.Outlined.AutoAwesome, stringResource(R.string.event_ask_guide)) { actions.askGuide(summary.id) }
            }
        }

        // 3*. Все сеансы со статусами
        if (details.occurrences.size > 1) {
            item(key = "sessions-title") { SectionHeader(stringResource(R.string.event_sessions)) }
            val visible = if (sessionsExpanded) details.occurrences else details.occurrences.take(SESSIONS_PREVIEW)
            items(visible, key = { "s" + it.id }) { occ -> SessionRow(occ) }
            if (details.occurrences.size > SESSIONS_PREVIEW) {
                item(key = "sessions-more") {
                    TextButton(onClick = { sessionsExpanded = !sessionsExpanded }, modifier = Modifier.padding(horizontal = Tokens.Space.S2).heightIn(min = Tokens.Touch.MinAndroid)) {
                        Text(if (sessionsExpanded) stringResource(R.string.event_less_sessions) else stringResource(R.string.event_more_sessions, details.occurrences.size - SESSIONS_PREVIEW))
                    }
                }
            }
        }

        // 5. Площадка
        primary?.venue?.let { venue ->
            item(key = "venue") {
                Column(Modifier.padding(horizontal = Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                    Text(stringResource(R.string.event_venue), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
                    Text(venue.name, style = AfishaTheme.type.title)
                    listOfNotNull(venue.address, venue.municipality).distinct().forEach { Text(it, style = AfishaTheme.type.body, color = colors.ink2) }
                    Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                        OutlinedButton(onClick = { PlatformActions.openRoute(context, venue) }, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) {
                            Icon(Icons.Outlined.Directions, contentDescription = null)
                            Spacer(Modifier.width(Tokens.Space.S2))
                            Text(stringResource(R.string.event_route))
                        }
                        TextButton(onClick = { actions.openVenue(venue.id) }, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) {
                            Text(stringResource(R.string.event_venue_events))
                        }
                    }
                    if (details.accessibility.isNotEmpty()) {
                        Text(stringResource(R.string.event_accessibility), style = AfishaTheme.type.title)
                        details.accessibility.forEach { (_, v) ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                DiamondBullet(colors.meadow, size = 8.dp)
                                Spacer(Modifier.width(Tokens.Space.S2))
                                Text(if (v == "true") stringResource(R.string.event_accessible_generic) else v, style = AfishaTheme.type.body)
                            }
                        }
                    }
                }
            }
        }

        // 6. Описание
        if (details.descriptionHtml.isNotBlank()) {
            item(key = "about") {
                Column(Modifier.padding(horizontal = Tokens.Space.S4).animateContentSize(), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                    Text(stringResource(R.string.event_about), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
                    val text = remember(details.descriptionHtml, colors.accent) {
                        AnnotatedString.fromHtml(
                            details.descriptionHtml,
                            linkStyles = TextLinkStyles(SpanStyle(color = colors.accent, textDecoration = TextDecoration.Underline)),
                        )
                    }
                    Text(text, style = AfishaTheme.type.body, maxLines = if (descriptionExpanded) Int.MAX_VALUE else DESCRIPTION_LINES, overflow = TextOverflow.Ellipsis)
                    TextButton(onClick = { descriptionExpanded = !descriptionExpanded }, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) {
                        Text(stringResource(if (descriptionExpanded) R.string.event_read_less else R.string.event_read_more))
                    }
                    if (details.languages.isNotEmpty()) Text(stringResource(R.string.event_languages, details.languages.map { languageName(it) }.joinToString()), style = AfishaTheme.type.caption, color = colors.ink2)
                    summary.organization?.let { Text(stringResource(R.string.event_organizer, it), style = AfishaTheme.type.caption, color = colors.ink2) }
                }
            }
        }

        // «Спросить Гида» прямо в паспорте (kind = answer)
        item(key = "ask") {
            val st by viewModel.state.collectAsStateWithLifecycle()
            AskGuideBlock(
                question = st.question,
                answer = st.answer,
                onAsk = viewModel::askAboutEvent,
                onOpenChat = { actions.askGuide(summary.id) },
                modifier = Modifier.padding(horizontal = Tokens.Space.S4),
            )
        }

        // 7. Паспорт: источники, проверка, история
        item(key = "passport") { PassportBlock(details) }

        item(key = "report") {
            TextButton(onClick = onReport, modifier = Modifier.padding(horizontal = Tokens.Space.S2).heightIn(min = Tokens.Touch.MinAndroid)) {
                Icon(Icons.Outlined.Flag, contentDescription = null)
                Spacer(Modifier.width(Tokens.Space.S2))
                Text(stringResource(R.string.event_report))
            }
        }

        // 9. Похожие
        if (similar.isNotEmpty()) {
            item(key = "similar-title") { SectionHeader(stringResource(R.string.event_similar)) }
            item(key = "similar") {
                LazyRow(contentPadding = PaddingValues(horizontal = Tokens.Space.S4), horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S3)) {
                    items(similar, key = { it.id }) { occ ->
                        EventCard(
                            occurrence = occ,
                            isFavorite = false,
                            onClick = { actions.openEvent(occ.event.id) },
                            onFavoriteChange = { viewModel.toggleSimilarFavorite(occ) },
                            compact = true,
                            modifier = Modifier.width(300.dp),
                        )
                    }
                }
            }
        }
    }
}

private const val SESSIONS_PREVIEW = 5
private const val DESCRIPTION_LINES = 6

@Composable
private fun languageName(code: String): String = when (code) {
    "ru" -> stringResource(R.string.lang_ru)
    "ba" -> stringResource(R.string.lang_ba)
    "tt" -> stringResource(R.string.lang_tt)
    else -> code
}

@Composable
private fun ActionButton(icon: ImageVector, label: String, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(18.dp))
        Spacer(Modifier.width(Tokens.Space.S2))
        Text(label)
    }
}

/** Строка сеанса со статусом — у каждого сеанса свой. */
@Composable
private fun SessionRow(occ: Occurrence) {
    val formatter = AfishaTheme.formatter
    val clock = AfishaTheme.clock
    val status = occ.displayStatus(clock)
    Row(
        Modifier.padding(horizontal = Tokens.Space.S4).fillMaxWidth().background(AfishaTheme.colors.surface, RoundedCornerShape(Tokens.Radius.S)).padding(Tokens.Space.S3),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(
                if (occ.isRange) formatter.range(occ.startsAt, occ.endsAt) else formatter.sessionLong(occ.startsAt),
                style = AfishaTheme.type.body.copy(textDecoration = if (status == DisplayStatus.Cancelled) TextDecoration.LineThrough else null),
                color = if (status.isInactive) AfishaTheme.colors.ink2 else AfishaTheme.colors.ink,
            )
            occ.venue?.let { Text(it.name, style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis) }
        }
        if (status != DisplayStatus.None) StatusBadge(status, text = statusText(occ, status))
    }
}

/** Блок доверия: источники-«печати», уровень доверия, «проверено N мин назад», лента истории с ромбами-узлами. */
@Composable
private fun PassportBlock(details: EventDetails) {
    val colors = AfishaTheme.colors
    val formatter = AfishaTheme.formatter
    val context = LocalContext.current
    val p = details.provenance
    Column(
        Modifier
            .padding(horizontal = Tokens.Space.S4)
            .fillMaxWidth()
            .border(1.dp, colors.line, RoundedCornerShape(Tokens.Radius.L))
            .padding(Tokens.Space.S4),
        verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
    ) {
        Text(stringResource(R.string.event_passport), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
        formatter.verifiedAgo(p.lastVerifiedAt)?.let { Text(it, style = AfishaTheme.type.body, color = colors.meadow) }
        Text(stringResource(R.string.event_trust, stringResource(p.trustLevel.labelRes())), style = AfishaTheme.type.caption, color = colors.ink2)
        when (p.freshness) {
            Freshness.Stale -> Text(stringResource(R.string.freshness_stale), style = AfishaTheme.type.caption, color = colors.statusUnverified)
            Freshness.Vanished -> Text(stringResource(R.string.freshness_vanished), style = AfishaTheme.type.caption, color = colors.statusUnverified)
            else -> Unit
        }
        if (p.sources.isNotEmpty()) {
            Text(stringResource(R.string.event_sources), style = AfishaTheme.type.title)
            p.sources.forEach { src ->
                Row(
                    Modifier
                        .fillMaxWidth()
                        .heightIn(min = Tokens.Touch.MinAndroid)
                        .then(if (src.url != null) Modifier.clickable(role = Role.Button) { PlatformActions.openUrl(context, src.url!!) } else Modifier),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Seal()
                    Spacer(Modifier.width(Tokens.Space.S3))
                    Text(src.title, style = AfishaTheme.type.body, color = if (src.url != null) colors.accent else colors.ink)
                }
            }
        }
        if (details.history.isNotEmpty()) {
            Text(stringResource(R.string.event_history), style = AfishaTheme.type.title)
            HistoryTimeline(details.history)
        }
    }
}

/** «Печать» источника — ромб в ромбе. */
@Composable
private fun Seal() {
    val colors = AfishaTheme.colors
    Box(Modifier.size(28.dp).border(2.dp, colors.meadow, DiamondShape()), contentAlignment = Alignment.Center) {
        DiamondBullet(colors.meadow, size = 10.dp)
    }
}

/** Вертикальная лента истории изменений с ромбами-узлами. */
@Composable
private fun HistoryTimeline(history: List<HistoryEntry>) {
    val colors = AfishaTheme.colors
    val formatter = AfishaTheme.formatter
    val clock = AfishaTheme.clock
    Column {
        history.forEachIndexed { index, entry ->
            Row(Modifier.fillMaxWidth()) {
                Box(
                    Modifier
                        .width(24.dp)
                        .heightIn(min = 48.dp)
                        .drawBehind {
                            if (index < history.lastIndex) {
                                drawLine(colors.line, Offset(size.width / 2f, 12.dp.toPx()), Offset(size.width / 2f, size.height), 2.dp.toPx())
                            }
                        },
                    contentAlignment = Alignment.TopCenter,
                ) { DiamondBullet(colors.accent, size = 12.dp, modifier = Modifier.padding(top = 4.dp)) }
                Column(Modifier.weight(1f).padding(start = Tokens.Space.S2, bottom = Tokens.Space.S3)) {
                    Text(entry.text, style = AfishaTheme.type.body)
                    val date = clock.localDateOf(entry.at)
                    val meta = listOfNotNull(date?.let(formatter::dayMonth), entry.source).joinToString(" · ")
                    if (meta.isNotBlank()) Text(meta, style = AfishaTheme.type.caption, color = colors.ink2)
                }
            }
        }
    }
    Spacer(Modifier.height(0.dp))
}

private fun TrustLevel.labelRes(): Int = when (this) {
    TrustLevel.OfficialPlus -> R.string.trust_official_plus
    TrustLevel.Official -> R.string.trust_official
    TrustLevel.Partner -> R.string.trust_partner
    TrustLevel.Aggregated -> R.string.trust_aggregated
    TrustLevel.Extracted -> R.string.trust_extracted
}
