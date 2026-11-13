package ru.tamasha.afisha.widget

import android.content.Context
import android.content.Intent
import androidx.compose.runtime.Composable
import androidx.core.net.toUri
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.material3.ColorProviders
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import dagger.hilt.EntryPoint
import dagger.hilt.InstallIn
import dagger.hilt.android.EntryPointAccessors
import dagger.hilt.components.SingletonComponent
import ru.tamasha.afisha.MainActivity
import ru.tamasha.afisha.R
import ru.tamasha.afisha.core.data.EventsRepository
import ru.tamasha.afisha.core.data.SettingsRepository
import ru.tamasha.afisha.core.designsystem.theme.afishaColorScheme
import ru.tamasha.afisha.core.designsystem.tokens.Tokens
import ru.tamasha.afisha.core.model.AfishaFormatter
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.SearchFilters
import ru.tamasha.afisha.core.model.WhenPreset

@EntryPoint
@InstallIn(SingletonComponent::class)
interface WidgetEntryPoint {
    fun events(): EventsRepository
    fun settings(): SettingsRepository
    fun clock(): RegionClock
}

/** Цвета виджета — те же токены, светлая и тёмная схема. */
private val WidgetColors = ColorProviders(light = afishaColorScheme(dark = false), dark = afishaColorScheme(dark = true))

private data class WidgetData(val city: String?, val items: List<Occurrence>, val offline: Boolean, val formatter: AfishaFormatter)

/**
 * Glance-виджет «Сегодня рядом»: 3 ближайших события сегодня в выбранном городе.
 * Данные — через тот же репозиторий с офлайн-кэшем; тап по строке — паспорт события (диплинк).
 */
class TodayWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entry = EntryPointAccessors.fromApplication(context.applicationContext, WidgetEntryPoint::class.java)
        val settings = entry.settings().current()
        val formatter = AfishaFormatter(settings.language, entry.clock())
        val filters = SearchFilters(whenPreset = WhenPreset.Today, municipalities = setOfNotNull(settings.municipalityId))
        val data = runCatching { entry.events().feed(filters, limit = MAX_ITEMS) }
            .map { WidgetData(settings.municipalityName, it.value.items.take(MAX_ITEMS), it.fromCache, formatter) }
            .getOrElse { WidgetData(settings.municipalityName, emptyList(), offline = true, formatter = formatter) }
        provideContent {
            GlanceTheme(colors = WidgetColors) { WidgetContent(data) }
        }
    }

    private companion object {
        const val MAX_ITEMS = 3
    }
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

private fun openIntent(context: Context, uri: String): Intent =
    Intent(Intent.ACTION_VIEW, uri.toUri(), context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)

@Composable
private fun WidgetContent(data: WidgetData) {
    val context = LocalContext.current
    val colors = GlanceTheme.colors
    Column(
        GlanceModifier
            .fillMaxSize()
            .background(colors.background)
            .cornerRadius(Tokens.Radius.L)
            .padding(Tokens.Space.S3),
    ) {
        Text(
            text = context.getString(R.string.widget_today_header, data.city ?: context.getString(R.string.widget_whole_republic)),
            style = TextStyle(color = colors.primary, fontSize = Tokens.Type.Body.size, fontWeight = FontWeight.Bold),
            maxLines = 1,
            modifier = GlanceModifier.clickable(actionStartActivity(openIntent(context, "afisha://today"))),
        )
        Spacer(GlanceModifier.height(Tokens.Space.S2))
        when {
            data.items.isEmpty() -> Text(
                text = context.getString(if (data.offline) R.string.widget_offline else R.string.widget_empty),
                style = TextStyle(color = colors.onSurfaceVariant, fontSize = Tokens.Type.Caption.size),
                modifier = GlanceModifier.clickable(actionStartActivity(openIntent(context, "afisha://today"))),
            )
            else -> data.items.forEach { occ ->
                EventRow(occ, data.formatter)
                Spacer(GlanceModifier.height(Tokens.Space.S1))
            }
        }
    }
}

@Composable
private fun EventRow(occ: Occurrence, formatter: AfishaFormatter) {
    val context = LocalContext.current
    val colors = GlanceTheme.colors
    // Выставка — период («до 30 ноября»), сеанс — время
    val time = if (occ.isRange) formatter.range(occ.startsAt, occ.endsAt) else formatter.time(occ.startsAt)
    val speech = formatter.cardSpeech(occ, null)
    Row(
        GlanceModifier
            .fillMaxWidth()
            .background(colors.surface)
            .cornerRadius(Tokens.Radius.M)
            .padding(horizontal = Tokens.Space.S3, vertical = Tokens.Space.S2)
            .semantics { contentDescription = speech }
            .clickable(actionStartActivity(openIntent(context, "afisha://event/${occ.event.id}"))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(GlanceModifier.width(Tokens.Space.S7 + Tokens.Space.S2)) {
            Text(time.replace(' ', ' '), style = TextStyle(color = colors.primary, fontSize = Tokens.Type.Caption.size, fontWeight = FontWeight.Bold), maxLines = 2)
        }
        Column(GlanceModifier.defaultWeight()) {
            Text(occ.event.title, style = TextStyle(color = colors.onSurface, fontSize = Tokens.Type.Caption.size, fontWeight = FontWeight.Medium), maxLines = 1)
            occ.venue?.name?.let {
                Text(it, style = TextStyle(color = colors.onSurfaceVariant, fontSize = Tokens.Type.Caption.size), maxLines = 1)
            }
        }
    }
}
