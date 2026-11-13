package ru.tamasha.afisha.feature.event

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Directions
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.tamasha.afisha.core.designsystem.component.EmptyState
import ru.tamasha.afisha.core.designsystem.component.ErrorState
import ru.tamasha.afisha.core.designsystem.component.EventCard
import ru.tamasha.afisha.core.designsystem.component.LoadingState
import ru.tamasha.afisha.core.designsystem.component.SectionHeader
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.LoadState

/** Страница площадки: адрес, маршрут, доступность и ближайшие события. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun VenueScreen(actions: EventActions, viewModel: VenueViewModel = hiltViewModel()) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val favoriteIds by viewModel.favoriteIds.collectAsStateWithLifecycle()
    val context = LocalContext.current
    Scaffold(
        containerColor = AfishaTheme.colors.bg,
        topBar = {
            TopAppBar(
                title = { Text(state.valueOrNull?.venue?.name ?: stringResource(R.string.venue_title), maxLines = 1, style = AfishaTheme.type.title) },
                navigationIcon = { IconButton(onClick = actions.back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, stringResource(R.string.event_back)) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg),
            )
        },
    ) { padding ->
        when (val s = state) {
            LoadState.Loading -> LoadingState(Modifier.padding(padding))
            is LoadState.Failed -> ErrorState(s.error, viewModel::load, Modifier.padding(padding))
            is LoadState.Ready -> {
                val v = s.value
                LazyColumn(
                    Modifier.padding(padding).fillMaxSize(),
                    contentPadding = PaddingValues(bottom = Tokens.Space.S6),
                    verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
                ) {
                    item(key = "head") {
                        Column(Modifier.padding(horizontal = Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                            Text(v.venue.name, style = AfishaTheme.type.h1, modifier = Modifier.semantics { heading() })
                            listOfNotNull(v.venue.address, v.venue.municipality, v.organization).distinct().forEach {
                                Text(it, style = AfishaTheme.type.body, color = AfishaTheme.colors.ink2)
                            }
                            OutlinedButton(onClick = { PlatformActions.openRoute(context, v.venue) }, modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid)) {
                                Icon(Icons.Outlined.Directions, contentDescription = null)
                                Spacer(Modifier.width(Tokens.Space.S2))
                                Text(stringResource(R.string.event_route))
                            }
                            if (v.accessibility.isNotEmpty()) {
                                Text(stringResource(R.string.event_accessibility), style = AfishaTheme.type.title)
                                v.accessibility.values.forEach { Text(if (it == "true") stringResource(R.string.event_accessible_generic) else it, style = AfishaTheme.type.body) }
                            }
                        }
                    }
                    item(key = "upcoming") { SectionHeader(stringResource(R.string.venue_upcoming_count, v.upcomingTotal)) }
                    if (v.upcoming.isEmpty()) {
                        item(key = "empty") { EmptyState(BeeMood.Sleeping, stringResource(R.string.venue_empty)) }
                    }
                    items(v.upcoming, key = { it.id }) { occ ->
                        EventCard(
                            occurrence = occ,
                            isFavorite = occ.event.id in favoriteIds,
                            onClick = { actions.openEvent(occ.event.id) },
                            onFavoriteChange = { viewModel.toggleFavorite(occ) },
                            modifier = Modifier.padding(horizontal = Tokens.Space.S4),
                        )
                    }
                }
            }
        }
    }
}
