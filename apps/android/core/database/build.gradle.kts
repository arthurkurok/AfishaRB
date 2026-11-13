// Room: избранное и офлайн-кэш (лента «Сегодня», паспорта событий) — работа без сети в районах.
plugins {
    alias(libs.plugins.afisha.android.library)
    alias(libs.plugins.afisha.android.hilt)
}

android {
    namespace = "ru.tamasha.afisha.core.database"
}

ksp {
    arg("room.schemaLocation", "$projectDir/schemas")
    arg("room.generateKotlin", "true")
}

dependencies {
    api(project(":core:model"))
    api(libs.androidx.room.runtime)
    implementation(libs.androidx.room.ktx)
    ksp(libs.androidx.room.compiler)
    implementation(libs.kotlinx.serialization.json)
}
