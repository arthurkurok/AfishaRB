package ru.tamasha.afisha.core.network

import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.AssistantQuery
import ru.tamasha.afisha.core.model.AssistantReply
import ru.tamasha.afisha.core.model.CategoryInfo
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.Municipality
import ru.tamasha.afisha.core.model.OccurrencePage
import ru.tamasha.afisha.core.model.ReportReason
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.Stats
import ru.tamasha.afisha.core.model.VenueDetails

/**
 * Фасад открытого API афиши поверх сгенерированного клиента.
 * Возвращает доменные модели; ошибки — [ru.tamasha.afisha.core.model.AfishaError].
 */
public interface AfishaApi {
    public suspend fun occurrences(
        filters: SearchFilters,
        language: AppLanguage,
        cursor: String? = null,
        limit: Int = DEFAULT_PAGE,
        /** Свернуть сеансы одного события в одну карточку («ещё N дат»). */
        group: Boolean = true,
    ): OccurrencePage

    public suspend fun event(id: String, language: AppLanguage): EventDetails

    public suspend fun venue(id: String, language: AppLanguage): VenueDetails

    public suspend fun categories(language: AppLanguage): List<CategoryInfo>

    public suspend fun municipalities(language: AppLanguage): List<Municipality>

    public suspend fun stats(): Stats

    public suspend fun report(eventId: String, occurrenceId: String?, reason: ReportReason, comment: String?)

    public suspend fun assistant(query: AssistantQuery): AssistantReply

    public companion object {
        public const val DEFAULT_PAGE: Int = 20
    }
}
