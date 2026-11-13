package ru.tamasha.afisha.core.designsystem.component

import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.ui.res.stringResource
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.model.Category
import ru.tamasha.afisha.core.model.DisplayStatus
import ru.tamasha.afisha.core.model.EventTag
import ru.tamasha.afisha.core.model.ReasonCode

/** Подписи доменных значений из ресурсов (ru/ba). */
@StringRes
public fun Category.titleRes(): Int = when (this) {
    Category.Theatre -> R.string.category_theatre
    Category.Music -> R.string.category_music
    Category.Museum -> R.string.category_museum
    Category.Kids -> R.string.category_kids
    Category.Folk -> R.string.category_folk
    Category.Cinema -> R.string.category_cinema
    Category.Education -> R.string.category_education
}

@StringRes
public fun Category.shortTitleRes(): Int = when (this) {
    Category.Theatre -> R.string.category_short_theatre
    Category.Music -> R.string.category_short_music
    Category.Museum -> R.string.category_short_museum
    Category.Kids -> R.string.category_short_kids
    Category.Folk -> R.string.category_short_folk
    Category.Cinema -> R.string.category_short_cinema
    Category.Education -> R.string.category_short_education
}

@StringRes
public fun DisplayStatus.labelRes(): Int? = when (this) {
    DisplayStatus.None -> null
    DisplayStatus.FewLeft -> R.string.status_few_left
    DisplayStatus.SoldOut -> R.string.status_sold_out
    DisplayStatus.Rescheduled -> R.string.status_rescheduled
    DisplayStatus.Postponed -> R.string.status_postponed
    DisplayStatus.Cancelled -> R.string.status_cancelled
    DisplayStatus.Ended -> R.string.status_ended
    DisplayStatus.Unverified -> R.string.status_unverified
}

@Composable
public fun DisplayStatus.label(): String? = labelRes()?.let { stringResource(it) }

@StringRes
public fun ReasonCode.labelRes(): Int = when (this) {
    ReasonCode.AgeFit -> R.string.reason_age_fit
    ReasonCode.BudgetFit -> R.string.reason_budget_fit
    ReasonCode.Free -> R.string.reason_free
    ReasonCode.Near -> R.string.reason_near
    ReasonCode.TimeFit -> R.string.reason_time_fit
    ReasonCode.CategoryMatch -> R.string.reason_category_match
    ReasonCode.Pushkin -> R.string.reason_pushkin
    ReasonCode.Accessible -> R.string.reason_accessible
    ReasonCode.Popular -> R.string.reason_popular
    ReasonCode.New -> R.string.reason_new
    ReasonCode.LastChance -> R.string.reason_last_chance
    ReasonCode.OnBashkir -> R.string.reason_on_bashkir
    ReasonCode.TextMatch -> R.string.reason_text_match
}

@StringRes
public fun EventTag.labelRes(): Int = when (this) {
    EventTag.Free -> R.string.tag_free
    EventTag.Pushkin -> R.string.tag_pushkin
    EventTag.Premiere -> R.string.tag_premiere
    EventTag.Family -> R.string.tag_family
    EventTag.Youth -> R.string.tag_youth
    EventTag.Accessible -> R.string.tag_accessible
    EventTag.OnBashkir -> R.string.tag_on_bashkir
    EventTag.Outdoor -> R.string.tag_outdoor
    EventTag.MasterClass -> R.string.tag_master_class
    EventTag.Excursion -> R.string.tag_excursion
    EventTag.Festival -> R.string.tag_festival
}
