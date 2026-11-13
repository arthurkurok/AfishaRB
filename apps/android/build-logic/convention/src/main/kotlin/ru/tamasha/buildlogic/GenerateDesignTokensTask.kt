package ru.tamasha.buildlogic

import groovy.json.JsonSlurper
import org.gradle.api.DefaultTask
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.CacheableTask
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputDirectory
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction

/**
 * Генерирует `Tokens.kt` из `packages/design-tokens/tokens.json` (W3C DTCG).
 *
 * Токены — единственный источник цветов, размеров и таймингов (CLAUDE.md, инвариант 5),
 * поэтому Kotlin-файл не пишется руками: правка JSON → пересборка → новый `Tokens.kt`.
 * Тёмная тема берётся из `$extensions.dark`; если её нет — значение совпадает со светлым.
 */
@CacheableTask
abstract class GenerateDesignTokensTask : DefaultTask() {

    @get:InputFile
    @get:PathSensitive(PathSensitivity.NONE)
    abstract val tokensFile: RegularFileProperty

    @get:Input
    abstract val packageName: Property<String>

    @get:OutputDirectory
    abstract val outputDir: DirectoryProperty

    /** Каталог Android-ресурсов: цвета для XML (сплэш, иконка, тема окна) — values и values-night. */
    @get:OutputDirectory
    abstract val resOutputDir: DirectoryProperty

    @TaskAction
    fun generate() {
        @Suppress("UNCHECKED_CAST")
        val root = JsonSlurper().parse(tokensFile.get().asFile, "UTF-8") as Map<String, Any?>
        val pkg = packageName.get()
        val out = StringBuilder()
        out.appendLine("// АВТОГЕНЕРАЦИЯ: GenerateDesignTokensTask из packages/design-tokens/tokens.json.")
        out.appendLine("// Не редактировать вручную — правьте tokens.json.")
        out.appendLine("@file:Suppress(\"MagicNumber\", \"unused\")")
        out.appendLine()
        out.appendLine("package $pkg")
        out.appendLine()
        out.appendLine("import androidx.compose.animation.core.CubicBezierEasing")
        out.appendLine("import androidx.compose.ui.graphics.Color")
        out.appendLine("import androidx.compose.ui.text.font.FontWeight")
        out.appendLine("import androidx.compose.ui.unit.Dp")
        out.appendLine("import androidx.compose.ui.unit.TextUnit")
        out.appendLine("import androidx.compose.ui.unit.dp")
        out.appendLine("import androidx.compose.ui.unit.sp")
        out.appendLine()
        out.appendLine("/** Роль шрифта из `font.*`: display — Commissioner, text — Golos Text. */")
        out.appendLine("public enum class FontRole { Display, Text }")
        out.appendLine()
        out.appendLine("/** Ступень типографической шкалы (`type.*`). */")
        out.appendLine("public data class TypeToken(val size: TextUnit, val lineHeight: TextUnit, val weight: FontWeight, val role: FontRole)")
        out.appendLine()
        out.appendLine("public object Tokens {")

        @Suppress("UNCHECKED_CAST")
        val color = root["color"] as Map<String, Any?>
        val base = color.filterValues { it is Map<*, *> && it.containsKey("\$value") }
        out.appendLine("    /** Базовая палитра, светлая тема. */")
        out.appendLine("    public object Light {")
        base.forEach { (k, v) -> out.appendLine("        public val ${pascal(k)}: Color = ${colorLiteral(value(v))}") }
        out.appendLine("    }")
        out.appendLine()
        out.appendLine("    /** Базовая палитра, тёмная тема. */")
        out.appendLine("    public object Dark {")
        base.forEach { (k, v) -> out.appendLine("        public val ${pascal(k)}: Color = ${colorLiteral(dark(v) ?: value(v))}") }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val category = color["category"] as Map<String, Any?>
        out.appendLine("    /** Цвета категорий: белый текст на цвете, контраст ≥ 4,5:1. */")
        out.appendLine("    public object Category {")
        category.forEach { (k, v) -> out.appendLine("        public val ${pascal(k)}: Color = ${colorLiteral(value(v))}") }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val status = color["status"] as Map<String, Any?>
        out.appendLine("    /** Цвета статусов (всегда вместе с формой и текстом бейджа). */")
        out.appendLine("    public object StatusLight {")
        status.forEach { (k, v) -> out.appendLine("        public val ${pascal(k)}: Color = ${colorLiteral(value(v))}") }
        out.appendLine("    }")
        out.appendLine("    public object StatusDark {")
        status.forEach { (k, v) -> out.appendLine("        public val ${pascal(k)}: Color = ${colorLiteral(dark(v) ?: value(v))}") }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val font = root["font"] as Map<String, Any?>
        out.appendLine("    /** Цепочки шрифтов (`font.*`) — для справки и проверки фолбэков. */")
        out.appendLine("    public object FontFamilies {")
        font.forEach { (k, v) ->
            @Suppress("UNCHECKED_CAST")
            val list = (v as Map<String, Any?>)["\$value"] as List<String>
            out.appendLine("        public val ${pascal(k)}: List<String> = listOf(${list.joinToString { "\"$it\"" }})")
        }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val type = root["type"] as Map<String, Map<String, Any?>>
        out.appendLine("    /** Типографическая шкала (sp масштабируются системным размером шрифта). */")
        out.appendLine("    public object Type {")
        type.forEach { (k, v) ->
            val role = if (v["family"] == "display") "FontRole.Display" else "FontRole.Text"
            out.appendLine(
                "        public val ${pascal(k)}: TypeToken = TypeToken(${num(v["size"])}.sp, ${num(v["line"])}.sp, FontWeight(${num(v["weight"])}), $role)",
            )
        }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val radius = root["radius"] as Map<String, Any?>
        out.appendLine("    public object Radius {")
        radius.forEach { (k, v) -> out.appendLine("        public val ${pascal(k)}: Dp = ${num(v)}.dp") }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val space = root["space"] as Map<String, Any?>
        out.appendLine("    /** Сетка отступов 4 dp. */")
        out.appendLine("    public object Space {")
        space.forEach { (k, v) -> out.appendLine("        public val S$k: Dp = ${num(v)}.dp") }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val motion = root["motion"] as Map<String, Any?>
        out.appendLine("    /** Длительности анимаций, мс, и фирменная кривая. */")
        out.appendLine("    public object Motion {")
        motion.forEach { (k, v) ->
            if (k == "easing") {
                val nums = Regex("""\d*\.?\d+""").findAll(v.toString()).map { it.value }.map { if (it.startsWith(".")) "0$it" else it }.toList()
                out.appendLine("        public val Easing: CubicBezierEasing = CubicBezierEasing(${nums.joinToString { it + "f" }})")
            } else {
                out.appendLine("        public const val ${pascal(k)}: Int = ${num(v)}")
            }
        }
        out.appendLine("    }")
        out.appendLine()

        @Suppress("UNCHECKED_CAST")
        val touch = root["touch"] as Map<String, Any?>
        out.appendLine("    /** Минимальный размер области касания. */")
        out.appendLine("    public object Touch {")
        touch.forEach { (k, v) -> out.appendLine("        public val ${pascal(k)}: Dp = ${num(v)}.dp") }
        out.appendLine("    }")
        out.appendLine("}")

        val dir = outputDir.get().asFile.resolve(pkg.replace('.', '/'))
        dir.deleteRecursively()
        dir.mkdirs()
        dir.resolve("Tokens.kt").writeText(out.toString())
        writeColorResources(base, category)
    }

    /** values/afisha_colors.xml и values-night/afisha_colors.xml — те же токены для XML-ресурсов. */
    private fun writeColorResources(base: Map<String, Any?>, category: Map<String, Any?>) {
        val res = resOutputDir.get().asFile
        res.deleteRecursively()
        for ((dirName, dark) in listOf("values" to false, "values-night" to true)) {
            val sb = StringBuilder()
            sb.appendLine("<?xml version=\"1.0\" encoding=\"utf-8\"?>")
            sb.appendLine("<!-- АВТОГЕНЕРАЦИЯ из packages/design-tokens/tokens.json. Не редактировать. -->")
            sb.appendLine("<resources>")
            base.forEach { (k, v) ->
                val hex = if (dark) dark(v) ?: value(v) else value(v)
                sb.appendLine("    <color name=\"afisha_${k.replace('-', '_')}\">$hex</color>")
            }
            if (!dark) {
                category.forEach { (k, v) -> sb.appendLine("    <color name=\"afisha_category_$k\">${value(v)}</color>") }
            }
            sb.appendLine("</resources>")
            val d = res.resolve(dirName)
            d.mkdirs()
            d.resolve("afisha_colors.xml").writeText(sb.toString())
        }
    }

    private fun value(node: Any?): String = ((node as Map<*, *>)["\$value"]).toString()

    private fun dark(node: Any?): String? = ((node as Map<*, *>)["\$extensions"] as? Map<*, *>)?.get("dark")?.toString()

    private fun colorLiteral(hex: String): String {
        val h = hex.removePrefix("#").uppercase()
        require(h.length == 6) { "Ожидался цвет #RRGGBB, получено $hex" }
        return "Color(0xFF$h)"
    }

    private fun num(v: Any?): String = when (v) {
        is Number -> if (v.toDouble() % 1.0 == 0.0) v.toLong().toString() else v.toString()
        else -> v.toString()
    }

    private fun pascal(key: String): String =
        key.split('-', '_').joinToString("") { part -> part.replaceFirstChar { it.uppercase() } }
}
