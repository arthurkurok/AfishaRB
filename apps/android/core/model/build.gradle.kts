// Доменная модель и правила отображения (даты в TZ региона, цены, возраст, статусы).
// Чистый Kotlin/JVM: правила проверяются быстрыми юнит-тестами без Android.
plugins {
    alias(libs.plugins.afisha.jvm.library)
    alias(libs.plugins.kotlin.serialization)
}

dependencies {
    api(libs.kotlinx.serialization.json)
}
