package ru.tamasha.afisha.core.designsystem

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer

/**
 * Шрифты обязаны содержать все башкирские буквы (docs/07-design.md §1, §5):
 * Ә Ғ Ҙ Ҡ Ң Ө Ҫ Ү Һ и строчные. Проверяем таблицу cmap самих файлов из res/font.
 */
class FontGlyphsTest {

    private val bashkir = "ӘәҒғҘҙҠҡҢңӨөҪҫҮүҺһ"
    private val sample = "Әҙәбиәт, ҡурай, һөнәр, өмөт, ғүмер, ң, ҫү — Ә Ҙ Ҡ Һ Ө Ғ Ң Ҫ Ү"

    private fun font(name: String): File {
        val candidates = listOf(File("src/main/res/font/$name"), File("core/designsystem/src/main/res/font/$name"))
        return candidates.first { it.exists() }
    }

    @Test
    fun `Golos Text содержит башкирские буквы`() = assertCovers("golos_text.ttf")

    @Test
    fun `Commissioner содержит башкирские буквы`() = assertCovers("commissioner.ttf")

    private fun assertCovers(file: String) {
        val cmap = CmapReader.codepoints(font(file).readBytes())
        val missing = (bashkir + sample).filter { it.isLetter() && it.code !in cmap }.toSet()
        assertTrue("$file: нет глифов для $missing", missing.isEmpty())
        assertTrue("$file: нет базовой кириллицы", ('А'..'я').all { it.code in cmap })
    }
}

/** Минимальный разбор cmap (форматы 4 и 12) — без сторонних библиотек. */
internal object CmapReader {
    fun codepoints(bytes: ByteArray): Set<Int> {
        val buf = ByteBuffer.wrap(bytes)
        val numTables = buf.getShort(4).toInt() and 0xFFFF
        var cmapOffset = -1
        for (i in 0 until numTables) {
            val rec = 12 + i * 16
            val tag = String(bytes, rec, 4, Charsets.US_ASCII)
            if (tag == "cmap") cmapOffset = buf.getInt(rec + 8)
        }
        require(cmapOffset >= 0) { "Нет таблицы cmap" }
        val result = HashSet<Int>()
        val subtables = buf.getShort(cmapOffset + 2).toInt() and 0xFFFF
        for (i in 0 until subtables) {
            val rec = cmapOffset + 4 + i * 8
            val offset = cmapOffset + buf.getInt(rec + 4)
            when (buf.getShort(offset).toInt() and 0xFFFF) {
                4 -> readFormat4(buf, offset, result)
                12 -> readFormat12(buf, offset, result)
            }
        }
        return result
    }

    private fun readFormat4(buf: ByteBuffer, offset: Int, out: MutableSet<Int>) {
        val segX2 = buf.getShort(offset + 6).toInt() and 0xFFFF
        val ends = offset + 14
        val starts = ends + segX2 + 2
        val deltas = starts + segX2
        val rangeOffsets = deltas + segX2
        for (s in 0 until segX2 / 2) {
            val end = buf.getShort(ends + s * 2).toInt() and 0xFFFF
            val start = buf.getShort(starts + s * 2).toInt() and 0xFFFF
            val delta = buf.getShort(deltas + s * 2).toInt()
            val ro = buf.getShort(rangeOffsets + s * 2).toInt() and 0xFFFF
            for (c in start..end) {
                if (c == 0xFFFF) continue
                val glyph = if (ro == 0) {
                    (c + delta) and 0xFFFF
                } else {
                    val addr = rangeOffsets + s * 2 + ro + (c - start) * 2
                    val g = buf.getShort(addr).toInt() and 0xFFFF
                    if (g == 0) 0 else (g + delta) and 0xFFFF
                }
                if (glyph != 0) out += c
            }
        }
    }

    private fun readFormat12(buf: ByteBuffer, offset: Int, out: MutableSet<Int>) {
        val groups = buf.getInt(offset + 12)
        for (g in 0 until groups) {
            val rec = offset + 16 + g * 12
            val start = buf.getInt(rec)
            val end = buf.getInt(rec + 4)
            for (c in start..end) out += c
        }
    }
}
