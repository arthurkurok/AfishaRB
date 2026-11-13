package ru.tamasha.afisha.core.data

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationManager
import androidx.core.content.ContextCompat
import androidx.core.content.getSystemService
import androidx.core.location.LocationManagerCompat
import androidx.core.os.CancellationSignal
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import ru.tamasha.afisha.core.model.GeoPoint
import java.util.concurrent.Executors
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.coroutines.resume

/**
 * «Рядом со мной» без Google Play Services (RuStore-устройства): системный LocationManager,
 * приблизительная точность (ACCESS_COARSE_LOCATION). Координаты не сохраняются и не уходят никуда,
 * кроме параметра `near` поиска (docs/09-compliance-security.md).
 */
@Singleton
public class LocationProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    public fun hasPermission(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED

    @SuppressLint("MissingPermission")
    public suspend fun current(): GeoPoint? {
        if (!hasPermission()) return null
        val lm = context.getSystemService<LocationManager>() ?: return null
        val provider = listOf(LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER, LocationManager.GPS_PROVIDER)
            .firstOrNull { runCatching { lm.isProviderEnabled(it) }.getOrDefault(false) } ?: return null
        val last: Location? = runCatching { lm.getLastKnownLocation(provider) }.getOrNull()
        val fresh = withTimeoutOrNull(TIMEOUT_MS) {
            suspendCancellableCoroutine<Location?> { cont ->
                val signal = CancellationSignal()
                cont.invokeOnCancellation { signal.cancel() }
                LocationManagerCompat.getCurrentLocation(lm, provider, signal, executor) { cont.resume(it) }
            }
        }
        return (fresh ?: last)?.let { GeoPoint(it.latitude, it.longitude) }
    }

    private companion object {
        const val TIMEOUT_MS = 8_000L
        val executor = Executors.newSingleThreadExecutor()
    }
}

/** Формат параметра `near` API: «lat,lon». */
public fun GeoPoint.toNearParam(): String = "%.5f,%.5f".format(java.util.Locale.ROOT, lat, lon)
