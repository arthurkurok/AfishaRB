package ru.tamasha.afisha.core.designsystem.component

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.Municipality

/**
 * Выбор города или района (54 района + городские округа). Поиск понимает и русское,
 * и башкирское название (Өфө = Уфа). null — «Вся республика».
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
public fun CityPickerSheet(
    municipalities: List<Municipality>,
    selectedId: String?,
    onSelect: (Municipality?) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var query by rememberSaveable { mutableStateOf("") }
    val filtered = remember(municipalities, query) {
        val q = query.trim().lowercase()
        municipalities
            .filter { q.isEmpty() || it.nameRu.lowercase().contains(q) || it.nameBa?.lowercase()?.contains(q) == true || it.name.lowercase().contains(q) }
            .sortedWith(compareByDescending<Municipality> { it.isCity }.thenByDescending { it.upcoming ?: 0 })
    }
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(Modifier.padding(horizontal = Tokens.Space.S4), verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
            Text(stringResource(R.string.city_title), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                label = { Text(stringResource(R.string.city_search)) },
                leadingIcon = { Icon(Icons.Outlined.Search, contentDescription = null) },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        LazyColumn(Modifier.fillMaxWidth()) {
            if (query.isBlank()) {
                item(key = "all") {
                    CityRow(stringResource(R.string.city_all), null, selectedId == null) { onSelect(null) }
                }
            }
            items(filtered, key = { it.id }) { m ->
                val secondary = listOfNotNull(
                    m.nameBa?.takeIf { it != m.name },
                    m.nameRu.takeIf { it != m.name },
                    m.upcoming?.let { stringResource(R.string.city_upcoming, it) },
                ).joinToString(" · ")
                CityRow(m.name, secondary.ifBlank { null }, m.id == selectedId) { onSelect(m) }
            }
        }
    }
}

@Composable
private fun CityRow(title: String, subtitle: String?, selected: Boolean, onClick: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Tokens.Touch.MinAndroid)
            .clickable(role = Role.RadioButton, onClick = onClick)
            .padding(horizontal = Tokens.Space.S4, vertical = Tokens.Space.S2),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        RadioButton(selected = selected, onClick = null)
        Column(Modifier.padding(start = Tokens.Space.S3).weight(1f)) {
            Text(title, style = AfishaTheme.type.body, color = AfishaTheme.colors.ink)
            if (subtitle != null) Text(subtitle, style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
        }
    }
}
