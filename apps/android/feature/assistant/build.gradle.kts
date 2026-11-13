plugins {
    alias(libs.plugins.afisha.android.feature)
}

android {
    namespace = "ru.tamasha.afisha.feature.assistant"
}

dependencies {
    // Тесты ViewModel используют поддельный DAO избранного
    testImplementation(project(":core:database"))
}
