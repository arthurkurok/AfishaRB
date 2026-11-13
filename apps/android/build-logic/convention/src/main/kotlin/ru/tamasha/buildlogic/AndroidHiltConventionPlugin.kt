package ru.tamasha.buildlogic

import org.gradle.api.Plugin
import org.gradle.api.Project

/** `afisha.android.hilt` — Hilt через KSP. */
class AndroidHiltConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        pluginManager.apply("com.google.devtools.ksp")
        pluginManager.apply("com.google.dagger.hilt.android")
        dependencies.apply {
            implementation(libs.lib("hilt-android"))
            ksp(libs.lib("hilt-compiler"))
        }
    }
}
