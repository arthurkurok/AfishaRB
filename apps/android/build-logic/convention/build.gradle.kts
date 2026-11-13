import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    `kotlin-dsl`
}

group = "ru.tamasha.buildlogic"

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_17
    }
}

dependencies {
    compileOnly(libs.android.gradleApiPlugin)
    compileOnly(libs.kotlin.gradlePlugin)
    compileOnly(libs.compose.gradlePlugin)
}

gradlePlugin {
    plugins {
        register("androidApplication") {
            id = "afisha.android.application"
            implementationClass = "ru.tamasha.buildlogic.AndroidApplicationConventionPlugin"
        }
        register("androidLibrary") {
            id = "afisha.android.library"
            implementationClass = "ru.tamasha.buildlogic.AndroidLibraryConventionPlugin"
        }
        register("androidLibraryCompose") {
            id = "afisha.android.library.compose"
            implementationClass = "ru.tamasha.buildlogic.AndroidLibraryComposeConventionPlugin"
        }
        register("androidFeature") {
            id = "afisha.android.feature"
            implementationClass = "ru.tamasha.buildlogic.AndroidFeatureConventionPlugin"
        }
        register("androidHilt") {
            id = "afisha.android.hilt"
            implementationClass = "ru.tamasha.buildlogic.AndroidHiltConventionPlugin"
        }
        register("jvmLibrary") {
            id = "afisha.jvm.library"
            implementationClass = "ru.tamasha.buildlogic.JvmLibraryConventionPlugin"
        }
    }
}
