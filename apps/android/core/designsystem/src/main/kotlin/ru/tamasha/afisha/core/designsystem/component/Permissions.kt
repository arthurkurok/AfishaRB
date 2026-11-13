package ru.tamasha.afisha.core.designsystem.component

import android.Manifest
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember

/** Запрос приблизительной геопозиции для «Рядом со мной». Точная не нужна. */
@Composable
public fun rememberLocationPermissionRequest(onResult: (Boolean) -> Unit): () -> Unit {
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission(), onResult)
    return remember(launcher) { { launcher.launch(Manifest.permission.ACCESS_COARSE_LOCATION) } }
}
