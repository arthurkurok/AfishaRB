package ru.tamasha.afisha.core.designsystem

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.tamasha.afisha.core.designsystem.theme.AfishaColors
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.Category

/** Сгенерированный Tokens.kt совпадает с tokens.json, пары текст/фон проходят WCAG 2.2 AA. */
class TokensTest {

    private fun contrast(a: Color, b: Color): Double {
        val la = a.luminance() + 0.05
        val lb = b.luminance() + 0.05
        return (maxOf(la, lb) / minOf(la, lb)).toDouble()
    }

    @Test
    fun `значения из tokens json`() {
        assertEquals(Color(0xFFB8322A), Tokens.Light.Accent)
        assertEquals(Color(0xFFF07A68), Tokens.Dark.Accent)
        assertEquals(Color(0xFF16120F), Tokens.Dark.Bg)
        assertEquals(14f, Tokens.Radius.M.value)
        assertEquals(220, Tokens.Motion.Base)
        assertEquals(48f, Tokens.Touch.MinAndroid.value)
    }

    @Test
    fun `основной текст и акцент читаются в обеих темах`() {
        for (c in listOf(AfishaColors.Light, AfishaColors.Dark)) {
            assertTrue(contrast(c.ink, c.bg) >= 4.5)
            assertTrue(contrast(c.ink2, c.surface) >= 4.5)
            assertTrue(contrast(c.onAccent, c.accent) >= 4.5)
            assertTrue("шафран — только под тёмным текстом", contrast(c.onHoney, c.honey) >= 4.5)
        }
    }

    @Test
    fun `белый текст на цвете категории не ниже 4,5 к 1`() {
        Category.entries.forEach {
            val ratio = contrast(Color.White, AfishaColors.Light.category(it))
            assertTrue("$it: $ratio", ratio >= 4.5)
        }
    }
}
