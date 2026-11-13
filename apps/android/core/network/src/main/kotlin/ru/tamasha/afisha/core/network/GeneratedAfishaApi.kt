package ru.tamasha.afisha.core.network

import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.plugins.HttpRequestTimeoutException
import kotlinx.serialization.SerializationException
import ru.tamasha.afisha.api.apis.DefaultApi
import ru.tamasha.afisha.api.infrastructure.HttpResponse
import ru.tamasha.afisha.api.models.AssistantRequestInput
import ru.tamasha.afisha.api.models.ReportRequestInput
import ru.tamasha.afisha.core.model.AfishaError
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
import kotlin.coroutines.cancellation.CancellationException

/**
 * Реализация [AfishaApi] на сгенерированном Ktor-клиенте [DefaultApi].
 * [engine] — OkHttp в приложении, MockEngine в тестах.
 */
public class GeneratedAfishaApi(
    baseUrl: String,
    engine: HttpClientEngine,
    userAgent: String = "Afisha-Android",
    logger: ((String) -> Unit)? = null,
) : AfishaApi {

    private val api = DefaultApi(
        baseUrl = baseUrl.trimEnd('/'),
        httpClientEngine = engine,
        httpClientConfig = { it.afishaDefaults(userAgent, logger) },
    )

    override suspend fun occurrences(
        filters: SearchFilters,
        language: AppLanguage,
        cursor: String?,
        limit: Int,
        group: Boolean,
    ): OccurrencePage = call {
        val q = SearchQueryParams.from(filters)
        api.searchOccurrences(
            q = q.q,
            dateFrom = q.dateFrom,
            dateTo = q.dateTo,
            `when` = q.whenCode,
            timeOfDay = q.timeOfDay,
            municipality = q.municipality,
            near = q.near,
            radiusKm = q.radiusKm,
            categories = q.categories,
            tags = q.tags,
            free = q.free,
            priceMax = q.priceMax,
            age = q.age,
            ageRatingMax = q.ageRatingMax,
            pushkin = q.pushkin,
            accessible = q.accessible,
            hideSoldOut = q.hideSoldOut,
            sort = q.sort,
            group = group,
            lang = language.tag,
            limit = limit,
            cursor = cursor,
        )
    }.toDomain()

    override suspend fun event(id: String, language: AppLanguage): EventDetails =
        call { api.getEvent(id, lang = language.tag) }.toDomain()

    override suspend fun venue(id: String, language: AppLanguage): VenueDetails =
        call { api.getVenue(id, lang = language.tag) }.toDomain()

    override suspend fun categories(language: AppLanguage): List<CategoryInfo> =
        call { api.listCategories(lang = language.tag) }.mapNotNull { it.toDomain() }

    override suspend fun municipalities(language: AppLanguage): List<Municipality> =
        call { api.listMunicipalities(lang = language.tag) }.map { it.toDomain() }

    override suspend fun stats(): Stats = call { api.getStats() }.toDomain()

    override suspend fun report(eventId: String, occurrenceId: String?, reason: ReportReason, comment: String?) {
        val body = ReportRequestInput(
            eventId = eventId,
            reason = ReportRequestInput.Reason.entries.first { it.value == reason.code },
            occurrenceId = occurrenceId,
            comment = comment?.takeIf { it.isNotBlank() },
        )
        call { api.createReport(body) }
    }

    override suspend fun assistant(query: AssistantQuery): AssistantReply {
        val body = AssistantRequestInput(
            conversationId = query.conversationId,
            text = query.text?.takeIf { it.isNotBlank() },
            patch = query.patch,
            eventId = query.eventId,
            lang = AssistantRequestInput.Lang.entries.firstOrNull { it.value == query.language.tag },
            municipalityId = query.municipalityId,
            near = query.near,
        )
        return call { api.askAssistant(body) }.toDomain()
    }

    /** Единая обработка ошибок: сеть → Offline, 404 → NotFound, прочие коды → Server. */
    private suspend fun <T> call(block: suspend () -> HttpResponse<T>): T {
        val response = try {
            block()
        } catch (e: CancellationException) {
            throw e
        } catch (e: HttpRequestTimeoutException) {
            throw AfishaError.Offline(e)
        } catch (e: java.io.IOException) {
            throw AfishaError.Offline(e)
        }
        if (!response.success) {
            throw if (response.status == HTTP_NOT_FOUND) AfishaError.NotFound() else AfishaError.Server(response.status)
        }
        return try {
            response.body()
        } catch (e: CancellationException) {
            throw e
        } catch (e: SerializationException) {
            throw AfishaError.Unexpected(e)
        } catch (e: java.io.IOException) {
            throw AfishaError.Offline(e)
        }
    }

    private companion object {
        const val HTTP_NOT_FOUND = 404
    }
}
