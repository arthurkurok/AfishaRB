package ru.tamasha.afisha.feature.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.NearMe
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Today
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.Scaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.tamasha.afisha.core.designsystem.component.CityPickerSheet
import ru.tamasha.afisha.core.designsystem.component.EmptyState
import ru.tamasha.afisha.core.designsystem.component.ErrorState
import ru.tamasha.afisha.core.designsystem.component.EventCard
import ru.tamasha.afisha.core.designsystem.component.EventCardSkeleton
import ru.tamasha.afisha.core.designsystem.component.KuraiUmbrella
import ru.tamasha.afisha.core.designsystem.component.OfflineBanner
import ru.tamasha.afisha.core.designsystem.component.SectionHeader
import ru.tamasha.afisha.core.designsystem.illustration.BeeMascot
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.LoadState
import ru.tamasha.afisha.core.model.SearchFilters
import java.text.DateFormat
import java.util.Date
import ru.tamasha.afisha.core.designsystem.R as DsR

/** Навигация с главной — её связывает :app. */
public data class HomeActions(
    val openEvent: (String) -> Unit,
    val openSearch: (SearchFilters) -> Unit,
    val openAssistant: (String?) -> Unit,
    val openSettings: () -> Unit,
    /** «Рядом со мной»: запрашивает геопозицию и открывает поиск (реализует :app). */
    val openNearMe: () -> Unit,
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun HomeScreen(actions: HomeActions, viewModel: HomeViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val favoriteIds by viewModel.favoriteIds.collectAsStateWithLifecycle()
    val municipalities by viewModel.municipalities.collectAsStateWithLifecycle()
    var cityPicker by rememberSaveable { mutableStateOf(false) }
    val scroll = TopAppBarDefaults.enterAlwaysScrollBehavior()
    val wholeRepublic = stringResource(R.string.home_whole_republic)
    val cityLabel = state.cityName ?: stringResource(DsR.string.city_all)

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        topBar = {
            TopAppBar(
                scrollBehavior = scroll,
                title = {
                    Column {
                        Text(stringResource(R.string.home_brand), style = AfishaTheme.type.h1, color = AfishaTheme.colors.accent)
                        if (!state.simpleMode) {
                            Text(stringResource(R.string.home_brand_subtitle), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2, maxLines = 1, overflow = TextOverflow.Ellipsis)
                        }
                    }
                },
                actions = {
                    val cd = stringResource(R.string.home_city_cd, cityLabel)
                    AssistChip(
                        onClick = { viewModel.loadMunicipalities(); cityPicker = true },
                        label = { Text(cityLabel, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.widthIn(max = CityChipMaxWidth)) },
                        leadingIcon = { Icon(Icons.Outlined.LocationOn, contentDescription = null) },
                        modifier = Modifier.semantics { contentDescription = cd },
                    )
                    IconButton(onClick = actions.openSettings) {
                        Icon(Icons.Outlined.Settings, contentDescription = stringResource(R.string.home_settings))
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg, scrolledContainerColor = AfishaTheme.colors.bg),
            )
        },
        containerColor = AfishaTheme.colors.bg,
        modifier = Modifier.fillMaxSize().nestedScroll(scroll.nestedScrollConnection),
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.refreshing,
            onRefresh = viewModel::refresh,
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            HomeContent(state, favoriteIds, actions, viewModel, wholeRepublic, Modifier.fillMaxSize())
        }
    }

    if (cityPicker) {
        CityPickerSheet(
            municipalities = municipalities,
            selectedId = state.cityId,
            onSelect = { viewModel.selectCity(it); cityPicker = false },
            onDismiss = { cityPicker = false },
        )
    }
}

private val CityChipMaxWidth = 120.dp

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun HomeContent(
    state: HomeUiState,
    favoriteIds: Set<String>,
    actions: HomeActions,
    viewModel: HomeViewModel,
    wholeRepublic: String,
    modifier: Modifier,
) {
    val formatter = AfishaTheme.formatter
    val clock = AfishaTheme.clock
    val cityFilter: (SearchFilters) -> SearchFilters = { f -> state.cityId?.let { f.copy(municipalities = setOf(it)) } ?: f }
    LazyColumn(
        modifier = modifier,
        contentPadding = PaddingValues(bottom = Tokens.Space.S6),
        verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
    ) {
        val feed = state.feed
        if (feed is LoadState.Ready && feed.fromCache) {
            item(key = "offline") {
                val savedAt = feed.savedAtMillis?.let { DateFormat.getTimeInstance(DateFormat.SHORT).format(Date(it)) }.orEmpty()
                OfflineBanner(stringResource(DsR.string.state_offline_cached, savedAt), onRetry = viewModel::refresh)
            }
        }
        if (state.simpleMode) {
            item(key = "simple") { SimpleModeButtons(actions, onToday = { viewModel.selectDay(HomeDay.Today) }) }
        }
        item(key = "days") {
            DaySelector(state.day, onSelect = viewModel::selectDay, weekendLabel = formatter.dateRange(clock.weekendRange()))
        }
        if (!state.simpleMode) {
            item(key = "umbrella") {
                KuraiUmbrella(
                    selected = emptySet(),
                    counts = state.categoryCounts,
                    onSelect = { category ->
                        actions.openSearch(cityFilter(SearchFilters(whenPreset = state.day.preset, categories = setOfNotNull(category))))
                    },
                )
            }
        }
        val feedTitle = when (state.day) {
            HomeDay.Today -> formatter.dayHeader(clock.today())
            HomeDay.Tomorrow -> formatter.dayHeader(clock.today().plusDays(1))
            HomeDay.Weekend -> formatter.dateRange(clock.weekendRange())
        }
        item(key = "feed-title") {
            SectionHeader(
                title = feedTitle,
                actionLabel = if (state.total > 0) stringResource(R.string.home_show_all, state.total) else null,
                onAction = { actions.openSearch(cityFilter(SearchFilters(whenPreset = state.day.preset))) },
            )
        }
        when (feed) {
            LoadState.Loading -> items(3, key = { "sk$it" }) { EventCardSkeleton(Modifier.padding(horizontal = Tokens.Space.S4)) }
            is LoadState.Failed -> item(key = "error") { ErrorState(feed.error, onRetry = viewModel::refresh) }
            is LoadState.Ready -> {
                if (feed.value.isEmpty()) {
                    item(key = "empty") {
                        if (state.cityId != null) {
                            EmptyState(
                                mood = BeeMood.NotFound,
                                text = stringResource(R.string.home_empty, state.cityName ?: wholeRepublic),
                                actionLabel = stringResource(R.string.home_empty_action_city),
                                onAction = { viewModel.selectCity(null) },
                            )
                        } else {
                            EmptyState(
                                mood = BeeMood.NotFound,
                                text = stringResource(R.string.home_empty_all),
                                actionLabel = stringResource(R.string.home_empty_action_guide),
                                onAction = { actions.openAssistant(null) },
                            )
                        }
                    }
                } else {
                    val visible = if (state.simpleMode) feed.value else feed.value.take(FEED_PREVIEW)
                    items(visible, key = { "f" + it.id }) { occ ->
                        EventCard(
                            occurrence = occ,
                            isFavorite = occ.event.id in favoriteIds,
                            onClick = { actions.openEvent(occ.event.id) },
                            onFavoriteChange = { viewModel.toggleFavorite(occ) },
                            modifier = Modifier.padding(horizontal = Tokens.Space.S4).animateItem(),
                        )
                    }
                }
            }
        }
        if (!state.simpleMode) {
            item(key = "guide") { GuidePromo(onClick = { actions.openAssistant(null) }) }
            Collection.entries.forEach { c ->
                val list = state.collections[c] ?: return@forEach
                item(key = "c-title-${c.name}") {
                    SectionHeader(
                        title = stringResource(c.titleRes()),
                        actionLabel = stringResource(R.string.home_all),
                        onAction = { actions.openSearch(cityFilter(c.filters)) },
                    )
                }
                item(key = "c-row-${c.name}") {
                    LazyRow(
                        contentPadding = PaddingValues(horizontal = Tokens.Space.S4),
                        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
                    ) {
                        items(list, key = { c.name + it.id }) { occ ->
                            EventCard(
                                occurrence = occ,
                                isFavorite = occ.event.id in favoriteIds,
                                onClick = { actions.openEvent(occ.event.id) },
                                onFavoriteChange = { viewModel.toggleFavorite(occ) },
                                compact = true,
                                modifier = Modifier.width(320.dp),
                            )
                        }
                    }
                }
            }
            state.stats?.let { s ->
                item(key = "stats") {
                    Text(
                        stringResource(
                            R.string.home_stats,
                            formatter.money(s.events.toBigDecimal()),
                            formatter.money(s.venues.toBigDecimal()),
                            s.municipalitiesWithEvents,
                        ),
                        style = AfishaTheme.type.caption,
                        color = AfishaTheme.colors.ink2,
                        modifier = Modifier.padding(horizontal = Tokens.Space.S4),
                    )
                }
            }
        }
    }
}

private const val FEED_PREVIEW = 12

private fun Collection.titleRes(): Int = when (this) {
    Collection.Free -> R.string.home_collection_free
    Collection.Kids -> R.string.home_collection_kids
    Collection.Pushkin -> R.string.home_collection_pushkin
    Collection.OnBashkir -> R.string.home_collection_on_bashkir
}

@Composable
private fun DaySelector(selected: HomeDay, onSelect: (HomeDay) -> Unit, weekendLabel: String) {
    val labels = listOf(
        HomeDay.Today to stringResource(R.string.home_today),
        HomeDay.Tomorrow to stringResource(R.string.home_tomorrow),
        HomeDay.Weekend to stringResource(R.string.home_weekend),
    )
    SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = Tokens.Space.S4)) {
        labels.forEachIndexed { index, (day, label) ->
            SegmentedButton(
                selected = day == selected,
                onClick = { onSelect(day) },
                shape = SegmentedButtonDefaults.itemShape(index, labels.size),
                modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid),
                label = {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text(label, maxLines = 1)
                        if (day == HomeDay.Weekend) Text(weekendLabel, style = AfishaTheme.type.caption, maxLines = 1)
                    }
                },
            )
        }
    }
}

@Composable
private fun GuidePromo(onClick: () -> Unit) {
    val colors = AfishaTheme.colors
    Row(
        Modifier
            .padding(horizontal = Tokens.Space.S4)
            .fillMaxWidth()
            .background(colors.surface2, RoundedCornerShape(Tokens.Radius.L))
            .padding(Tokens.Space.S4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BeeMascot(BeeMood.Greeting, size = 72.dp, decorative = true)
        Spacer(Modifier.width(Tokens.Space.S3))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S1)) {
            Text(stringResource(R.string.home_guide_title), style = AfishaTheme.type.title, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.home_guide_text), style = AfishaTheme.type.caption, color = colors.ink2)
            Button(onClick = onClick, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) {
                Icon(Icons.Outlined.AutoAwesome, contentDescription = null)
                Spacer(Modifier.width(Tokens.Space.S2))
                Text(stringResource(R.string.home_guide_action))
            }
        }
    }
}

/** Режим «Просто»: три большие кнопки (docs/08-mobile.md §4). */
@Composable
private fun SimpleModeButtons(actions: HomeActions, onToday: () -> Unit) {
    Column(Modifier.padding(horizontal = Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3)) {
        BigButton(stringResource(R.string.home_simple_today), Icons.Outlined.Today, onToday)
        BigButton(stringResource(R.string.home_simple_near), Icons.Outlined.NearMe, actions.openNearMe)
        BigButton(stringResource(R.string.home_simple_guide), Icons.Outlined.AutoAwesome) { actions.openAssistant(null) }
    }
}

@Composable
private fun BigButton(text: String, icon: androidx.compose.ui.graphics.vector.ImageVector, onClick: () -> Unit) {
    FilledTonalButton(onClick = onClick, modifier = Modifier.fillMaxWidth().heightIn(min = 72.dp)) {
        Icon(icon, contentDescription = null, modifier = Modifier.padding(end = Tokens.Space.S3))
        Text(text, style = AfishaTheme.type.h2)
    }
}

