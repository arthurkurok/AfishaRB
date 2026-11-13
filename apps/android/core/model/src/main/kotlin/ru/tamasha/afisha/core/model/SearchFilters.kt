package ru.tamasha.afisha.core.model

import kotlinx.serialization.Serializable

@Serializable
public enum class TimeOfDay(public val code: String) { Morning("morning"), Day("day"), Evening("evening") }

/** Сортировка (docs/03-functional-spec.md §1.3). «Подходящие» — объяснимый скоринг сервера. */
@Serializable
public enum class SortOrder(public val code: String) {
    Relevance("relevance"),
    Date("date"),
    Price("price"),
    Distance("distance"),
    Popular("popular"),
}

/** Пороги цены из фильтра «Цена». */
public val PRICE_STEPS: List<Int> = listOf(500, 1000, 2000)

/** Возрастные знаки 436-ФЗ. */
public val AGE_RATINGS: List<Int> = listOf(0, 6, 12, 16, 18)

/**
 * Фильтры поиска — одинаковы во всех каналах (docs/03-functional-spec.md §1.2).
 * Неизменяемое значение: ViewModel хранит его в StateFlow и перезапрашивает выдачу при изменении.
 */
@Serializable
public data class SearchFilters(
    val query: String = "",
    val whenPreset: WhenPreset? = WhenPreset.Week,
    /** Свой диапазон (ISO yyyy-MM-dd); если задан — важнее [whenPreset]. */
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val timeOfDay: Set<TimeOfDay> = emptySet(),
    val municipalities: Set<String> = emptySet(),
    /** «Рядом со мной»: «lat,lon» и радиус. */
    val near: String? = null,
    val radiusKm: Int? = null,
    val categories: Set<Category> = emptySet(),
    val tags: Set<EventTag> = emptySet(),
    val freeOnly: Boolean = false,
    val priceMax: Int? = null,
    /** Режим «с ребёнком N лет»: знак ≤ допустимого и скрыты 18+. */
    val childAge: Int? = null,
    val ageRatingMax: Int? = null,
    val pushkin: Boolean = false,
    val accessible: Boolean = false,
    val hideSoldOut: Boolean = false,
    val sort: SortOrder = SortOrder.Relevance,
) {
    /** Сколько фильтров включено помимо запроса и периода — число на кнопке «Фильтры». */
    val activeCount: Int
        get() = listOf(
            timeOfDay.isNotEmpty(),
            municipalities.isNotEmpty() || near != null,
            categories.isNotEmpty(),
            tags.isNotEmpty(),
            freeOnly,
            priceMax != null,
            childAge != null || ageRatingMax != null,
            pushkin,
            accessible,
            hideSoldOut,
            sort != SortOrder.Relevance,
            dateFrom != null,
        ).count { it }

    public fun withoutExtras(): SearchFilters = SearchFilters(query = query, whenPreset = whenPreset ?: WhenPreset.Week)
}

@Serializable
public enum class ThemeMode { System, Light, Dark }

/** Настройки пользователя (хранятся локально; вход не требуется). */
@Serializable
public data class UserSettings(
    val language: AppLanguage = AppLanguage.Ru,
    val municipalityId: String? = "ufa",
    val municipalityName: String? = "Уфа",
    val themeMode: ThemeMode = ThemeMode.System,
    /** Крупный текст поверх системного масштаба. */
    val largeText: Boolean = false,
    /** Режим «Просто»: крупные элементы и три главные кнопки (docs/08-mobile.md §4). */
    val simpleMode: Boolean = false,
    /** Гид учитывает город из профиля, если в запросе города нет. */
    val assistantUsesCity: Boolean = true,
    /** Распроданные — в конец выдачи (по умолчанию) или скрыть. */
    val hideSoldOutByDefault: Boolean = false,
    /** Локальные уведомления об изменениях в избранном (отмена, перенос) и напоминания. */
    val favoriteAlerts: Boolean = true,
    val onboardingDone: Boolean = false,
)
