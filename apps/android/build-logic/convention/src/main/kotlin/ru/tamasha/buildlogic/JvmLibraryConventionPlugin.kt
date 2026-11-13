package ru.tamasha.buildlogic

import org.gradle.api.Plugin
import org.gradle.api.Project
import org.gradle.api.plugins.JavaPluginExtension
import org.gradle.kotlin.dsl.configure

/** `afisha.jvm.library` — чистый Kotlin/JVM без Android (модель, сеть): быстрые тесты на JVM. */
class JvmLibraryConventionPlugin : Plugin<Project> {
    override fun apply(target: Project): Unit = with(target) {
        pluginManager.apply("org.jetbrains.kotlin.jvm")
        configureKotlin()
        configureTests()
        extensions.configure<JavaPluginExtension> {
            sourceCompatibility = JAVA_TARGET
            targetCompatibility = JAVA_TARGET
        }
        // Единая команда для всех модулей: `./gradlew testDebugUnitTest` гоняет и JVM-тесты (модель, сеть)
        tasks.register("testDebugUnitTest") {
            group = "verification"
            description = "Псевдоним test для JVM-модулей, чтобы testDebugUnitTest покрывал весь проект"
            dependsOn("test")
        }
        dependencies.apply {
            testImplementation(libs.lib("junit4"))
            testImplementation(libs.lib("kotlinx-coroutines-test"))
        }
    }
}
