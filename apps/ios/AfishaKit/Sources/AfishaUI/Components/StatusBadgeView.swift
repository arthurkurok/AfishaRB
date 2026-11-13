import AfishaKit
import SwiftUI

extension BadgeTone {
    var color: ThemeColor {
        switch self {
        case .rescheduled: Tokens.Palette.Status.rescheduled
        case .cancelled: Tokens.Palette.Status.cancelled
        case .ended: Tokens.Palette.Status.ended
        case .fewLeft: Tokens.Palette.Status.fewLeft
        case .unverified: Tokens.Palette.Status.unverified
        }
    }
}

/// Значок формы бейджа статуса.
public struct BadgeGlyph: View {
    let shape: BadgeShape
    let color: Color

    public init(shape: BadgeShape, color: Color) {
        self.shape = shape
        self.color = color
    }

    public var body: some View {
        Canvas { context, size in
            let rect = CGRect(origin: .zero, size: size).insetBy(dx: 1, dy: 1)
            let rhombus = Rhombus(cornerRadius: 0.1).path(in: rect)
            let stroke = StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round)
            switch shape {
            case .rhombusArrow:
                context.stroke(rhombus, with: .color(color), style: stroke)
                var arrow = Path()
                arrow.move(to: CGPoint(x: rect.minX + rect.width * 0.3, y: rect.midY))
                arrow.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.3, y: rect.midY))
                arrow.move(to: CGPoint(x: rect.maxX - rect.width * 0.42, y: rect.midY - rect.height * 0.12))
                arrow.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.3, y: rect.midY))
                arrow.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.42, y: rect.midY + rect.height * 0.12))
                context.stroke(arrow, with: .color(color), style: stroke)
            case .crossedRhombus:
                context.stroke(rhombus, with: .color(color), style: stroke)
                var cross = Path()
                cross.move(to: CGPoint(x: rect.minX + rect.width * 0.18, y: rect.maxY - rect.height * 0.18))
                cross.addLine(to: CGPoint(x: rect.maxX - rect.width * 0.18, y: rect.minY + rect.height * 0.18))
                context.stroke(cross, with: .color(color), style: stroke)
            case .emptyRhombus:
                context.stroke(rhombus, with: .color(color), style: stroke)
            case .honeyDrop:
                var drop = Path()
                drop.move(to: CGPoint(x: rect.midX, y: rect.minY))
                drop.addCurve(to: CGPoint(x: rect.midX, y: rect.maxY),
                              control1: CGPoint(x: rect.minX - rect.width * 0.1, y: rect.midY + rect.height * 0.1),
                              control2: CGPoint(x: rect.minX + rect.width * 0.05, y: rect.maxY))
                drop.addCurve(to: CGPoint(x: rect.midX, y: rect.minY),
                              control1: CGPoint(x: rect.maxX - rect.width * 0.05, y: rect.maxY),
                              control2: CGPoint(x: rect.maxX + rect.width * 0.1, y: rect.midY + rect.height * 0.1))
                context.fill(drop, with: .color(color))
            case .dottedRhombus:
                context.stroke(rhombus, with: .color(color), style: stroke)
                let dot = CGRect(x: rect.midX - rect.width * 0.12, y: rect.midY - rect.height * 0.12, width: rect.width * 0.24, height: rect.height * 0.24)
                context.fill(Path(ellipseIn: dot), with: .color(color))
            }
        }
        .accessibilityHidden(true)
    }
}

/// Бейдж статуса: форма + текст + цвет (docs/07-design.md §4.3).
public struct StatusBadgeView: View {
    let badge: StatusBadge
    let language: AppLanguage
    let compact: Bool

    public init(_ badge: StatusBadge, language: AppLanguage, compact: Bool = false) {
        self.badge = badge
        self.language = language
        self.compact = compact
    }

    public var body: some View {
        let tone = badge.tone
        // «Мало билетов» — текст тёмный на шафране; остальные — цветной текст на светлой подложке
        let isHoney = tone == .fewLeft
        HStack(spacing: Tokens.Space.s1 + 2) {
            BadgeGlyph(shape: badge.shape, color: isHoney ? Palette.onHoney : tone.color.color)
                .frame(width: 14, height: 14)
            Text(badge.text(language))
                .typography(TypeScale.caption, weight: 600)
                .foregroundStyle(isHoney ? Palette.onHoney : tone.color.color)
                .lineLimit(compact ? 1 : 2)
        }
        .padding(.horizontal, Tokens.Space.s2)
        .padding(.vertical, Tokens.Space.s1)
        .background(
            Capsule().fill(isHoney ? Palette.honey : Palette.surface)
        )
        .overlay(
            Capsule().strokeBorder(isHoney ? Color.clear : tone.color.color.opacity(0.6), lineWidth: 1)
        )
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(badge.text(language))
    }
}
