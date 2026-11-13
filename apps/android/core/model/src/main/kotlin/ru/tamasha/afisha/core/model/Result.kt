package ru.tamasha.afisha.core.model

/** Ошибки, которые понимает интерфейс (не HTTP-коды). */
public sealed class AfishaError(message: String? = null, cause: Throwable? = null) : Exception(message, cause) {
    /** Нет сети или сервер недоступен — показываем офлайн-данные. */
    public class Offline(cause: Throwable? = null) : AfishaError("offline", cause)
    public class NotFound : AfishaError("not_found")
    public class Server(public val code: Int) : AfishaError("server_$code")
    public class Unexpected(cause: Throwable? = null) : AfishaError(cause?.message, cause)
}

/** Данные с отметкой, откуда они: из сети или из офлайн-кэша (тогда показываем баннер). */
public data class Cached<T>(val value: T, val fromCache: Boolean, val savedAtMillis: Long? = null)

/** Состояние загрузки для UDF-экранов. */
public sealed interface LoadState<out T> {
    public data object Loading : LoadState<Nothing>
    public data class Ready<T>(val value: T, val fromCache: Boolean = false, val savedAtMillis: Long? = null) : LoadState<T>
    public data class Failed(val error: Throwable) : LoadState<Nothing>

    public val valueOrNull: T? get() = (this as? Ready<T>)?.value
}
