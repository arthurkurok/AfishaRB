plugins {
    alias(libs.plugins.afisha.android.application)
    alias(libs.plugins.afisha.android.hilt)
    alias(libs.plugins.kotlin.serialization)
}

/** Base URL API: -Pafisha.apiBaseUrl=… или gradle.properties (по умолчанию — хост с эмулятора). */
val apiBaseUrl: String = providers.gradleProperty("afisha.apiBaseUrl").getOrElse("http://10.0.2.2:8000")

android {
    namespace = "ru.tamasha.afisha"

    defaultConfig {
        applicationId = "ru.tamasha.afisha"
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "API_BASE_URL", "\"$apiBaseUrl\"")
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildFeatures {
        buildConfig = true
    }

    androidResources {
        // locales_config для системного выбора языка приложения (Android 13+): ru и ba
        generateLocaleConfig = true
    }

    buildTypes {
        debug {
            // Без applicationIdSuffix: статические ярлыки (res/xml/shortcuts.xml) ссылаются на пакет явно
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    packaging {
        resources.excludes += setOf("/META-INF/{AL2.0,LGPL2.1}", "/META-INF/INDEX.LIST", "/META-INF/io.netty.versions.properties")
    }
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:data"))
    implementation(project(":core:designsystem"))
    implementation(project(":feature:home"))
    implementation(project(":feature:search"))
    implementation(project(":feature:event"))
    implementation(project(":feature:assistant"))
    implementation(project(":feature:favorites"))
    implementation(project(":feature:settings"))

    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.core.splashscreen)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.androidx.hilt.navigation.compose)
    implementation(libs.androidx.compose.material3.navigation.suite)
    implementation(libs.androidx.compose.material.icons.extended)
    implementation(libs.androidx.work.runtime.ktx)
    implementation(libs.androidx.hilt.work)
    ksp(libs.androidx.hilt.compiler)
    implementation(libs.androidx.glance.appwidget)
    implementation(libs.androidx.glance.material3)
    implementation(libs.androidx.profileinstaller)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.coil.network.okhttp)
    implementation(libs.okhttp)

    testImplementation(libs.androidx.work.testing)
    testImplementation(libs.androidx.navigation.testing)
}
