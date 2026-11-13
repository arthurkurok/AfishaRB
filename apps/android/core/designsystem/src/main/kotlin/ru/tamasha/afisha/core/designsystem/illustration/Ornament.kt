package ru.tamasha.afisha.core.designsystem.illustration

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

/**
 * Геометрия орнамента: ҡусҡар (завиток-«улитка») и ромб.
 * Плейсхолдеры иллюстраций рисуются в коде — владелец позже заменит их векторными ассетами.
 */
public object Ornament {
    /**
     * Завиток ҡусҡар — архимедова спираль от центра наружу.
     * [startAngle] в радианах, [clockwise] — направление закрутки.
     */
    public fun kuskar(
        center: Offset,
        radius: Float,
        turns: Float = 1.6f,
        startAngle: Float = 0f,
        clockwise: Boolean = true,
        steps: Int = 64,
    ): Path {
        val path = Path()
        val total = turns * 2f * PI.toFloat()
        val dir = if (clockwise) 1f else -1f
        for (i in 0..steps) {
            val t = i / steps.toFloat()
            val a = startAngle + dir * t * total
            val r = radius * t
            val p = Offset(center.x + r * cos(a), center.y + r * sin(a))
            if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y)
        }
        return path
    }

    /** Точка на той же спирали — для полёта пчелы по траектории-завитку. */
    public fun kuskarPoint(center: Offset, radius: Float, turns: Float, t: Float, startAngle: Float = 0f): Offset {
        val a = startAngle + t * turns * 2f * PI.toFloat()
        val r = radius * t
        return Offset(center.x + r * cos(a), center.y + r * sin(a))
    }

    /** Ромб по центру и полуосям. */
    public fun diamond(center: Offset, halfWidth: Float, halfHeight: Float = halfWidth): Path = Path().apply {
        moveTo(center.x, center.y - halfHeight)
        lineTo(center.x + halfWidth, center.y)
        lineTo(center.x, center.y + halfHeight)
        lineTo(center.x - halfWidth, center.y)
        close()
    }

    /** Кайма — ряд ромбов вдоль прямоугольника [band]. */
    public fun diamondBand(band: Rect, count: Int): List<Path> {
        if (count <= 0) return emptyList()
        val step = band.width / count
        val half = minOf(step, band.height) / 2f * 0.8f
        return (0 until count).map { i -> diamond(Offset(band.left + step * (i + 0.5f), band.center.y), half) }
    }
}
