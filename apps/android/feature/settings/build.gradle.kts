plugins {
    alias(libs.plugins.afisha.android.feature)
}

android {
    namespace = "ru.tamasha.afisha.feature.settings"
}

dependencies {
    // Язык внутри приложения: AppCompatDelegate.setApplicationLocales (работает и до Android 13)
    implementation(libs.androidx.appcompat)
}
