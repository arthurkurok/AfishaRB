package ru.tamasha.buildlogic

import com.android.build.api.dsl.LibraryExtension
import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.kotlin.dsl.configure

/** `afisha.android.library.compose` — Android-библиотека с Compose (дизайн-система, фичи). */
class AndroidLibraryComposeConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        pluginManager.apply("afisha.android.library")
        extensions.configure<LibraryExtension> {
            configureCompose(this)
        }
    }
}
