package ru.tamasha.afisha.core.designsystem.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Shapes
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import kotlin.math.min

/** Радиусы Material 3 из токенов `radius.*`. */
internal val AfishaShapes: Shapes = Shapes(
    extraSmall = RoundedCornerShape(Tokens.Radius.S),
    small = RoundedCornerShape(Tokens.Radius.S),
    medium = RoundedCornerShape(Tokens.Radius.M),
    large = RoundedCornerShape(Tokens.Radius.L),
    extraLarge = RoundedCornerShape(Tokens.Radius.L),
)

/**
 * Ромб — главный графический атом (docs/07-design.md §6): дата, бейджи, буллеты, кнопка «в избранное».
 * [cornerFraction] слегка скругляет вершины, чтобы ромб не «колол» глаз на мелких размерах.
 */
public class DiamondShape(private val cornerFraction: Float = 0.08f) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline =
        Outline.Generic(diamondPath(Rect(Offset.Zero, size), cornerFraction))
}

/** Путь ромба в прямоугольнике [r] со скруглёнными вершинами. */
public fun diamondPath(r: Rect, cornerFraction: Float = 0.08f): Path {
    val pts = listOf(
        Offset(r.center.x, r.top),
        Offset(r.right, r.center.y),
        Offset(r.center.x, r.bottom),
        Offset(r.left, r.center.y),
    )
    val path = Path()
    val k = cornerFraction.coerceIn(0f, 0.3f)
    for (i in pts.indices) {
        val prev = pts[(i + pts.size - 1) % pts.size]
        val cur = pts[i]
        val next = pts[(i + 1) % pts.size]
        val inPt = cur + (prev - cur) * k
        val outPt = cur + (next - cur) * k
        if (i == 0) path.moveTo(inPt.x, inPt.y) else path.lineTo(inPt.x, inPt.y)
        path.quadraticTo(cur.x, cur.y, outPt.x, outPt.y)
    }
    path.close()
    return path
}

/**
 * Срез ҡусҡар — «почерк» продукта: у постера один угол (верхний «конечный») вырезан завитком.
 * Форма: скруглённый прямоугольник, где угол заменён вогнутой дугой; сам завиток рисует
 * [ru.tamasha.afisha.core.designsystem.component.KuskarCurl] поверх выреза.
 */
public class KuskarCutShape(
    private val cut: Dp,
    private val radius: Dp = Tokens.Radius.M,
) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val c = min(with(density) { cut.toPx() }, min(size.width, size.height) / 2f)
        val r = min(with(density) { radius.toPx() }, min(size.width, size.height) / 4f)
        val w = size.width
        val h = size.height
        val path = Path().apply {
            // Начинаем с верхнего левого угла и идём по часовой стрелке; срез — в верхнем правом
            moveTo(0f, r)
            quadraticTo(0f, 0f, r, 0f)
            lineTo(w - c, 0f)
            // Вогнутая дуга-завиток: от верхнего края внутрь и к правому краю
            cubicTo(w - c, c * 0.55f, w - c * 0.55f, c, w, c)
            lineTo(w, h - r)
            quadraticTo(w, h, w - r, h)
            lineTo(r, h)
            quadraticTo(0f, h, 0f, h - r)
            close()
        }
        if (layoutDirection == LayoutDirection.Rtl) {
            val mirrored = Path()
            mirrored.addPath(path)
            mirrored.transform(androidx.compose.ui.graphics.Matrix().apply { scale(-1f, 1f); translate(-w, 0f) })
            return Outline.Generic(mirrored)
        }
        return Outline.Generic(path)
    }
}

/** «Капля мёда» — форма бейджа «Мало билетов». */
public object HoneyDropShape : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val w = size.width
        val h = size.height
        val path = Path().apply {
            moveTo(w / 2f, 0f)
            cubicTo(w * 0.6f, h * 0.25f, w, h * 0.45f, w, h * 0.66f)
            cubicTo(w, h * 0.88f, w * 0.78f, h, w / 2f, h)
            cubicTo(w * 0.22f, h, 0f, h * 0.88f, 0f, h * 0.66f)
            cubicTo(0f, h * 0.45f, w * 0.4f, h * 0.25f, w / 2f, 0f)
            close()
        }
        return Outline.Generic(path)
    }
}
