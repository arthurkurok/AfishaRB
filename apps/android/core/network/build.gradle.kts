// Сетевой слой: клиент генерируется openapi-generator из packages/contract/openapi.json
// (contract-first, CLAUDE.md, инвариант 3). Сгенерированный код не правится руками —
// всё, что нужно приложению, живёт в фасаде AfishaApi и мапперах в домен.
plugins {
    alias(libs.plugins.afisha.jvm.library)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.openapi.generator)
}

val contractSpec: File = rootDir.resolve("../../packages/contract/openapi.json").canonicalFile
val generatedRoot: Provider<Directory> = layout.buildDirectory.dir("generated/openapi")

openApiGenerate {
    generatorName.set("kotlin")
    inputSpec.set(contractSpec.absolutePath)
    outputDir.set(generatedRoot.get().asFile.absolutePath)
    packageName.set("ru.tamasha.afisha.api")
    library.set("jvm-ktor")
    // Спецификация 3.1 из zod не проходит валидатор: нет info.license.identifier (см. apps/android/README.md).
    validateSpec.set(false)
    skipValidateSpec.set(true)
    // Чистим каталог перед генерацией: удалённые из контракта схемы не должны оставаться в сборке
    cleanupOutput.set(true)
    // Генератор в отдельном процессе: его классы не копятся в Metaspace демона (лимит памяти)
    workerIsolation.set("process")
    maxWorkerHeapSize.set("512m")
    configOptions.set(
        mapOf(
            "serializationLibrary" to "kotlinx_serialization",
            "enumUnknownDefaultCase" to "true",
            "dateLibrary" to "string",
            "omitGradleWrapper" to "true",
            "sourceFolder" to "src/main/kotlin",
        ),
    )
    // Обходы для конструкций OpenAPI 3.1 из zod:
    //  - format: uuid → String (не нужен contextual-сериализатор UUID);
    //  - `{}` (любой JSON: patch, accessibility, history.old/new, geo-кортеж) → JsonElement;
    //  - anyOf [{}, null] генератор называет AnyOf<> и не создаёт класс → тоже JsonElement;
    //  - number → Double вместо BigDecimal без сериализатора.
    typeMappings.set(
        mapOf(
            "UUID" to "kotlin.String",
            "AnyType" to "JsonElement",
            "AnyOfLessThanGreaterThan" to "JsonElement",
            "number" to "kotlin.Double",
            "decimal" to "kotlin.Double",
        ),
    )
    importMappings.set(
        mapOf(
            "JsonElement" to "kotlinx.serialization.json.JsonElement",
            "AnyOfLessThanGreaterThan" to "kotlinx.serialization.json.JsonElement",
        ),
    )
    // FILTER: в клиент приложения попадают только публичные операции (админка и фиды — не для мобильного).
    openapiNormalizer.set(
        mapOf(
            "SIMPLIFY_ONEOF_ANYOF" to "true",
            "FILTER" to "tag:Афиша|Справочники|Обратная связь|Гид",
        ),
    )
    // Оставшиеся inline-схемы (вложенные объекты) именуются по месту; без переиспользования совпадающих
    // имена не зависят от порядка обхода — новый эндпоинт не переименует чужие классы.
    inlineSchemaOptions.set(mapOf("SKIP_SCHEMA_REUSE" to "true"))
    // Ответ 202 `{ ok: true }` (zod `z.literal(true)` → `enum: [true]`): с enumUnknownDefaultCase генератор
    // выдаёт некомпилируемый Int-сентинел в Boolean-enum. Тело ответа нам не нужно — читаем как JsonObject.
    schemaMappings.set(
        mapOf(
            "createReport_202_response" to "kotlinx.serialization.json.JsonObject",
            "_v1_reports_post_202_response" to "kotlinx.serialization.json.JsonObject",
        ),
    )
    generateModelTests.set(false)
    generateApiTests.set(false)
    generateModelDocumentation.set(false)
    generateApiDocumentation.set(false)
}

kotlin {
    sourceSets.named("main") {
        kotlin.srcDir(files(generatedRoot.map { it.dir("src/main/kotlin") }).builtBy(tasks.named("openApiGenerate")))
    }
}

tasks.named("openApiGenerate") {
    inputs.file(contractSpec).withPathSensitivity(PathSensitivity.NONE)
    outputs.dir(generatedRoot)
}

dependencies {
    api(project(":core:model"))
    api(libs.kotlinx.coroutines.core)
    implementation(libs.kotlinx.serialization.json)
    api(libs.ktor.client.core)
    implementation(libs.ktor.client.content.negotiation)
    implementation(libs.ktor.serialization.kotlinx.json)
    implementation(libs.ktor.client.logging)
    testImplementation(libs.ktor.client.mock)
}
