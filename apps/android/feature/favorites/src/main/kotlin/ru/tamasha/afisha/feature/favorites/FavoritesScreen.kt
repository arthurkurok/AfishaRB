package ru.tamasha.afisha.feature.favorites

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.SnackbarResult
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch
import ru.tamasha.afisha.core.designsystem.component.DayHeader
import ru.tamasha.afisha.core.designsystem.component.EmptyState
import ru.tamasha.afisha.core.designsystem.component.EventCard
import ru.tamasha.afisha.core.designsystem.component.LoadingState
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.Occurrence

public data class FavoritesActions(val openEvent: (String) -> Unit, val openSearch: () -> Unit)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun FavoritesScreen(actions: FavoritesActions, viewModel: FavoritesViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val scope = rememberCoroutineScope()
    val removedText = stringResource(R.string.favorites_removed)
    val undoText = stringResource(R.string.favorites_undo)
    val onRemove: (Occurrence) -> Unit = { occ ->
        viewModel.remove(occ)
        scope.launch {
            if (snackbar.showSnackbar(removedText, undoText, withDismissAction = true) == SnackbarResult.ActionPerformed) viewModel.restore(occ)
        }
    }
    Scaffold(
        contentWindowInsets = WindowInsets(0),
        containerColor = AfishaTheme.colors.bg,
        snackbarHost = { SnackbarHost(snackbar) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(stringResource(R.string.favorites_title), style = AfishaTheme.type.h1)
                        Text(stringResource(R.string.favorites_subtitle), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg),
            )
        },
    ) { padding ->
        when {
            state.loading -> LoadingState(Modifier.padding(padding))
            state.isEmpty -> EmptyState(
                mood = BeeMood.Sleeping,
                text = stringResource(R.string.favorites_empty),
                actionLabel = stringResource(R.string.favorites_empty_action),
                onAction = actions.openSearch,
                modifier = Modifier.padding(padding),
            )
            else -> LazyColumn(
                Modifier.padding(padding).fillMaxSize(),
                contentPadding = PaddingValues(bottom = Tokens.Space.S6),
                verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
            ) {
                if (state.upcoming.isNotEmpty()) {
                    item(key = "h-up") { DayHeader(stringResource(R.string.favorites_upcoming)) }
                    items(state.upcoming, key = { "u" + it.occurrence.event.id }) { item ->
                        SwipeableCard(item.occurrence, actions, onRemove, Modifier.animateItem())
                    }
                }
                if (state.past.isNotEmpty()) {
                    item(key = "h-past") { DayHeader(stringResource(R.string.favorites_past)) }
                    items(state.past, key = { "p" + it.occurrence.event.id }) { item ->
                        SwipeableCard(item.occurrence, actions, onRemove, Modifier.animateItem())
                    }
                }
            }
        }
    }
}

/** Свайп — убрать из избранного (с «Вернуть» в снекбаре); для TalkBack — действие карточки. */
@Composable
private fun SwipeableCard(occurrence: Occurrence, actions: FavoritesActions, onRemove: (Occurrence) -> Unit, modifier: Modifier) {
    val dismiss = rememberSwipeToDismissBoxState()
    SwipeToDismissBox(
        state = dismiss,
        modifier = modifier.padding(horizontal = Tokens.Space.S4),
        backgroundContent = {},
        enableDismissFromStartToEnd = false,
        onDismiss = { value -> if (value == SwipeToDismissBoxValue.EndToStart) onRemove(occurrence) },
    ) {
        EventCard(
            occurrence = occurrence,
            isFavorite = true,
            onClick = { actions.openEvent(occurrence.event.id) },
            onFavoriteChange = { if (!it) onRemove(occurrence) },
        )
    }
}
