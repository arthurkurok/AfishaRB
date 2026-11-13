// Репозитории (офлайн-первый доступ), настройки (DataStore), сетевое состояние, DI.
plugins {
    alias(libs.plugins.afisha.android.library)
    alias(libs.plugins.afisha.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "ru.tamasha.afisha.core.data"
}

dependencies {
    api(project(":core:model"))
    api(project(":core:network"))
    implementation(project(":core:database"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.datastore.preferences)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.okhttp)
}
