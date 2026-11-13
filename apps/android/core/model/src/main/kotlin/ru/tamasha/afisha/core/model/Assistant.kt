package ru.tamasha.afisha.core.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/** Тип ответа Гида (`POST /v1/assistant`). */
public enum class AssistantKind(public val code: String) {
    Results("results"),
    Clarify("clarify"),
    Empty("empty"),
    Answer("answer"),
    Offtopic("offtopic"),
    Help("help"),
    Error("error"),
    ;

    public companion object {
        public fun fromCode(code: String): AssistantKind = entries.firstOrNull { it.code == code } ?: Error
    }
}

/** Откуда взят слот: сказал пользователь (сплошной контур чипа) или достроено (пунктир). */
public enum class SlotSource(public val code: String) {
    User("user"),
    Inferred("inferred"),
    Profile("profile"),
    Default("default"),
    ;

    public val isExplicit: Boolean get() = this == User

    public companion object {
        public fun fromCode(code: String?): SlotSource = entries.firstOrNull { it.code == code } ?: Inferred
    }
}

/** Чип понимания запроса: «Суббота, 7 ноября», «Уфа», «до 1000 ₽». */
public data class UnderstandingChip(
    val slot: String,
    val label: String,
    val source: SlotSource,
    /** Патч «убрать это условие» от сервера (если есть). */
    val clear: Map<String, JsonElement?>? = null,
)

/** Кнопка быстрого ответа: подпись + патч слотов, который уходит на сервер как есть. */
public data class QuickReply(val id: String, val label: String, val patch: Map<String, JsonElement?>)

public data class Clarification(val slot: String, val question: String, val options: List<QuickReply>)

/** Выбор Гида: карточка из БД + объяснение, прошедшее верификатор фактов. */
public data class AssistantPick(val occurrence: Occurrence, val reasonCodes: List<ReasonCode>, val reasonText: String)

public enum class AssistantMode { Llm, Rules }

public data class AssistantReply(
    val conversationId: String,
    val kind: AssistantKind,
    val text: String,
    val chips: List<UnderstandingChip>,
    val clarify: Clarification?,
    val picks: List<AssistantPick>,
    val relaxed: List<String>,
    val followups: List<QuickReply>,
    val mode: AssistantMode,
)

/** Запрос к Гиду: текст, нажатие кнопки (патч) или вопрос о конкретном событии. */
@Serializable
public data class AssistantQuery(
    val conversationId: String? = null,
    val text: String? = null,
    val patch: Map<String, JsonElement?>? = null,
    val eventId: String? = null,
    val language: AppLanguage = AppLanguage.Ru,
    val municipalityId: String? = null,
    val near: String? = null,
)
