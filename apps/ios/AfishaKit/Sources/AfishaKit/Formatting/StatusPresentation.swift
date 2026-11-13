import Foundation

/// Форма бейджа статуса. Статус никогда не передаётся только цветом: всегда форма + текст
/// (docs/07-design.md §4.3, требование доступности).
public enum BadgeShape: String, Sendable, CaseIterable {
    /// Ромб со стрелкой — перенесено / отложено.
    case rhombusArrow
    /// Перечёркнутый ромб — отменено.
    case crossedRhombus
    /// Пустой ромб — распродано / прошло.
    case emptyRhombus
    /// Капля мёда — мало билетов.
    case honeyDrop
    /// Ромб с точкой — уточняется.
    case dottedRhombus
}

/// Цветовая роль бейджа: сопоставляется с токенами `color.status.*` в AfishaUI.
public enum BadgeTone: String, Sendable {
    case rescheduled, cancelled, ended, fewLeft, unverified
}

/// Бейдж статуса сеанса (docs/03-functional-spec.md §1.6).
public enum StatusBadge: Hashable, Sendable {
    /// «Перенесено → 19 ноября»; дата — новое время начала.
    case rescheduled(newStart: Date?)
    /// «Перенесено, новая дата уточняется».
    case postponed
    /// «Отменено».
    case cancelled
    /// «Билетов нет».
    case soldOut
    /// «Осталось мало билетов».
    case fewLeft
    /// «Прошло».
    case ended
    /// «Информация уточняется».
    case unverified

    /// Бейдж по статусу и наличию билетов из API. `nil` — событие «по плану», бейджа нет.
    /// Статус сеанса важнее наличия: отменённый сеанс не бывает «мало билетов».
    public init?(status: String, availability: String?, startsAt: Date?) {
        switch status {
        case "rescheduled": self = .rescheduled(newStart: startsAt)
        case "postponed": self = .postponed
        case "cancelled": self = .cancelled
        case "sold_out": self = .soldOut
        case "ended": self = .ended
        case "unverified": self = .unverified
        default:
            switch availability {
            case "sold_out": self = .soldOut
            case "few_left": self = .fewLeft
            default: return nil
            }
        }
    }

    public var shape: BadgeShape {
        switch self {
        case .rescheduled, .postponed: .rhombusArrow
        case .cancelled: .crossedRhombus
        case .soldOut, .ended: .emptyRhombus
        case .fewLeft: .honeyDrop
        case .unverified: .dottedRhombus
        }
    }

    public var tone: BadgeTone {
        switch self {
        case .rescheduled, .postponed: .rescheduled
        case .cancelled: .cancelled
        case .soldOut, .ended: .ended
        case .fewLeft: .fewLeft
        case .unverified: .unverified
        }
    }

    /// Событие нельзя посетить (постер обесцвечивается, кнопка билетов скрывается).
    public var isInactive: Bool {
        switch self {
        case .cancelled, .ended, .postponed: true
        default: false
        }
    }

    /// Текст бейджа.
    public func text(_ language: AppLanguage) -> String {
        let loc = Localizer(language: language)
        switch self {
        case let .rescheduled(newStart):
            guard let newStart else { return loc("status.rescheduled") }
            let date = EventDateFormatter(language: language).dayMonth(LocalDate(newStart))
            return loc("status.rescheduled.to", date)
        case .postponed: return loc("status.postponed")
        case .cancelled: return loc("status.cancelled")
        case .soldOut: return loc("status.sold_out")
        case .fewLeft: return loc("status.few_left")
        case .ended: return loc("status.ended")
        case .unverified: return loc("status.unverified")
        }
    }

    /// Короткая форма для VoiceOver в конце фразы карточки: «мало билетов».
    public func spoken(_ language: AppLanguage) -> String {
        let loc = Localizer(language: language)
        switch self {
        case .fewLeft: return loc("status.few_left.spoken")
        default: return text(language).lowercased(with: language.locale)
        }
    }
}
