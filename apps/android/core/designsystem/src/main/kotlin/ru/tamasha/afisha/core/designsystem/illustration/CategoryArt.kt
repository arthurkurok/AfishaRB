package ru.tamasha.afisha.core.designsystem.illustration

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Fill
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.component.titleRes
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.Category
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.min
import kotlin.math.sin

/**
 * Линейная иконка-мотив категории (docs/07-design.md §4.2, §8): сетка 24, линия 2.
 * Театр — маска из двух ҡусҡаров, музыка — курай со звуковыми завитками, музеи — ромб-рамка,
 * детям — солнышко-ҡусҡар, народная культура — древо жизни, кино — ромб-кадр, лекции — йөрәккәй.
 */
@Composable
public fun CategoryIcon(
    category: Category,
    modifier: Modifier = Modifier,
    tint: Color = AfishaTheme.colors.ink,
    size: Dp = 24.dp,
) {
    Canvas(modifier.size(size)) { drawCategoryMotif(category, tint, strokeWidth = 2f) }
}

/** Мотив категории в координатах 24×24, масштабированный под текущий размер. */
internal fun DrawScope.drawCategoryMotif(category: Category, color: Color, strokeWidth: Float, box: Size = size) {
    val k = min(box.width, box.height) / 24f
    val dx = (box.width - 24f * k) / 2f
    val dy = (box.height - 24f * k) / 2f
    translate(dx, dy) {
        scale(k, k, pivot = Offset.Zero) {
            val stroke = Stroke(width = strokeWidth, cap = StrokeCap.Round, join = StrokeJoin.Round)
            when (category) {
                Category.Theatre -> {
                    // Два завитка — глаза маски, дуга — улыбка
                    drawPath(Ornament.kuskar(Offset(8f, 9f), 4.5f, 1.3f, startAngle = PI.toFloat(), clockwise = true), color, style = stroke)
                    drawPath(Ornament.kuskar(Offset(16f, 9f), 4.5f, 1.3f, startAngle = 0f, clockwise = false), color, style = stroke)
                    val mouth = Path().apply {
                        moveTo(6f, 15f)
                        quadraticTo(12f, 21.5f, 18f, 15f)
                    }
                    drawPath(mouth, color, style = stroke)
                }
                Category.Music -> {
                    // Стебель курая и звуковые волны-завитки
                    drawLine(color, Offset(7f, 21f), Offset(11f, 3f), strokeWidth, StrokeCap.Round)
                    for (i in 0..2) drawCircle(color, 0.9f, Offset(8.2f + i * 0.9f, 15.5f - i * 4f))
                    val w1 = Path().apply { moveTo(15f, 8f); quadraticTo(18f, 11f, 15f, 14f) }
                    val w2 = Path().apply { moveTo(18f, 5.5f); quadraticTo(23f, 11f, 18f, 16.5f) }
                    drawPath(w1, color, style = stroke)
                    drawPath(w2, color, style = stroke)
                }
                Category.Museum -> {
                    drawPath(Ornament.diamond(Offset(12f, 12f), 10f), color, style = stroke)
                    drawPath(Ornament.diamond(Offset(12f, 12f), 5f), color, style = stroke)
                }
                Category.Kids -> {
                    drawPath(Ornament.kuskar(Offset(12f, 12f), 4.5f, 1.5f), color, style = stroke)
                    for (i in 0 until 8) {
                        val a = i * PI.toFloat() / 4f
                        drawLine(
                            color,
                            Offset(12f + 7f * cos(a), 12f + 7f * sin(a)),
                            Offset(12f + 10f * cos(a), 12f + 10f * sin(a)),
                            strokeWidth,
                            StrokeCap.Round,
                        )
                    }
                }
                Category.Folk -> {
                    // Древо жизни (ағас): ствол и симметричные ветви-завитки
                    drawLine(color, Offset(12f, 22f), Offset(12f, 4f), strokeWidth, StrokeCap.Round)
                    for ((y, r) in listOf(15f to 5f, 9.5f to 4f)) {
                        drawPath(Path().apply { moveTo(12f, y + 2f); quadraticTo(12f - r, y, 12f - r - 1f, y - r) }, color, style = stroke)
                        drawPath(Path().apply { moveTo(12f, y + 2f); quadraticTo(12f + r, y, 12f + r + 1f, y - r) }, color, style = stroke)
                    }
                    drawPath(Ornament.diamond(Offset(12f, 3.5f), 1.6f), color, style = Fill)
                    drawLine(color, Offset(7f, 22f), Offset(17f, 22f), strokeWidth, StrokeCap.Round)
                }
                Category.Cinema -> {
                    drawPath(Ornament.diamond(Offset(12f, 12f), 10f, 9f), color, style = stroke)
                    drawCircle(color, 3f, Offset(12f, 12f), style = stroke)
                    for (p in listOf(Offset(12f, 5.5f), Offset(18.5f, 12f), Offset(12f, 18.5f), Offset(5.5f, 12f))) {
                        drawCircle(color, 0.9f, p)
                    }
                }
                Category.Education -> {
                    // Йөрәккәй — «сердечко» гостеприимства, с завитками сверху
                    val heart = Path().apply {
                        moveTo(12f, 20.5f)
                        cubicTo(4f, 15f, 2.5f, 10f, 5f, 7f)
                        cubicTo(7.5f, 4f, 11f, 5f, 12f, 8.5f)
                        cubicTo(13f, 5f, 16.5f, 4f, 19f, 7f)
                        cubicTo(21.5f, 10f, 20f, 15f, 12f, 20.5f)
                        close()
                    }
                    drawPath(heart, color, style = stroke)
                    drawPath(Ornament.diamond(Offset(12f, 13f), 2.2f), color, style = Fill)
                }
            }
        }
    }
}

/**
 * Иллюстрация-обложка категории, если у события нет фото (docs/07-design.md §8):
 * плоская геометрия, 3–4 цвета палитры, орнаментальный паттерн, без людей.
 */
@Composable
public fun CategoryIllustration(category: Category, modifier: Modifier = Modifier) {
    val base = AfishaTheme.colors.category(category)
    val label = stringResource(R.string.card_illustration_cd, stringResource(category.titleRes()))
    Box(modifier.semantics { contentDescription = label }) {
        Canvas(Modifier.fillMaxSize()) { drawCategoryIllustration(category, base) }
    }
}

internal fun DrawScope.drawCategoryIllustration(category: Category, base: Color) {
    val light = Tokens.Light.OnAccent
    val honey = Tokens.Light.Honey
    drawRect(base)
    // Мелкий ромбовый паттерн по фону
    val cell = min(size.width, size.height) / 6f
    var row = 0
    var y = cell / 2f
    while (y < size.height + cell) {
        var x = if (row % 2 == 0) cell / 2f else cell
        while (x < size.width + cell) {
            drawPath(Ornament.diamond(Offset(x, y), cell * 0.12f), light.copy(alpha = 0.10f))
            x += cell
        }
        y += cell / 2f
        row++
    }
    // Кайма из ромбов внизу — как орнамент по подолу
    val bandH = size.height * 0.12f
    drawRect(Tokens.Light.Ink.copy(alpha = 0.18f), topLeft = Offset(0f, size.height - bandH), size = Size(size.width, bandH))
    Ornament.diamondBand(Rect(0f, size.height - bandH, size.width, size.height), count = (size.width / bandH).toInt().coerceAtLeast(3))
        .forEachIndexed { i, p -> drawPath(p, if (i % 2 == 0) honey else light.copy(alpha = 0.7f)) }
    // Завитки ҡусҡар по углам
    val r = min(size.width, size.height) * 0.16f
    drawPath(Ornament.kuskar(Offset(r * 1.1f, r * 1.1f), r, 1.5f), honey.copy(alpha = 0.9f), style = Stroke(width = r * 0.14f, cap = StrokeCap.Round))
    drawPath(
        Ornament.kuskar(Offset(size.width - r * 1.1f, size.height - bandH - r * 1.1f), r, 1.5f, startAngle = PI.toFloat(), clockwise = false),
        light.copy(alpha = 0.35f),
        style = Stroke(width = r * 0.14f, cap = StrokeCap.Round),
    )
    // Мотив категории — крупно в центре
    val motif = min(size.width, size.height) * 0.46f
    translate(left = (size.width - motif) / 2f, top = (size.height - bandH - motif) / 2f) {
        drawCategoryMotif(category, light, strokeWidth = 2.2f, box = Size(motif, motif))
    }
}
