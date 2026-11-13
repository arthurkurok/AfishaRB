plugins {
    alias(libs.plugins.afisha.android.feature)
}

android {
    namespace = "ru.tamasha.afisha.feature.favorites"
}

dependencies {
    testImplementation(project(":core:database"))
}
