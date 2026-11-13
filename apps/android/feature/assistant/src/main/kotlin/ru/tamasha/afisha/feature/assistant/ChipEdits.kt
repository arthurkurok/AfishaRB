package ru.tamasha.afisha.feature.assistant

import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import ru.tamasha.afisha.core.model.AfishaFormatter
import ru.tamasha.afisha.core.model.RegionClock
import ru.tamasha.afisha.core.model.UnderstandingChip

/** Что можно сделать с чипом понимания. */
public enum class ChipEdit { Remove, Today, Tomorrow, Weekend }

/**
 * Патчи слотов для правки чипа (имена слотов — как в ответе `/v1/assistant`, docs/05-ai-agent.md §2.3).
 * Сервер применяет патч к сохранённым слотам разговора — переписывать запрос не нужно.
 */
public object ChipEdits {
    /** «Убрать» — только если сервер прислал патч `clear` (null — условие не удаляемое). */
    public fun optionsFor(chip: UnderstandingChip): List<ChipEdit> = buildList {
        if (chip.slot == "date") addAll(listOf(ChipEdit.Today, ChipEdit.Tomorrow, ChipEdit.Weekend))
        if (chip.clear != null) add(ChipEdit.Remove)
    }

    public fun patch(
        chip: UnderstandingChip,
        edit: ChipEdit,
        clock: RegionClock,
        formatter: AfishaFormatter,
        wholeRepublicLabel: String,
    ): Map<String, JsonElement?> = when (edit) {
        ChipEdit.Today -> datePatch(clock.today().toString(), formatter.dayHeader(clock.today()))
        ChipEdit.Tomorrow -> clock.today().plusDays(1).let { datePatch(it.toString(), formatter.dayHeader(it)) }
        ChipEdit.Weekend -> mapOf("__when" to JsonPrimitive("weekend"))
        ChipEdit.Remove -> chip.clear ?: removePatch(chip.slot, wholeRepublicLabel)
    }

    private fun datePatch(date: String, label: String): Map<String, JsonElement?> = mapOf(
        "date_from" to JsonPrimitive(date),
        "date_to" to JsonPrimitive(date),
        "date_label" to JsonPrimitive(label.replace(' ', ' ')),
        "date_source" to JsonPrimitive("user"),
    )

    public fun removePatch(slot: String, wholeRepublicLabel: String): Map<String, JsonElement?> = when (slot) {
        "date" -> mapOf("date_from" to JsonNull, "date_to" to JsonNull, "date_label" to JsonNull, "date_source" to JsonNull)
        "time_of_day" -> mapOf("time_of_day" to JsonArray(emptyList()))
        // Явно «вся республика», иначе сервер снова подставит город из профиля
        "municipality" -> mapOf(
            "municipality_id" to JsonNull,
            "municipality_label" to JsonPrimitive(wholeRepublicLabel),
            "municipality_source" to JsonPrimitive("user"),
        )
        "near" -> mapOf("near_me" to JsonPrimitive(false))
        "kids" -> mapOf("with_kids" to JsonPrimitive(false), "kids_ages" to JsonArray(emptyList()))
        "budget" -> mapOf("budget" to JsonNull, "budget_per" to JsonNull, "free_only" to JsonPrimitive(false))
        "category" -> mapOf("categories" to JsonArray(emptyList()), "tags" to JsonArray(emptyList()))
        "pushkin" -> mapOf("pushkin" to JsonPrimitive(false))
        "accessible" -> mapOf("accessible" to JsonPrimitive(false))
        "text" -> mapOf("text" to JsonNull)
        else -> emptyMap()
    }
}
