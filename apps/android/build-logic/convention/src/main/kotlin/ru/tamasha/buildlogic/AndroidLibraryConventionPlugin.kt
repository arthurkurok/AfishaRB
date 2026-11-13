package ru.tamasha.buildlogic

import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

/** `afisha.android.library` — Android-библиотека без Compose (БД, данные). */
class AndroidLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        pluginManager.apply("com.android.library")
        extensions.configure<LibraryExtension> {
            configureAndroid(this)
            // У библиотеки нет своего targetSdk; значения — для Robolectric и lint.
            testOptions.targetSdk { version = release(AfishaSdk.TARGET) }
            lint.targetSdk { version = release(AfishaSdk.TARGET) }
        }
    }
}
