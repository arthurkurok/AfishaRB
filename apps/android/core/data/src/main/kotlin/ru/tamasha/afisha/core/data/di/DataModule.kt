package ru.tamasha.afisha.core.data.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.ktor.client.engine.HttpClientEngine
import io.ktor.client.engine.okhttp.OkHttp
import okhttp3.OkHttpClient
import ru.tamasha.afisha.core.data.ApiConfig
import ru.tamasha.afisha.core.data.TimeSource
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.network.AfishaApi
import ru.tamasha.afisha.core.network.GeneratedAfishaApi
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
public object DataModule {

    /** Часовой пояс региона — из конфигурации региона (сейчас один регион — Башкортостан). */
    @Provides
    @Singleton
    public fun regionClock(): RegionClock = RegionClock()

    @Provides
    public fun timeSource(): TimeSource = TimeSource { System.currentTimeMillis() }

    /** Один OkHttpClient на приложение: API (через Ktor) и картинки (Coil). */
    @Provides
    @Singleton
    public fun okHttp(): OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .retryOnConnectionFailure(true)
        .build()

    @Provides
    @Singleton
    public fun engine(client: OkHttpClient): HttpClientEngine = OkHttp.create { preconfigured = client }

    @Provides
    @Singleton
    public fun api(config: ApiConfig, engine: HttpClientEngine): AfishaApi = GeneratedAfishaApi(
        baseUrl = config.baseUrl,
        engine = engine,
        userAgent = config.userAgent,
        logger = if (config.debugLogging) { msg -> android.util.Log.d("AfishaApi", msg) } else null,
    )
}
