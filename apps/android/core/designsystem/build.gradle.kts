import ru.tamasha.buildlogic.GenerateDesignTokensTask

// Дизайн-система «Живой орнамент» (docs/07-design.md): токены, тема, формы ромб и ҡусҡар,
// фирменные компоненты (карточка события, зонтик курая, бейджи статусов, маскот Бал).
plugins {
    alias(libs.plugins.afisha.android.library.compose)
}

android {
    namespace = "ru.tamasha.afisha.core.designsystem"
}

val generateDesignTokens = tasks.register<GenerateDesignTokensTask>("generateDesignTokens") {
    tokensFile.set(rootProject.layout.projectDirectory.file("../../packages/design-tokens/tokens.json"))
    packageName.set("ru.tamasha.afisha.core.designsystem.tokens")
    outputDir.set(layout.buildDirectory.dir("generated/tokens/kotlin"))
    resOutputDir.set(layout.buildDirectory.dir("generated/tokens/res"))
}

androidComponents {
    onVariants { variant ->
        variant.sources.kotlin?.addGeneratedSourceDirectory(generateDesignTokens, GenerateDesignTokensTask::outputDir)
        variant.sources.res?.addGeneratedSourceDirectory(generateDesignTokens, GenerateDesignTokensTask::resOutputDir)
    }
}

dependencies {
    api(project(":core:model"))
    api(libs.androidx.compose.material3)
    api(libs.androidx.compose.animation)
    implementation(libs.androidx.compose.material.icons.extended)
    api(libs.coil.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
}
