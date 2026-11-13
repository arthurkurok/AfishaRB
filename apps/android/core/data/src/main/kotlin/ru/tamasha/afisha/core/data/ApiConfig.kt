package ru.tamasha.afisha.core.data

/** Конфигурация сети, которую задаёт приложение (BuildConfig): base URL настраивается при сборке. */
public data class ApiConfig(
    val baseUrl: String,
    val userAgent: String,
    val debugLogging: Boolean,
)
