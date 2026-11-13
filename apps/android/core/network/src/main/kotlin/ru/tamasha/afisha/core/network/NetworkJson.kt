package ru.tamasha.afisha.core.network

import io.ktor.client.HttpClientConfig
import io.ktor.client.plugins.HttpTimeout
import io.ktor.client.plugins.contentnegotiation.ContentNegotiation
import io.ktor.client.plugins.defaultRequest
import io.ktor.client.plugins.logging.LogLevel
import io.ktor.client.plugins.logging.Logger
import io.ktor.client.plugins.logging.Logging
import io.ktor.http.HttpHeaders
import io.ktor.serialization.kotlinx.json.json
import kotlinx.serialization.json.Json

/** Настройки JSON: новые поля и значения перечислений из будущих версий API не роняют клиент. */
public val AfishaJson: Json = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
    coerceInputValues = true
    isLenient = true
}

/** Общая конфигурация Ktor для сгенерированного клиента: JSON, таймауты, User-Agent, лог в debug. */
public fun HttpClientConfig<*>.afishaDefaults(userAgent: String, logger: ((String) -> Unit)? = null) {
    install(ContentNegotiation) {
        json(AfishaJson)
    }
    install(HttpTimeout) {
        connectTimeoutMillis = 10_000
        requestTimeoutMillis = 30_000
        socketTimeoutMillis = 30_000
    }
    defaultRequest {
        headers.append(HttpHeaders.UserAgent, userAgent)
    }
    if (logger != null) {
        install(Logging) {
            level = LogLevel.INFO
            this.logger = object : Logger {
                override fun log(message: String) = logger(message)
            }
        }
    }
}
