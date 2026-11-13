package ru.tamasha.afisha.feature.search

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.LocationOn
import androidx.compose.material.icons.outlined.Remove
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DateRangePicker
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDateRangePickerState
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
import ru.tamasha.afisha.core.designsystem.component.CityPickerSheet
import ru.tamasha.afisha.core.designsystem.component.shortTitleRes
import ru.tamasha.afisha.core.designsystem.illustration.CategoryIcon
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.AGE_RATINGS
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.EventTag
import ru.tamasha.afisha.core.model.Municipality
import ru.tamasha.afisha.core.model.PRICE_STEPS
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.SortOrder
import ru.tamasha.afisha.core.model.TimeOfDay
import ru.tamasha.afisha.core.model.WhenPreset
import ru.tamasha.afisha.core.designsystem.R as DsR
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * Все фильтры поиска (docs/03-functional-spec.md §1.2) в нижнем листе.
 * Изменения копятся в черновике и применяются кнопкой «Показать» — выдача не дёргается на каждый тап.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
internal fun FilterSheet(
    initial: SearchFilters,
    municipalities: List<Municipality>,
    onApply: (SearchFilters) -> Unit,
    onDismiss: () -> Unit,
) {
    var draft by remember { mutableStateOf(initial) }
    var cityPicker by rememberSaveable { mutableStateOf(false) }
    var datePicker by rememberSaveable { mutableStateOf(false) }
    val formatter = AfishaTheme.formatter
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = Tokens.Space.S4)
                .navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(Tokens.Space.S3),
        ) {
            Text(stringResource(R.string.filter_title), style = AfishaTheme.type.h2, modifier = Modifier.semantics { heading() })

            // Когда
            Section(stringResource(R.string.filter_when)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                    listOf(
                        WhenPreset.Today to R.string.when_today,
                        WhenPreset.Tomorrow to R.string.when_tomorrow,
                        WhenPreset.Weekend to R.string.when_weekend,
                        WhenPreset.Week to R.string.when_week,
                        WhenPreset.Month to R.string.when_month,
                    ).forEach { (p, label) ->
                        FilterChip(
                            selected = draft.dateFrom == null && draft.whenPreset == p,
                            onClick = { draft = draft.copy(whenPreset = p, dateFrom = null, dateTo = null) },
                            label = { Text(stringResource(label)) },
                        )
                    }
                    val custom = draft.dateFrom?.let { from ->
                        val f = LocalDate.parse(from)
                        val t = draft.dateTo?.let(LocalDate::parse) ?: f
                        formatter.dateRange(ru.tamasha.afisha.core.model.DateRange(f, t))
                    }
                    FilterChip(
                        selected = custom != null,
                        onClick = { datePicker = true },
                        label = { Text(custom ?: stringResource(R.string.when_dates)) },
                        leadingIcon = { Icon(Icons.Outlined.DateRange, contentDescription = null) },
                    )
                }
            }

            Section(stringResource(R.string.filter_time_of_day)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                    listOf(TimeOfDay.Morning to R.string.tod_morning, TimeOfDay.Day to R.string.tod_day, TimeOfDay.Evening to R.string.tod_evening)
                        .forEach { (t, label) ->
                            FilterChip(
                                selected = t in draft.timeOfDay,
                                onClick = { draft = draft.copy(timeOfDay = draft.timeOfDay.toggle(t)) },
                                label = { Text(stringResource(label)) },
                            )
                        }
                }
            }

            // Где
            Section(stringResource(R.string.filter_place)) {
                val selectedNames = draft.municipalities.mapNotNull { id -> municipalities.firstOrNull { it.id == id }?.name ?: id }
                AssistChip(
                    onClick = { cityPicker = true },
                    label = {
                        Text(
                            when {
                                draft.near != null -> stringResource(R.string.search_near_me)
                                selectedNames.isEmpty() -> stringResource(DsR.string.city_all)
                                else -> selectedNames.joinToString()
                            },
                        )
                    },
                    leadingIcon = { Icon(Icons.Outlined.LocationOn, contentDescription = null) },
                    modifier = Modifier.heightIn(min = Tokens.Touch.MinAndroid),
                )
            }

            Section(stringResource(R.string.filter_categories)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                    Category.entries.forEach { c ->
                        FilterChip(
                            selected = c in draft.categories,
                            onClick = { draft = draft.copy(categories = draft.categories.toggle(c)) },
                            label = { Text(stringResource(c.shortTitleRes())) },
                            leadingIcon = { CategoryIcon(c, tint = AfishaTheme.colors.category(c), size = Tokens.Space.S5) },
                        )
                    }
                }
            }

            Section(stringResource(R.string.filter_price)) {
                FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                    FilterChip(
                        selected = !draft.freeOnly && draft.priceMax == null,
                        onClick = { draft = draft.copy(freeOnly = false, priceMax = null) },
                        label = { Text(stringResource(R.string.price_any)) },
                    )
                    FilterChip(
                        selected = draft.freeOnly,
                        onClick = { draft = draft.copy(freeOnly = true, priceMax = null) },
                        label = { Text(stringResource(R.string.price_free)) },
                    )
                    PRICE_STEPS.forEach { p ->
                        FilterChip(
                            selected = !draft.freeOnly && draft.priceMax == p,
                            onClick = { draft = draft.copy(freeOnly = false, priceMax = p) },
                            label = { Text(stringResource(R.string.price_up_to, formatter.money(p.toBigDecimal()))) },
                        )
                    }
                }
            }

            Section(stringResource(R.string.filter_age)) {
                SwitchRow(stringResource(R.string.age_with_child), draft.childAge != null) { on ->
                    draft = draft.copy(childAge = if (on) DEFAULT_CHILD_AGE else null, ageRatingMax = null)
                }
                draft.childAge?.let { age ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        IconButton(onClick = { draft = draft.copy(childAge = (age - 1).coerceAtLeast(0)) }) {
                            Icon(Icons.Outlined.Remove, contentDescription = stringResource(R.string.decrease))
                        }
                        Text(stringResource(R.string.age_child_years, age), style = AfishaTheme.type.title)
                        IconButton(onClick = { draft = draft.copy(childAge = (age + 1).coerceAtMost(MAX_CHILD_AGE)) }) {
                            Icon(Icons.Outlined.Add, contentDescription = stringResource(R.string.increase))
                        }
                    }
                    Text(stringResource(R.string.age_child_hint), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
                }
                if (draft.childAge == null) {
                    Text(stringResource(R.string.age_rating_max), style = AfishaTheme.type.caption, color = AfishaTheme.colors.ink2)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
                        FilterChip(selected = draft.ageRatingMax == null, onClick = { draft = draft.copy(ageRatingMax = null) }, label = { Text(stringResource(R.string.age_any)) })
                        AGE_RATINGS.forEach { r ->
                            FilterChip(selected = draft.ageRatingMax == r, onClick = { draft = draft.copy(ageRatingMax = r) }, label = { Text(formatter.age(r)) })
                        }
                    }
                }
            }

            Section(stringResource(R.string.filter_more)) {
                SwitchRow(stringResource(R.string.filter_pushkin), draft.pushkin) { draft = draft.copy(pushkin = it) }
                SwitchRow(stringResource(R.string.filter_accessible), draft.accessible) { draft = draft.copy(accessible = it) }
                SwitchRow(stringResource(R.string.filter_on_bashkir), EventTag.OnBashkir in draft.tags) {
                    draft = draft.copy(tags = if (it) draft.tags + EventTag.OnBashkir else draft.tags - EventTag.OnBashkir)
                }
                SwitchRow(stringResource(R.string.filter_hide_sold_out), draft.hideSoldOut) { draft = draft.copy(hideSoldOut = it) }
            }

            Section(stringResource(R.string.filter_sort)) {
                listOf(
                    SortOrder.Relevance to R.string.sort_relevance,
                    SortOrder.Date to R.string.sort_date,
                    SortOrder.Price to R.string.sort_price,
                    SortOrder.Distance to R.string.sort_distance,
                    SortOrder.Popular to R.string.sort_popular,
                ).forEach { (s, label) ->
                    val enabled = s != SortOrder.Distance || draft.near != null
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .heightIn(min = Tokens.Touch.MinAndroid)
                            .selectable(selected = draft.sort == s, enabled = enabled, role = Role.RadioButton) { draft = draft.copy(sort = s) },
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        RadioButton(selected = draft.sort == s, onClick = null, enabled = enabled)
                        Spacer(Modifier.width(Tokens.Space.S2))
                        Text(stringResource(label), color = if (enabled) AfishaTheme.colors.ink else AfishaTheme.colors.ink2)
                    }
                }
            }

            HorizontalDivider()
            Row(horizontalArrangement = Arrangement.spacedBy(Tokens.Space.S3), modifier = Modifier.padding(bottom = Tokens.Space.S4)) {
                OutlinedButton(
                    onClick = { draft = SearchFilters(query = initial.query) },
                    modifier = Modifier.weight(1f).heightIn(min = Tokens.Touch.MinAndroid),
                ) { Text(stringResource(R.string.filter_reset)) }
                Button(
                    onClick = { onApply(draft) },
                    modifier = Modifier.weight(1f).heightIn(min = Tokens.Touch.MinAndroid),
                ) { Text(stringResource(R.string.filter_apply)) }
            }
        }
    }

    if (cityPicker) {
        CityPickerSheet(
            municipalities = municipalities,
            selectedId = draft.municipalities.firstOrNull(),
            onSelect = { m ->
                draft = draft.copy(municipalities = setOfNotNull(m?.id), near = null, sort = if (draft.sort == SortOrder.Distance) SortOrder.Relevance else draft.sort)
                cityPicker = false
            },
            onDismiss = { cityPicker = false },
        )
    }

    if (datePicker) {
        val today = AfishaTheme.clock.today()
        val pickerState = rememberDateRangePickerState(
            initialSelectedStartDateMillis = draft.dateFrom?.let { LocalDate.parse(it).toEpochMillis() },
            initialSelectedEndDateMillis = draft.dateTo?.let { LocalDate.parse(it).toEpochMillis() },
            yearRange = today.year..(today.year + 1),
        )
        DatePickerDialog(
            onDismissRequest = { datePicker = false },
            confirmButton = {
                TextButton(onClick = {
                    val from = pickerState.selectedStartDateMillis?.toLocalDate()
                    val to = pickerState.selectedEndDateMillis?.toLocalDate() ?: from
                    if (from != null) draft = draft.copy(dateFrom = from.toString(), dateTo = to.toString(), whenPreset = null)
                    datePicker = false
                }) { Text(stringResource(R.string.date_picker_ok)) }
            },
            dismissButton = { TextButton(onClick = { datePicker = false }) { Text(stringResource(R.string.date_picker_cancel)) } },
        ) {
            DateRangePicker(state = pickerState, title = { Text(stringResource(R.string.date_picker_title), modifier = Modifier.padding(Tokens.Space.S4)) })
        }
    }
}

private const val DEFAULT_CHILD_AGE = 5
private const val MAX_CHILD_AGE = 17

/** DatePicker работает в UTC-миллисекундах полуночи — переводим без участия пояса устройства. */
private fun LocalDate.toEpochMillis(): Long = atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli()
private fun Long.toLocalDate(): LocalDate = Instant.ofEpochMilli(this).atOffset(ZoneOffset.UTC).toLocalDate()

private fun <T> Set<T>.toggle(value: T): Set<T> = if (value in this) this - value else this + value

@Composable
private fun Section(title: String, content: @Composable () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(Tokens.Space.S2)) {
        Text(title, style = AfishaTheme.type.title, modifier = Modifier.semantics { heading() })
        content()
    }
}

@Composable
private fun SwitchRow(text: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = Tokens.Touch.MinAndroid)
            .toggleable(value = checked, role = Role.Switch, onValueChange = onChange),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = AfishaTheme.type.body, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = null)
    }
}
