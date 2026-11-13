package ru.tamasha.buildlogic

import com.android.build.api.dsl.CommonExtension
import org.gradle.api.JavaVersion
import org.gradle.api.Project
import org.gradle.api.artifacts.MinimalExternalModuleDependency
import org.gradle.api.artifacts.VersionCatalog
import org.gradle.api.artifacts.VersionCatalogsExtension
import org.gradle.api.artifacts.dsl.DependencyHandler
import org.gradle.api.provider.Provider
import org.gradle.api.tasks.testing.Test
import org.gradle.api.tasks.testing.logging.TestExceptionFormat
import org.gradle.kotlin.dsl.getByType
import org.gradle.kotlin.dsl.withType
import org.jetbrains.kotlin.gradle.dsl.JvmTarget
import org.jetbrains.kotlin.gradle.tasks.KotlinJvmCompile

/** Версии Android SDK — одно место для всех модулей. */
internal object AfishaSdk {
    /** Установленная платформа android-36.1 (Compose 1.11 и др. библиотеки подобраны под неё). */
    const val COMPILE = 36
    const val COMPILE_MINOR = 1
    /** Android 8.0: ~97 % устройств в РФ (docs/08-mobile.md §2). */
    const val MIN = 26
    const val TARGET = 36
}

/** Версия байткода: всё потребляется Android-приложением (minSdk 26, D8). */
internal val JAVA_TARGET: JavaVersion = JavaVersion.VERSION_17
internal val KOTLIN_JVM_TARGET: JvmTarget = JvmTarget.JVM_17

internal val Project.libs: VersionCatalog
    get() = extensions.getByType<VersionCatalogsExtension>().named("libs")

internal fun VersionCatalog.lib(alias: String): Provider<MinimalExternalModuleDependency> =
    findLibrary(alias).orElseThrow { IllegalArgumentException("В libs.versions.toml нет библиотеки $alias") }

internal fun <T : Any> DependencyHandler.implementation(dep: Provider<T>) = addProvider("implementation", dep)
internal fun <T : Any> DependencyHandler.debugImplementation(dep: Provider<T>) = addProvider("debugImplementation", dep)
internal fun <T : Any> DependencyHandler.testImplementation(dep: Provider<T>) = addProvider("testImplementation", dep)
internal fun <T : Any> DependencyHandler.ksp(dep: Provider<T>) = addProvider("ksp", dep)

/** Общее для приложения и библиотек Android. */
internal fun Project.configureAndroid(android: CommonExtension) {
    android.compileSdk {
        version = release(AfishaSdk.COMPILE) { minorApiLevel = AfishaSdk.COMPILE_MINOR }
    }
    android.defaultConfig.minSdk { version = release(AfishaSdk.MIN) }
    android.compileOptions.sourceCompatibility = JAVA_TARGET
    android.compileOptions.targetCompatibility = JAVA_TARGET
    // Robolectric и Compose UI-тесты на JVM читают ресурсы модуля
    android.testOptions.unitTests.isIncludeAndroidResources = true
    android.lint.abortOnError = false
    configureKotlin()
    configureTests()
    dependencies.apply {
        testImplementation(libs.lib("junit4"))
        testImplementation(libs.lib("kotlinx-coroutines-test"))
        testImplementation(libs.lib("turbine"))
        testImplementation(libs.lib("robolectric"))
        testImplementation(libs.lib("androidx-test-core"))
        testImplementation(libs.lib("androidx-test-ext-junit"))
    }
}

internal fun Project.configureKotlin() {
    tasks.withType<KotlinJvmCompile>().configureEach {
        compilerOptions {
            jvmTarget.set(KOTLIN_JVM_TARGET)
            freeCompilerArgs.addAll(
                "-opt-in=kotlin.RequiresOptIn",
            )
        }
    }
}

/** Тесты: экономим память (8 ГБ на машине разработчика), подробный вывод падений. */
internal fun Project.configureTests() {
    tasks.withType<Test>().configureEach {
        maxHeapSize = "1g"
        maxParallelForks = 1
        // Gradle 9 по умолчанию падает, если в модуле нет тестов; для модулей без тестов это не ошибка
        failOnNoDiscoveredTests.set(false)
        // Robolectric для SDK 36 обращается к jdk.internal.access (FileDescriptor) — без этого падает на JDK 21
        jvmArgs("--add-exports=java.base/jdk.internal.access=ALL-UNNAMED")
        // Часовой пояс сервера не должен влиять на «сегодня» региона: гоняем тесты в чужом поясе.
        systemProperty("user.timezone", "America/Los_Angeles")
        testLogging {
            events("failed", "skipped")
            exceptionFormat = TestExceptionFormat.FULL
        }
    }
}

/** Compose: компилятор Compose (плагин Kotlin) + BOM и базовые артефакты. */
internal fun Project.configureCompose(android: CommonExtension) {
    pluginManager.apply("org.jetbrains.kotlin.plugin.compose")
    android.buildFeatures.compose = true
    dependencies.apply {
        val bom = dependencies.platform(libs.lib("androidx-compose-bom"))
        implementation(bom)
        testImplementation(bom)
        implementation(libs.lib("androidx-compose-ui"))
        implementation(libs.lib("androidx-compose-foundation"))
        implementation(libs.lib("androidx-compose-material3"))
        implementation(libs.lib("androidx-compose-ui-tooling-preview"))
        debugImplementation(libs.lib("androidx-compose-ui-tooling"))
        testImplementation(libs.lib("androidx-compose-ui-test-junit4"))
        debugImplementation(libs.lib("androidx-compose-ui-test-manifest"))
    }
}
