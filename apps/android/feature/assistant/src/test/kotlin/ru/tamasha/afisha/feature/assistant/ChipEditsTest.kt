package ru.tamasha.afisha.feature.assistant

import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import ru.tamasha.afisha.core.model.AfishaFormatter
import ru.tamasha.afisha.core.model.AppLanguage
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.SlotSource
import ru.tamasha.afisha.core.model.UnderstandingChip
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

class ChipEditsTest {
    // 2 ноября 2026, 01:30 по Уфе (а в UTC ещё 1 ноября)
    private val clock = RegionClock(clock = Clock.fixed(Instant.parse("2026-11-01T20:30:00Z"), ZoneOffset.UTC))
    private val formatter = AfishaFormatter(AppLanguage.Ru, clock)

    @Test
    fun `серверный патч clear важнее локального`() {
        val clear = mapOf("municipality_id" to JsonNull, "municipality_label" to JsonPrimitive("вся республика"))
        val chip = UnderstandingChip("municipality", "Уфа", SlotSource.User, clear)
        assertEquals(listOf(ChipEdit.Remove), ChipEdits.optionsFor(chip))
        assertEquals(clear, ChipEdits.patch(chip, ChipEdit.Remove, clock, formatter, "вся республика"))
    }

    @Test
    fun `неудаляемое условие не предлагает «убрать»`() {
        val chip = UnderstandingChip("kids", "с ребёнком", SlotSource.User, clear = null)
        assertTrue(ChipEdits.optionsFor(chip).isEmpty())
    }

    @Test
    fun `дату можно сменить на сегодня по поясу региона`() {
        val chip = UnderstandingChip("date", "Суббота, 7 ноября", SlotSource.User, clear = mapOf("date_from" to JsonNull))
        assertEquals(listOf(ChipEdit.Today, ChipEdit.Tomorrow, ChipEdit.Weekend, ChipEdit.Remove), ChipEdits.optionsFor(chip))
        val today = ChipEdits.patch(chip, ChipEdit.Today, clock, formatter, "")
        assertEquals(JsonPrimitive("2026-11-02"), today["date_from"])
        assertEquals(JsonPrimitive("Сегодня, 2 ноября"), today["date_label"])
        assertEquals(mapOf("__when" to JsonPrimitive("weekend")), ChipEdits.patch(chip, ChipEdit.Weekend, clock, formatter, ""))
    }
}
