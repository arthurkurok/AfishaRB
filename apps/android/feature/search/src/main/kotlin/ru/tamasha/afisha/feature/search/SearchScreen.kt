package ru.tamasha.afisha.feature.search

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.NearMe
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Badge
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.designsystem.component.DayHeader
import ru.tamasha.afisha.core.designsystem.component.EmptyState
import ru.tamasha.afisha.core.designsystem.component.ErrorState
import ru.tamasha.afisha.core.designsystem.component.EventCard
import ru.tamasha.afisha.core.designsystem.component.EventCardSkeleton
import ru.tamasha.afisha.core.designsystem.illustration.BeeLoader
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.WhenPreset
import ru.tamasha.afisha.core.designsystem.component.rememberLocationPermissionRequest
import androidx.compose.ui.unit.dp

/** Навигация из поиска (связывает :app). «Назад» показывается, если поиск открыт не вкладкой. */
public data class SearchActions(
    val openEvent: (String) -> Unit,
    val openAssistant: (String?) -> Unit,
    val back: () -> Unit,
)

@OptIn(ExperimentalFoundationApi::class)
@Composable
public fun SearchScreen(actions: SearchActions, viewModel: SearchViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val query by viewModel.query.collectAsStateWithLifecycle()
    val favoriteIds by viewModel.favoriteIds.collectAsStateWithLifecycle()
    val municipalities by viewModel.municipalities.collectAsStateWithLifecycle()
    var showFilters by rememberSaveable { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val keyboard = LocalSoftwareKeyboardController.current
    val deniedText = stringResource(R.string.search_location_denied)
    val sections = remember(state.items) { viewModel.sections(state.items) }
    val requestLocation = rememberLocationPermissionRequest { granted ->
        if (granted) viewModel.useMyLocation() else scope.launch { snackbar.showSnackbar(deniedText) }
    }

    LaunchedEffect(Unit) { if (viewModel.requestNearMeOnStart && state.filters.near == null) requestLocation() }

    // Подгрузка следующей страницы, когда до конца осталось несколько карточек
    val nearEnd by remember {
        derivedStateOf {
            val last = listState.layoutInfo.visibleItemsInfo.lastOrNull()?.index ?: 0
            last >= listState.layoutInfo.totalItemsCount - 4
        }
    }
    LaunchedEffect(nearEnd, state.nextCursor) { if (nearEnd) viewModel.loadMore() }

    Scaffold(
        contentWindowInsets = WindowInsets(0),
        containerColor = AfishaTheme.colors.bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            Row(
                Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(WindowInsets.statusBars)
                    .padding(horizontal = Tokens.Space.S2, vertical = Tokens.Space.S2),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                if (viewModel.showBack) {
                    IconButton(onClick = actions.back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = stringResource(R.string.search_back)) }
                }
                OutlinedTextField(
                    value = query,
                    onValueChange = viewModel::onQueryChange,
                    placeholder = { Text(stringResource(R.string.search_hint)) },
                    leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                    trailingIcon = {
                        if (query.isNotEmpty()) {
                            IconButton(onClick = { viewModel.onQueryChange("") }) {
                                Icon(Icons.Outlined.Close, contentDescription = stringResource(R.string.search_clear))
                            }
                        }
                    },
                    singleLine = true,
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                    keyboardActions = KeyboardActions(onSearch = { keyboard?.hide() }),
                    modifier = Modifier.weight(1f).padding(horizontal = Tokens.Space.S2),
                )
                val count = state.filters.activeCount
                IconButton(onClick = { showFilters = true }) {
                    BadgedBox(badge = { if (count > 0) Badge { Text(count.toString()) } }) {
                        Icon(
                            Icons.Outlined.Tune,
                            contentDescription = if (count > 0) stringResource(R.string.search_filters_count, count) else stringResource(R.string.search_filters),
                        )
                    }
                }
            }
        },
    ) { padding ->
        LazyColumn(
            state = listState,
            modifier = Modifier.padding(padding).fillMaxSize(),
            contentPadding = PaddingValues(bottom = Tokens.Space.S6),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
        ) {
            item(key = "presets") {
                PresetRow(
                    selected = state.filters.whenPreset.takeIf { state.filters.dateFrom == null },
                    onSelect = { viewModel.applyFilters(state.filters.copy(whenPreset = it, dateFrom = null, dateTo = null)) },
                    nearSelected = state.filters.near != null,
                    onNearMe = {
                        if (state.filters.near != null) viewModel.applyFilters(state.filters.copy(near = null)) else requestLocation()
                    },
                )
            }
            if (state.locating) item(key = "locating") { Row(Modifier.padding(horizontal = Tokens.Space.S4)) { BeeLoader(size = 32.dp)
                    Text(stringResource(R.string.search_locating), style = AfishaTheme.type.caption) } }
            when {
                state.loading -> items(4, key = { "sk$it" }) { EventCardSkeleton(Modifier.padding(horizontal = Tokens.Space.S4)) }
                state.error != null -> item(key = "error") { ErrorState(state.error, onRetry = viewModel::retry) }
                state.isEmpty -> item(key = "empty") {
                    EmptyState(
                        mood = BeeMood.NotFound,
                        text = stringResource(R.string.search_empty),
                        actionLabel = if (state.filters.activeCount > 0) stringResource(R.string.search_reset) else stringResource(R.string.search_ask_guide),
                        onAction = { if (state.filters.activeCount > 0) viewModel.resetFilters() else actions.openAssistant(query.ifBlank { null }) },
                    )
                }
                else -> {
                    item(key = "found") {
                        Text(
                            stringResource(R.string.search_found, state.total),
                            style = AfishaTheme.type.caption,
                            color = AfishaTheme.colors.ink2,
                            modifier = Modifier.padding(horizontal = Tokens.Space.S4).semantics { liveRegion = LiveRegionMode.Polite },
                        )
                    }
                    sections.forEach { section ->
                        stickyHeader(key = "h-${section.date ?: "range"}") {
                            DayHeader(section.date?.let { AfishaTheme.formatter.dayHeader(it) } ?: stringResource(R.string.search_long_running))
                        }
                        items(section.items, key = { "o" + it.id }) { occ ->
                            EventCard(
                                occurrence = occ,
                                isFavorite = occ.event.id in favoriteIds,
                                onClick = { actions.openEvent(occ.event.id) },
                                onFavoriteChange = { viewModel.toggleFavorite(occ) },
                                modifier = Modifier.padding(horizontal = Tokens.Space.S4).animateItem(),
                            )
                        }
                    }
                    if (state.appending) item(key = "append") { Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { BeeLoader(size = 48.dp) } }
                    if (state.appendError) {
                        item(key = "append-error") {
                            TextButton(onClick = viewModel::loadMore, modifier = Modifier.fillMaxWidth().heightIn(min = Tokens.Touch.MinAndroid)) {
                                Text(stringResource(R.string.search_load_more_error))
                            }
                        }
                    }
                }
            }
        }
    }

    if (showFilters) {
        FilterSheet(
            initial = state.filters,
            municipalities = municipalities,
            onApply = { viewModel.applyFilters(it); showFilters = false },
            onDismiss = { showFilters = false },
        )
    }
}

@Composable
private fun PresetRow(selected: WhenPreset?, onSelect: (WhenPreset) -> Unit, nearSelected: Boolean, onNearMe: () -> Unit) {
    val presets = listOf(
        WhenPreset.Today to R.string.when_today,
        WhenPreset.Tomorrow to R.string.when_tomorrow,
        WhenPreset.Weekend to R.string.when_weekend,
        WhenPreset.Week to R.string.when_week,
        WhenPreset.Month to R.string.when_month,
    )
    LazyRow(
        contentPadding = PaddingValues(horizontal = Tokens.Space.S4),
        horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2),
    ) {
        item(key = "near") {
            FilterChip(
                selected = nearSelected,
                onClick = onNearMe,
                label = { Text(stringResource(R.string.search_near_me)) },
                leadingIcon = { Icon(Icons.Outlined.NearMe, contentDescription = null) },
                modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid),
            )
        }
        items(presets, key = { it.first.code }) { (preset, label) ->
            FilterChip(
                selected = preset == selected,
                onClick = { onSelect(preset) },
                label = { Text(stringResource(label)) },
                modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid),
            )
        }
    }
}
