package ru.tamasha.afisha.core.model

import kotlinx.serialization.Serializable

/** Семь категорий «зонтика курая» (docs/03-functional-spec.md §1.1). Порядок — порядок лучей. */
@Serializable
public enum class Category(public val code: String) {
    Theatre("theatre"),
    Music("music"),
    Museum("museum"),
    Kids("kids"),
    Folk("folk"),
    Cinema("cinema"),
    Education("education"),
    ;

    public companion object {
        public fun fromCode(code: String): Category? = entries.firstOrNull { it.code == code }
    }
}

/** Сквозные теги (не категории). */
@Serializable
public enum class EventTag(public val code: String) {
    Free("free"),
    Pushkin("pushkin"),
    Premiere("premiere"),
    Family("family"),
    Youth("youth"),
    Accessible("accessible"),
    OnBashkir("on_bashkir"),
    Outdoor("outdoor"),
    MasterClass("master_class"),
    Excursion("excursion"),
    Festival("festival"),
    ;

    public companion object {
        public fun fromCode(code: String): EventTag? = entries.firstOrNull { it.code == code }
    }
}

/** Статус сеанса из API: по плану, перенесено, отложено, отменено, распродано, уточняется, прошло. */
@Serializable
public enum class OccurrenceStatus(public val code: String) {
    Scheduled("scheduled"),
    Rescheduled("rescheduled"),
    Postponed("postponed"),
    Cancelled("cancelled"),
    SoldOut("sold_out"),
    Unverified("unverified"),
    Ended("ended"),
    ;

    public companion object {
        /** Неизвестный статус из будущей версии API безопаснее показать как «уточняется», чем как «по плану». */
        public fun fromCode(code: String): OccurrenceStatus = entries.firstOrNull { it.code == code } ?: Unverified
    }
}

@Serializable
public enum class Availability(public val code: String) {
    Unknown("unknown"),
    Available("available"),
    FewLeft("few_left"),
    SoldOut("sold_out"),
    ;

    public companion object {
        public fun fromCode(code: String): Availability = entries.firstOrNull { it.code == code } ?: Unknown
    }
}

/** Почему карточка в выдаче (объяснимое ранжирование, docs/05-ai-agent.md §2.6). */
@Serializable
public enum class ReasonCode(public val code: String) {
    AgeFit("age_fit"),
    BudgetFit("budget_fit"),
    Free("free"),
    Near("near"),
    TimeFit("time_fit"),
    CategoryMatch("category_match"),
    Pushkin("pushkin"),
    Accessible("accessible"),
    Popular("popular"),
    New("new"),
    LastChance("last_chance"),
    OnBashkir("on_bashkir"),
    TextMatch("text_match"),
    ;

    public companion object {
        public fun fromCode(code: String): ReasonCode? = entries.firstOrNull { it.code == code }
    }
}

/** Свежесть данных источника. */
@Serializable
public enum class Freshness(public val code: String) {
    Fresh("fresh"),
    Aging("aging"),
    Stale("stale"),
    Vanished("vanished"),
    ;

    public companion object {
        public fun fromCode(code: String): Freshness = entries.firstOrNull { it.code == code } ?: Aging
    }
}

/** Уровень доверия к источнику события. */
@Serializable
public enum class TrustLevel(public val code: String) {
    OfficialPlus("official_plus"),
    Official("official"),
    Partner("partner"),
    Aggregated("aggregated"),
    Extracted("extracted"),
    ;

    public companion object {
        public fun fromCode(code: String): TrustLevel = entries.firstOrNull { it.code == code } ?: Aggregated
    }
}

/** Языки интерфейса. Башкирский — полноправный, не «перевод по желанию». */
@Serializable
public enum class AppLanguage(public val tag: String) {
    Ru("ru"),
    Ba("ba"),
    ;

    public companion object {
        public fun fromTag(tag: String?): AppLanguage = entries.firstOrNull { it.tag == tag?.substringBefore('-') } ?: Ru
    }
}
