package ru.tamasha.afisha.feature.settings

import android.content.Intent
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.automirrored.outlined.KeyboardArrowRight
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.core.net.toUri
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import ru.tamasha.afisha.core.designsystem.component.CityPickerSheet
import ru.tamasha.afisha.core.designsystem.component.LoadingState
import ru.tamasha.afisha.core.designsystem.illustration.BeeMascot
import ru.tamasha.afisha.core.designsystem.illustration.BeeMood
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.ThemeMode
import ru.tamasha.afisha.core.designsystem.R as DsR

@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun SettingsScreen(actions: SettingsActions, viewModel: SettingsViewModel = hiltViewModel()) {
    val settings by viewModel.state.collectAsStateWithLifecycle()
    val municipalities by viewModel.municipalities.collectAsStateWithLifecycle()
    var cityPicker by rememberSaveable { mutableStateOf(false) }
    val context = LocalContext.current
    Scaffold(
        containerColor = AfishaTheme.colors.bg,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title), style = AfishaTheme.type.h1) },
                navigationIcon = {
                    actions.back?.let { IconButton(onClick = it) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, stringResource(R.string.settings_back)) } }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg),
            )
        },
    ) { padding ->
        val s = settings
        if (s == null) {
            LoadingState(Modifier.padding(padding))
            return@Scaffold
        }
        LazyColumn(Modifier.padding(padding).fillMaxSize(), contentPadding = PaddingValues(bottom = Tokens.Space.S6)) {
            item { Header(stringResource(R.string.settings_language)) }
            item {
                Column(Modifier.selectableGroup()) {
                    RadioRow(stringResource(R.string.settings_language_ru), s.language == AppLanguage.Ru) { viewModel.setLanguage(AppLanguage.Ru) }
                    RadioRow(stringResource(R.string.settings_language_ba), s.language == AppLanguage.Ba) { viewModel.setLanguage(AppLanguage.Ba) }
                }
            }
            if (s.language == AppLanguage.Ba) {
                item {
                    Column(Modifier.padding(horizontal = Tokens.Space.S4)) {
                        Text(stringResource(R.string.settings_language_note), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
                        TextButton(onClick = {
                            val intent = Intent(Intent.ACTION_SENDTO, "mailto:".toUri())
                                .putExtra(Intent.EXTRA_SUBJECT, context.getString(R.string.settings_suggest_translation))
                            runCatching { context.startActivity(intent) }
                        }) { Text(stringResource(R.string.settings_suggest_translation)) }
                    }
                }
            }
            item { Header(stringResource(R.string.settings_city)) }
            item {
                NavRow(
                    title = s.municipalityName ?: stringResource(DsR.string.city_all),
                    subtitle = stringResource(R.string.settings_city_hint),
                ) {
                    viewModel.loadMunicipalities()
                    cityPicker = true
                }
            }
            item { Header(stringResource(R.string.settings_appearance)) }
            item {
                Column(Modifier.selectableGroup()) {
                    Text(stringResource(R.string.settings_theme), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2, modifier = Modifier.padding(horizontal = Tokens.Space.S4))
                    RadioRow(stringResource(R.string.settings_theme_system), s.themeMode == ThemeMode.System) { viewModel.setTheme(ThemeMode.System) }
                    RadioRow(stringResource(R.string.settings_theme_light), s.themeMode == ThemeMode.Light) { viewModel.setTheme(ThemeMode.Light) }
                    RadioRow(stringResource(R.string.settings_theme_dark), s.themeMode == ThemeMode.Dark) { viewModel.setTheme(ThemeMode.Dark) }
                }
            }
            item { SwitchRow(stringResource(R.string.settings_large_text), stringResource(R.string.settings_large_text_hint), s.largeText, viewModel::setLargeText) }
            item { SwitchRow(stringResource(R.string.settings_simple), stringResource(R.string.settings_simple_hint), s.simpleMode, viewModel::setSimpleMode) }
            item { Header(stringResource(R.string.settings_recommendations)) }
            item { NavRow(stringResource(R.string.settings_rules), null, actions.openRules) }
            item { Header(stringResource(R.string.settings_notifications)) }
            item {
                SwitchRow(stringResource(R.string.settings_alerts), stringResource(R.string.settings_alerts_hint), s.favoriteAlerts, onChange = { on ->
                    viewModel.setFavoriteAlerts(on)
                    if (on) actions.requestNotifications()
                })
            }
            item { HorizontalDivider(Modifier.padding(vertical = Tokens.Space.S3)) }
            item { NavRow(stringResource(R.string.settings_about), stringResource(R.string.about_version, actions.appInfo.versionName), actions.openAbout) }
        }
    }
    if (cityPicker) {
        CityPickerSheet(
            municipalities = municipalities,
            selectedId = settings?.municipalityId,
            onSelect = { viewModel.setCity(it); cityPicker = false },
            onDismiss = { cityPicker = false },
        )
    }
}

/** «Как работают рекомендации» — публичные правила ранжирования (docs/03-functional-spec.md §1.3). */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun RecommendationRulesScreen(back: () -> Unit, viewModel: SettingsViewModel = hiltViewModel()) {
    val s by viewModel.state.collectAsStateWithLifecycle()
    Scaffold(
        containerColor = AfishaTheme.colors.bg,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.rules_title), style = AfishaTheme.type.title) },
                navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, stringResource(R.string.settings_back)) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg),
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(Tokens.Space.S4),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
        ) {
            Text(stringResource(R.string.rules_intro), style = AfishaTheme.type.body)
            Text(stringResource(R.string.rules_factors), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
            listOf(R.string.rules_factor_1, R.string.rules_factor_2, R.string.rules_factor_3, R.string.rules_factor_4, R.string.rules_factor_5).forEach {
                Row {
                    Text("◆", color = AfishaTheme.colors.accent, modifier = Modifier.padding(end = Tokens.Space.S2))
                    Text(stringResource(it), style = AfishaTheme.type.body)
                }
            }
            Text(stringResource(R.string.rules_not_used), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.rules_not_used_text), style = AfishaTheme.type.body)
            Text(stringResource(R.string.rules_guide), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
            Text(stringResource(R.string.rules_guide_text), style = AfishaTheme.type.body)
            Text(stringResource(R.string.rules_my_settings), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
            s?.let { st ->
                SwitchRow(stringResource(R.string.rules_use_city), null, st.assistantUsesCity, viewModel::setAssistantUsesCity, horizontalPadding = false)
                SwitchRow(stringResource(R.string.rules_hide_sold_out), null, st.hideSoldOutByDefault, viewModel::setHideSoldOut, horizontalPadding = false)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun AboutScreen(info: AppInfo, back: () -> Unit) {
    val context = LocalContext.current
    var licenses by rememberSaveable { mutableStateOf(false) }
    Scaffold(
        containerColor = AfishaTheme.colors.bg,
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.about_title), style = AfishaTheme.type.title) },
                navigationIcon = { IconButton(onClick = back) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, stringResource(R.string.settings_back)) } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = AfishaTheme.colors.bg),
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(Tokens.Space.S4),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
            horizontalAlignment = Alignment.Start,
        ) {
            BeeMascot(BeeMood.Greeting, size = 120.dp, decorative = true)
            Text(stringResource(R.string.about_text), style = AfishaTheme.type.body)
            Text(stringResource(R.string.about_privacy), style = AfishaTheme.type.body, color = AfishaTheme.colors.ink2)
            Text(stringResource(R.string.about_version, info.versionName), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
            Text(stringResource(R.string.about_api, info.apiBaseUrl), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
            Text(stringResource(R.string.about_fonts), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
            TextButton(onClick = { licenses = !licenses }) { Text(stringResource(R.string.about_licenses)) }
            if (licenses) {
                listOf("licenses/OFL-GolosText.txt", "licenses/OFL-Commissioner.txt").forEach { path ->
                    val text = runCatching { context.assets.open(path).bufferedReader().use { it.readText() } }.getOrDefault("")
                    Text(text, style = AfishaTheme.type.caption)
                }
            }
        }
    }
}

@Composable
private fun Header(text: String) {
    Text(
        text,
        style = AfishaTheme.type.title,
        color = AfishaTheme.colors.accent,
        modifier = Modifier.padding(start = Tokens.Space.S4, end = Tokens.Space.S4, top = Tokens.Space.S5, bottom = Tokens.Space.S1).semantics { heading() },
    )
}

@Composable
private fun RadioRow(text: String, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Tokens.Touch.MinAndroid)
            .selectable(selected = selected, role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = Tokens.Space.S4),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Spacer(Modifier.width(Tokens.Space.S3))
        Text(text, style = AfishaTheme.type.body)
    }
}

@Composable
private fun SwitchRow(title: String, subtitle: String?, checked: Boolean, onChange: (Boolean) -> Unit, horizontalPadding: Boolean = true) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Tokens.Touch.MinAndroid)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onChange)
            .padding(horizontal = if (horizontalPadding) Tokens.Space.S4 else Tokens.Space.S1, vertical = Tokens.Space.S2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = AfishaTheme.type.body)
            if (subtitle != null) Text(subtitle, style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
        }
        Spacer(Modifier.width(Tokens.Space.S3))
        Switch(checked = checked, onCheckedChange = null)
    }
}

@Composable
private fun NavRow(title: String, subtitle: String?, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Tokens.Touch.MinAndroid)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = Tokens.Space.S4, vertical = Tokens.Space.S2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = AfishaTheme.type.body)
            if (subtitle != null) Text(subtitle, style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
        }
        Icon(Icons.AutoMirrored.Outlined.KeyboardArrowRight, contentDescription = null)
    }
}
