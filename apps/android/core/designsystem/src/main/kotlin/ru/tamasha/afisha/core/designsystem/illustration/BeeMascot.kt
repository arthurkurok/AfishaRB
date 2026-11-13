package ru.tamasha.afisha.core.designsystem.illustration

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import ru.tamasha.afisha.core.designsystem.R
import ru.tamasha.afisha.core.designsystem.theme.AfishaTheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import kotlin.math.min

/** Эмоции пчелы Бал, нужные экранам (полный набор из 12 — у иллюстратора, docs/07-design.md §3). */
public enum class BeeMood { Greeting, Thinking, Found, Clarifying, NotFound, Offline, Sleeping }

/**
 * Пчела Бал — проводник Гида. Плейсхолдер в коде: медовое тело **без чёрных полос**
 * (полоски заменены коралловым пояском-орнаментом), крылья с прожилками-ромбами, большие глаза.
 * Силуэт читается и в 24 dp, и в 160 dp. Владелец заменит на Lottie/Rive.
 */
@Composable
public fun BeeMascot(
    mood: BeeMood,
    modifier: Modifier = Modifier,
    size: Dp = 96.dp,
    decorative: Boolean = false,
) {
    val label = stringResource(R.string.mascot_cd)
    val ink = AfishaTheme.colors.ink
    Canvas(
        modifier
            .size(size)
            .then(if (decorative) Modifier else Modifier.semantics { contentDescription = label }),
    ) {
        drawBee(mood, ink)
    }
}

/** Рисует пчелу в квадрате текущего размера. */
public fun DrawScope.drawBee(mood: BeeMood, outline: Color) {
    val s = min(size.width, size.height)
    val ox = (size.width - s) / 2f
    val oy = (size.height - s) / 2f
    val honey = Tokens.Light.Honey
    val honeyLight = lerp(honey, Color.White, 0.35f)
    val coral = Tokens.Light.Accent
    val eyeInk = Tokens.Light.Ink
    val line = s * 0.025f
    translate(ox, oy) {
        // Крылья: полупрозрачные, с прожилками-ромбами
        val wingColor = Color.White.copy(alpha = 0.7f)
        val wingStroke = outline.copy(alpha = 0.45f)
        val wings = listOf(Offset(s * 0.40f, s * 0.26f) to -20f, Offset(s * 0.58f, s * 0.24f) to 18f)
        val flap = if (mood == BeeMood.Greeting || mood == BeeMood.Thinking) 8f else 0f
        for ((c, angle) in wings) {
            rotate(angle + if (angle < 0) -flap else flap, pivot = c) {
                drawOval(wingColor, topLeft = Offset(c.x - s * 0.13f, c.y - s * 0.18f), size = Size(s * 0.26f, s * 0.34f))
                drawOval(wingStroke, topLeft = Offset(c.x - s * 0.13f, c.y - s * 0.18f), size = Size(s * 0.26f, s * 0.34f), style = Stroke(line))
                drawPath(Ornament.diamond(c, s * 0.05f, s * 0.08f), wingStroke, style = Stroke(line * 0.8f))
            }
        }
        // Тело — медовый янтарь
        val bodyTop = Offset(s * 0.18f, s * 0.38f)
        val bodySize = Size(s * 0.56f, s * 0.42f)
        drawOval(Brush.verticalGradient(listOf(honeyLight, honey), startY = bodyTop.y, endY = bodyTop.y + bodySize.height), bodyTop, bodySize)
        // Коралловый поясок-орнамент вместо полос
        val beltX = s * 0.40f
        drawRect(coral, topLeft = Offset(beltX, s * 0.39f), size = Size(s * 0.09f, s * 0.40f), alpha = 0.95f)
        for (i in 0..2) drawPath(Ornament.diamond(Offset(beltX + s * 0.045f, s * (0.48f + i * 0.11f)), s * 0.022f), honeyLight)
        drawOval(outline.copy(alpha = 0.55f), bodyTop, bodySize, style = Stroke(line))
        // Жало-кончик
        drawPath(Path().apply {
            moveTo(s * 0.19f, s * 0.56f)
            lineTo(s * 0.11f, s * 0.59f)
            lineTo(s * 0.19f, s * 0.62f)
            close()
        }, outline.copy(alpha = 0.7f))
        // Голова
        val head = Offset(s * 0.74f, s * 0.52f)
        val headR = s * 0.16f
        drawCircle(honey, headR, head)
        drawCircle(outline.copy(alpha = 0.55f), headR, head, style = Stroke(line))
        // Усики-завитки
        drawPath(Ornament.kuskar(Offset(s * 0.80f, s * 0.26f), s * 0.05f, 1.2f), outline, style = Stroke(line, cap = StrokeCap.Round))
        drawLine(outline, Offset(s * 0.76f, s * 0.37f), Offset(s * 0.80f, s * 0.29f), line, StrokeCap.Round)
        // Глаза
        val eyeL = Offset(head.x - headR * 0.35f, head.y - headR * 0.15f)
        val eyeR = Offset(head.x + headR * 0.40f, head.y - headR * 0.15f)
        val eyeRadius = headR * 0.30f
        if (mood == BeeMood.Sleeping) {
            for (e in listOf(eyeL, eyeR)) {
                drawArc(eyeInk, 20f, 140f, false, Offset(e.x - eyeRadius, e.y - eyeRadius), Size(eyeRadius * 2, eyeRadius * 2), style = Stroke(line, cap = StrokeCap.Round))
            }
        } else {
            val look = when (mood) {
                BeeMood.Thinking -> Offset(0f, -eyeRadius * 0.35f)
                BeeMood.NotFound -> Offset(0f, eyeRadius * 0.25f)
                else -> Offset(eyeRadius * 0.15f, 0f)
            }
            for (e in listOf(eyeL, eyeR)) {
                drawCircle(Color.White, eyeRadius, e)
                drawCircle(eyeInk, eyeRadius * 0.55f, e + look)
                drawCircle(Color.White, eyeRadius * 0.18f, e + look + Offset(-eyeRadius * 0.18f, -eyeRadius * 0.2f))
            }
        }
        // Рот
        val mouthY = head.y + headR * 0.45f
        val mouth = Path().apply {
            moveTo(head.x - headR * 0.30f, mouthY)
            val depth = if (mood == BeeMood.NotFound || mood == BeeMood.Offline) -headR * 0.18f else headR * 0.22f
            quadraticTo(head.x + headR * 0.05f, mouthY + depth, head.x + headR * 0.38f, mouthY)
        }
        drawPath(mouth, eyeInk, style = Stroke(line, cap = StrokeCap.Round))
        // Детали настроения
        when (mood) {
            BeeMood.Clarifying -> drawDiamondQuestion(Offset(s * 0.90f, s * 0.12f), s * 0.035f, coral)
            BeeMood.Thinking -> for (i in 0..2) drawPath(Ornament.diamond(Offset(s * (0.10f + i * 0.07f), s * 0.20f), s * 0.022f), coral)
            BeeMood.Found -> {
                // Держит карточку
                drawRoundRect(Color.White, topLeft = Offset(s * 0.52f, s * 0.72f), size = Size(s * 0.30f, s * 0.20f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(s * 0.03f))
                drawRect(coral, topLeft = Offset(s * 0.52f, s * 0.89f), size = Size(s * 0.30f, s * 0.03f))
            }
            BeeMood.NotFound -> {
                drawLine(outline, Offset(s * 0.30f, s * 0.80f), Offset(s * 0.20f, s * 0.90f), line, StrokeCap.Round)
                drawLine(outline, Offset(s * 0.62f, s * 0.80f), Offset(s * 0.74f, s * 0.90f), line, StrokeCap.Round)
            }
            BeeMood.Offline -> for (i in 1..3) {
                drawArc(outline.copy(alpha = 0.3f * i), 225f, 90f, false, Offset(s * 0.12f - i * s * 0.03f, s * 0.08f - i * s * 0.03f), Size(s * 0.06f * i + s * 0.04f, s * 0.06f * i + s * 0.04f), style = Stroke(line, cap = StrokeCap.Round))
            }
            BeeMood.Greeting -> drawLine(outline, Offset(s * 0.70f, s * 0.70f), Offset(s * 0.86f, s * 0.82f), line, StrokeCap.Round)
            BeeMood.Sleeping -> for (i in 0..1) drawPath(Ornament.diamond(Offset(s * (0.88f + i * 0.06f), s * (0.20f - i * 0.08f)), s * (0.02f + i * 0.01f)), outline.copy(alpha = 0.6f))
        }
    }
}

/** Знак вопроса из ромбов — «уточняет». */
private fun DrawScope.drawDiamondQuestion(origin: Offset, d: Float, color: Color) {
    val pts = listOf(
        Offset(-1.5f, 0f), Offset(-0.8f, -1.6f), Offset(0.6f, -1.8f), Offset(1.6f, -0.8f),
        Offset(1.2f, 0.6f), Offset(0.2f, 1.4f), Offset(0.2f, 2.8f), Offset(0.2f, 4.4f),
    )
    pts.forEachIndexed { i, p ->
        if (i == pts.lastIndex) {
            drawPath(Ornament.diamond(origin + Offset(p.x * d * 1.4f, p.y * d * 1.4f), d * 0.9f), color)
        } else if (i != pts.lastIndex - 1) {
            drawPath(Ornament.diamond(origin + Offset(p.x * d * 1.4f, p.y * d * 1.4f), d * 0.6f), color)
        }
    }
}

/**
 * Фирменная загрузка: пчела летит по спирали-ҡусҡару (docs/07-design.md §9).
 * При «Убрать анимации» — только пульсация прозрачности.
 */
@Composable
public fun BeeLoader(modifier: Modifier = Modifier, size: Dp = 72.dp) {
    val reduce = AfishaTheme.reduceMotion
    val colors = AfishaTheme.colors
    val transition = rememberInfiniteTransition(label = "bee")
    val t by transition.animateFloat(
        initialValue = 0f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(if (reduce) 900 else 1800, easing = LinearEasing), RepeatMode.Reverse),
        label = "t",
    )
    val label = stringResource(R.string.state_loading)
    Canvas(
        modifier
            .size(size)
            .semantics { contentDescription = label }
            .then(if (reduce) Modifier.alpha(0.4f + 0.6f * t) else Modifier),
    ) {
        val s = min(this.size.width, this.size.height)
        val center = Offset(s / 2f, s / 2f)
        val radius = s * 0.42f
        drawPath(Ornament.kuskar(center, radius, 1.75f), colors.line, style = Stroke(s * 0.025f, cap = StrokeCap.Round))
        val p = if (reduce) center else Ornament.kuskarPoint(center, radius, 1.75f, 0.15f + 0.85f * t)
        val beeSize = s * 0.42f
        translate(p.x - beeSize / 2f, p.y - beeSize / 2f) {
            drawBeeScaled(beeSize, colors.ink)
        }
    }
}

private fun DrawScope.drawBeeScaled(boxSize: Float, outline: Color) {
    val k = boxSize / min(size.width, size.height)
    scale(k, k, pivot = Offset.Zero) { drawBee(BeeMood.Thinking, outline) }
}
