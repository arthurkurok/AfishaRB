package ru.tamasha.buildlogic

import org.gradle.api.Plugin
import org.gradle.api.Project

/**
 * `afisha.android.feature` — экран (или группа экранов): Compose + Hilt + MVVM/UDF.
 * Фича видит модель, данные и дизайн-систему, но не другие фичи — навигацию связывает :app.
 */
class AndroidFeatureConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        pluginManager.apply("afisha.android.library.compose")
        pluginManager.apply("afisha.android.hilt")
        pluginManager.apply("org.jetbrains.kotlin.plugin.serialization")
        dependencies.apply {
            add("implementation", project(":core:model"))
            add("implementation", project(":core:data"))
            add("implementation", project(":core:designsystem"))
            implementation(libs.lib("androidx-lifecycle-runtime-compose"))
            implementation(libs.lib("androidx-lifecycle-viewmodel-compose"))
            implementation(libs.lib("androidx-navigation-compose"))
            implementation(libs.lib("androidx-hilt-navigation-compose"))
            implementation(libs.lib("kotlinx-serialization-json"))
            implementation(libs.lib("androidx-compose-material-icons-extended"))
            implementation(libs.lib("androidx-activity-compose"))
            implementation(libs.lib("androidx-core-ktx"))
        }
    }
}
