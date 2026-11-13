package ru.tamasha.afisha.core.data

import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.builtins.ListSerializer
import ru.tamasha.afisha.core.database.EventCacheDao
import ru.tamasha.afisha.core.database.EventCacheEntity
import ru.tamasha.afisha.core.database.FeedCacheDao
import ru.tamasha.afisha.core.database.FeedCacheEntity
import ru.tamasha.afisha.core.model.AfishaError
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.Cached
import ru.tamasha.afisha.core.model.CategoryInfo
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.Municipality
import ru.tamasha.afisha.core.model.OccurrencePage
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.ReportReason
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.Stats
import ru.tamasha.afisha.core.model.VenueDetails
import ru.tamasha.afisha.core.network.AfishaApi
import ru.tamasha.afisha.core.network.AfishaJson
import javax.inject.Inject
import javax.inject.Singleton

/**
 * События: сеть — источник истины, Room — офлайн-резерв.
 * При отключении интернета в районах человек видит последние загруженные данные с пометкой.
 */
@Singleton
public class EventsRepository @Inject constructor(
    private val api: AfishaApi,
    private val settings: SettingsRepository,
    private val eventCache: EventCacheDao,
    private val feedCache: FeedCacheDao,
    private val favorites: FavoritesRepository,
    private val clock: TimeSource,
    private val regionClock: RegionClock,
) {
    private val dictionaryLock = Mutex()
    private var municipalitiesMemo: Pair<AppLanguage, List<Municipality>>? = null
    private var categoriesMemo: Pair<AppLanguage, List<CategoryInfo>>? = null

    private suspend fun language(): AppLanguage = settings.current().language

    /** Страница поиска. Без кэша: поиск с фильтрами офлайн бессмыслен, ошибку покажет экран. */
    public suspend fun search(filters: SearchFilters, cursor: String? = null, limit: Int = AfishaApi.DEFAULT_PAGE): OccurrencePage =
        api.occurrences(filters, language(), cursor = cursor, limit = limit)

    /**
     * Лента главной и виджета: первая страница по фильтрам с офлайн-кэшем.
     * Ключ кэша включает язык — названия могут отличаться.
     */
    public suspend fun feed(filters: SearchFilters, limit: Int = AfishaApi.DEFAULT_PAGE): Cached<OccurrencePage> {
        val lang = language()
        // «Сегодня» относительно: в ключе — дата региона, чтобы офлайн не показать вчерашнюю ленту как сегодняшнюю
        val key = "feed:${lang.tag}:${regionClock.today()}:${AfishaJson.encodeToString(SearchFilters.serializer(), filters)}:$limit"
        return try {
            val page = api.occurrences(filters, lang, limit = limit)
            feedCache.upsert(FeedCacheEntity(key, AfishaJson.encodeToString(OccurrencePage.serializer(), page), clock.nowMillis()))
            Cached(page, fromCache = false)
        } catch (e: AfishaError.Offline) {
            val cached = feedCache.get(key) ?: throw e
            Cached(AfishaJson.decodeFromString(OccurrencePage.serializer(), cached.json), fromCache = true, savedAtMillis = cached.savedAtMillis)
        }
    }

    /** Паспорт события. Свежая версия обновляет и снимок в избранном (статусы, переносы). */
    public suspend fun event(id: String): Cached<EventDetails> {
        val lang = language()
        return try {
            val details = api.event(id, lang)
            eventCache.upsert(EventCacheEntity(id, lang.tag, AfishaJson.encodeToString(EventDetails.serializer(), details), clock.nowMillis()))
            favorites.refreshSnapshot(details)
            Cached(details, fromCache = false)
        } catch (e: AfishaError.Offline) {
            val cached = eventCache.get(id, lang.tag) ?: throw e
            Cached(AfishaJson.decodeFromString(EventDetails.serializer(), cached.json), fromCache = true, savedAtMillis = cached.savedAtMillis)
        }
    }

    /** Страница площадки: адрес, доступность, ближайшие события. */
    public suspend fun venue(id: String): VenueDetails = api.venue(id, language())

    public suspend fun categories(): List<CategoryInfo> = dictionaryLock.withLock {
        val lang = language()
        categoriesMemo?.takeIf { it.first == lang }?.second ?: api.categories(lang).also { categoriesMemo = lang to it }
    }

    /** Справочник городов и районов: память → сеть → офлайн-кэш. */
    public suspend fun municipalities(): List<Municipality> = dictionaryLock.withLock {
        val lang = language()
        municipalitiesMemo?.takeIf { it.first == lang }?.second?.let { return@withLock it }
        val key = "municipalities:${lang.tag}"
        val serializer = ListSerializer(Municipality.serializer())
        val list = try {
            api.municipalities(lang).also {
                feedCache.upsert(FeedCacheEntity(key, AfishaJson.encodeToString(serializer, it), clock.nowMillis()))
            }
        } catch (e: AfishaError.Offline) {
            feedCache.get(key)?.let { AfishaJson.decodeFromString(serializer, it.json) } ?: throw e
        }
        municipalitiesMemo = lang to list
        list
    }

    public suspend fun stats(): Stats = api.stats()

    public suspend fun report(eventId: String, occurrenceId: String?, reason: ReportReason, comment: String?): Unit =
        api.report(eventId, occurrenceId, reason, comment)

    /**
     * Синхронизация одного события из избранного (фоновая задача): свежий паспорт в кэш,
     * снимок в избранное. Возвращает изменение статуса (отмена, перенос) — для уведомления.
     */
    public suspend fun syncFavorite(id: String): StatusChange? {
        val lang = language()
        val details = api.event(id, lang)
        eventCache.upsert(EventCacheEntity(id, lang.tag, AfishaJson.encodeToString(EventDetails.serializer(), details), clock.nowMillis()))
        return favorites.refreshSnapshot(details)
    }

    public suspend fun pruneCache() {
        eventCache.prune(olderThan = clock.nowMillis() - CACHE_TTL_MILLIS)
    }

    private companion object {
        const val CACHE_TTL_MILLIS = 14L * 24 * 60 * 60 * 1000
    }
}

/** Источник времени для кэша (подменяется в тестах). */
public fun interface TimeSource {
    public fun nowMillis(): Long
}
