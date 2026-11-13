package ru.tamasha.afisha.core.model

import java.time.Clock
import java.time.OffsetDateTime
import java.time.ZoneOffset

/** Часы, остановленные в момент, заданный местным временем региона (UTC+5). */
internal fun regionAt(localIso: String): RegionClock {
    val instant = OffsetDateTime.parse("$localIso+05:00").toInstant()
    return RegionClock(clock = Clock.fixed(instant, ZoneOffset.UTC))
}
