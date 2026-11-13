package ru.tamasha.afisha.feature.event

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.provider.CalendarContract
import android.widget.Toast
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.core.net.toUri
import ru.tamasha.afisha.core.model.EventDetails
import ru.tamasha.afisha.core.model.Occurrence
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.Venue
import java.util.Locale

/** Платформенные действия паспорта: билеты, календарь, маршрут, «Поделиться», ярлык. */
internal object PlatformActions {

    fun openUrl(context: Context, url: String) {
        start(context, Intent(Intent.ACTION_VIEW, url.toUri()))
    }

    /**
     * «В календарь» через CalendarContract (без разрешения на запись календаря):
     * открывается системный редактор события с заполненными полями и поясом региона.
     */
    fun addToCalendar(context: Context, details: EventDetails, occurrence: Occurrence, clock: RegionClock) {
        val start = clock.parse(occurrence.startsAt) ?: return
        val end = clock.parse(occurrence.endsAt)?.takeIf { !occurrence.isRange } ?: start.plusHours(2)
        val intent = Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, start.toInstant().toEpochMilli())
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, end.toInstant().toEpochMilli())
            .putExtra(CalendarContract.Events.TITLE, details.summary.title)
            .putExtra(CalendarContract.Events.EVENT_TIMEZONE, clock.zone.id)
            .putExtra(CalendarContract.Events.EVENT_LOCATION, listOfNotNull(occurrence.venue?.name, occurrence.venue?.address).joinToString(", "))
            .putExtra(CalendarContract.Events.DESCRIPTION, details.summary.summary + "\n\n" + deepLink(details.summary.id))
        start(context, intent)
    }

    /** Маршрут: geo-интент открывает Яндекс Карты, 2ГИС или любое установленное приложение карт. */
    fun openRoute(context: Context, venue: Venue) {
        val geo = venue.geo
        val uri = if (geo != null) {
            val q = "%.6f,%.6f".format(Locale.ROOT, geo.lat, geo.lon)
            "geo:$q?q=$q(${Uri.encode(venue.name)})"
        } else {
            "geo:0,0?q=${Uri.encode(listOfNotNull(venue.address, venue.name).joinToString(", "))}"
        }
        val intent = Intent(Intent.ACTION_VIEW, uri.toUri())
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            // Нет приложения карт — открываем Яндекс Карты в браузере
            val web = if (geo != null) {
                "https://yandex.ru/maps/?pt=${geo.lon},${geo.lat}&z=16&l=map"
            } else {
                "https://yandex.ru/maps/?text=${Uri.encode(venue.address ?: venue.name)}"
            }
            openUrl(context, web)
        }
    }

    fun share(context: Context, chooserTitle: String, text: String) {
        val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text)
        start(context, Intent.createChooser(send, chooserTitle))
    }

    /** Динамический ярлык «последнее открытое событие» (App Shortcuts). */
    fun pushRecentShortcut(context: Context, details: EventDetails) {
        runCatching {
            val shortcut = ShortcutInfoCompat.Builder(context, "event-${details.summary.id}")
                .setShortLabel(details.summary.title.take(SHORT_LABEL))
                .setLongLabel(details.summary.title.take(LONG_LABEL))
                .setIcon(IconCompat.createWithResource(context, android.R.drawable.ic_menu_my_calendar))
                .setIntent(Intent(Intent.ACTION_VIEW, deepLink(details.summary.id).toUri()).setPackage(context.packageName))
                .build()
            ShortcutManagerCompat.pushDynamicShortcut(context, shortcut)
        }
    }

    fun deepLink(eventId: String): String = "afisha://event/$eventId"

    private fun start(context: Context, intent: Intent) {
        try {
            context.startActivity(intent)
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(context, context.getString(R.string.event_no_app), Toast.LENGTH_SHORT).show()
        }
    }

    private const val SHORT_LABEL = 24
    private const val LONG_LABEL = 48

    private object Uri {
        fun encode(s: String): String = android.net.Uri.encode(s)
    }
}
