package ru.tamasha.afisha.core.model

/**
 * Что показать на бейдже карточки (docs/03-functional-spec.md §1.6, docs/07-design.md §4.3).
 * Статус никогда не передаётся только цветом: у каждого значения есть форма [BadgeShape] и текст.
 */
public enum class DisplayStatus(public val shape: BadgeShape) {
    /** По плану — бейджа нет. */
    None(BadgeShape.None),
    FewLeft(BadgeShape.HoneyDrop),
    SoldOut(BadgeShape.EmptyDiamond),
    Rescheduled(BadgeShape.DiamondArrow),
    Postponed(BadgeShape.DiamondArrow),
    Cancelled(BadgeShape.CrossedDiamond),
    Ended(BadgeShape.EmptyDiamond),
    Unverified(BadgeShape.DottedDiamond),
    ;

    /** Сеанс нельзя посетить как запланировано — постер обесцвечивается. */
    public val isInactive: Boolean get() = this == Cancelled || this == Ended || this == Postponed

    /** Не предлагать покупку билетов. */
    public val blocksTickets: Boolean get() = this == Cancelled || this == Ended || this == SoldOut || this == Postponed
}

/** Форма бейджа статуса. */
public enum class BadgeShape { None, HoneyDrop, EmptyDiamond, DiamondArrow, CrossedDiamond, DottedDiamond }

/**
 * Маппинг статуса сеанса и наличия билетов в бейдж. Приоритет — от самого важного для человека:
 * отмена важнее переноса, перенос важнее «прошло», «распродано» важнее «мало билетов».
 */
public fun displayStatusOf(
    status: OccurrenceStatus,
    availability: Availability,
    isPast: Boolean = false,
): DisplayStatus = when {
    status == OccurrenceStatus.Cancelled -> DisplayStatus.Cancelled
    status == OccurrenceStatus.Postponed -> DisplayStatus.Postponed
    status == OccurrenceStatus.Ended || isPast -> DisplayStatus.Ended
    status == OccurrenceStatus.Rescheduled -> DisplayStatus.Rescheduled
    status == OccurrenceStatus.SoldOut || availability == Availability.SoldOut -> DisplayStatus.SoldOut
    status == OccurrenceStatus.Unverified -> DisplayStatus.Unverified
    availability == Availability.FewLeft -> DisplayStatus.FewLeft
    else -> DisplayStatus.None
}

public fun Occurrence.displayStatus(clock: RegionClock): DisplayStatus =
    displayStatusOf(status, availability, isPast = !isRange && clock.isPast(startsAt, endsAt))
