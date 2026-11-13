package ru.tamasha.afisha.core.network

import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.SearchFilters

/**
 * Перевод [SearchFilters] в query-параметры `/v1/occurrences`. Вынесено отдельно,
 * чтобы правила (ребёнок → age, свой диапазон важнее пресета) проверялись тестом.
 */
public data class SearchQueryParams(
    val q: String?,
    val dateFrom: String?,
    val dateTo: String?,
    val whenCode: String?,
    val timeOfDay: List<String>?,
    val municipality: List<String>?,
    val near: String?,
    val radiusKm: Double?,
    val categories: List<String>?,
    val tags: List<String>?,
    val free: Boolean?,
    val priceMax: Double?,
    val age: Int?,
    val ageRatingMax: Int?,
    val pushkin: Boolean?,
    val accessible: Boolean?,
    val hideSoldOut: Boolean?,
    val sort: String?,
) {
    public companion object {
        public fun from(f: SearchFilters): SearchQueryParams {
            val customRange = f.dateFrom != null
            return SearchQueryParams(
                q = f.query.trim().takeIf { it.isNotEmpty() },
                dateFrom = f.dateFrom,
                dateTo = f.dateTo ?: f.dateFrom,
                whenCode = if (customRange) null else f.whenPreset?.code,
                timeOfDay = f.timeOfDay.map { it.code }.sorted().takeIf { it.isNotEmpty() },
                municipality = f.municipalities.sorted().takeIf { it.isNotEmpty() && f.near == null },
                near = f.near,
                radiusKm = f.near?.let { (f.radiusKm ?: DEFAULT_RADIUS_KM).toDouble() },
                categories = f.categories.map { it.code }.sorted().takeIf { it.isNotEmpty() },
                tags = f.tags.map { it.code }.sorted().takeIf { it.isNotEmpty() },
                free = f.freeOnly.takeIf { it },
                priceMax = if (f.freeOnly) null else f.priceMax?.toDouble(),
                // «С ребёнком N лет»: сервер сам скрывает 18+ и неподходящие знаки
                age = f.childAge,
                ageRatingMax = f.childAge?.let(RegionClock::maxRatingForChild) ?: f.ageRatingMax,
                pushkin = f.pushkin.takeIf { it },
                accessible = f.accessible.takeIf { it },
                hideSoldOut = f.hideSoldOut.takeIf { it },
                sort = f.sort.code,
            )
        }

        public const val DEFAULT_RADIUS_KM: Int = 10
    }
}
