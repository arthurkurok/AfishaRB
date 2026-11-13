package ru.tamasha.afisha

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import coil3.disk.DiskCache
import coil3.disk.directory
import coil3.memory.MemoryCache
import coil3.network.okhttp.OkHttpNetworkFetcherFactory
import coil3.request.crossfade
import dagger.hilt.android.HiltAndroidApp
import okhttp3.OkHttpClient
import ru.tamasha.afisha.work.Notifications
import ru.tamasha.afisha.work.WorkScheduler
import javax.inject.Inject

@HiltAndroidApp
class AfishaApplication : Application(), Configuration.Provider, SingletonImageLoader.Factory {

    @Inject lateinit var workerFactory: HiltWorkerFactory

    @Inject lateinit var okHttpClient: OkHttpClient

    @Inject lateinit var workScheduler: WorkScheduler

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        Notifications.createChannels(this)
        // Периодическая синхронизация избранного и виджета (резерв на случай нестабильного push)
        workScheduler.schedulePeriodic()
    }

    /** Картинки через тот же OkHttp, с дисковым кэшем — постеры видны и при слабой сети. */
    override fun newImageLoader(context: PlatformContext): ImageLoader = ImageLoader.Builder(context)
        .components { add(OkHttpNetworkFetcherFactory(callFactory = { okHttpClient })) }
        .memoryCache { MemoryCache.Builder().maxSizePercent(context, MEMORY_CACHE_PERCENT).build() }
        .diskCache { DiskCache.Builder().directory(cacheDir.resolve("images")).maxSizeBytes(DISK_CACHE_BYTES).build() }
        .crossfade(true)
        .build()

    private companion object {
        const val MEMORY_CACHE_PERCENT = 0.15
        const val DISK_CACHE_BYTES = 64L * 1024 * 1024
    }
}
