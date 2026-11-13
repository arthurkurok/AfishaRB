import SwiftUI
#if canImport(UIKit)
import UIKit
#elseif canImport(AppKit)
import AppKit
#endif

/// Цвет токена со значениями для светлой и тёмной темы (`$extensions.dark` в tokens.json).
public struct ThemeColor: Hashable, Sendable {
    public let light: UInt32
    public let dark: UInt32

    public init(light: UInt32, dark: UInt32) {
        self.light = light
        self.dark = dark
    }

    /// Динамический цвет SwiftUI: сам переключается со сменой темы.
    public var color: Color {
        #if canImport(UIKit)
        Color(UIColor { traits in
            UIColor(rgb: traits.userInterfaceStyle == .dark ? dark : light)
        })
        #else
        Color(NSColor(name: nil) { appearance in
            let isDark = appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
            return NSColor(rgb: isDark ? dark : light)
        })
        #endif
    }

    /// Значение для конкретной схемы — для Canvas и снапшотов.
    public func resolved(_ scheme: ColorScheme) -> Color {
        Color(rgb: scheme == .dark ? dark : light)
    }
}

extension Color {
    public init(rgb: UInt32, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((rgb >> 16) & 0xFF) / 255,
            green: Double((rgb >> 8) & 0xFF) / 255,
            blue: Double(rgb & 0xFF) / 255,
            opacity: opacity
        )
    }

    /// Цвет из строки «#B8322A» или «888581» (цвет постера из API).
    public init?(hex: String?) {
        guard let hex else { return nil }
        let cleaned = hex.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        guard cleaned.count == 6, let value = UInt32(cleaned, radix: 16) else { return nil }
        self.init(rgb: value)
    }
}

#if canImport(UIKit)
extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}
#elseif canImport(AppKit)
extension NSColor {
    convenience init(rgb: UInt32) {
        self.init(
            srgbRed: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}
#endif

/// Кривая анимации из токена `motion.easing`.
public struct BezierCurve: Hashable, Sendable {
    public let x1: Double, y1: Double, x2: Double, y2: Double

    public init(x1: Double, y1: Double, x2: Double, y2: Double) {
        self.x1 = x1
        self.y1 = y1
        self.x2 = x2
        self.y2 = y2
    }

    public func animation(duration: Double) -> Animation {
        .timingCurve(x1, y1, x2, y2, duration: duration)
    }
}

/// Семантические цвета интерфейса — короткий доступ к токенам.
public enum Palette {
    public static var bg: Color { Tokens.Palette.bg.color }
    public static var surface: Color { Tokens.Palette.surface.color }
    public static var surface2: Color { Tokens.Palette.surface2.color }
    public static var ink: Color { Tokens.Palette.ink.color }
    public static var ink2: Color { Tokens.Palette.ink2.color }
    public static var line: Color { Tokens.Palette.line.color }
    public static var accent: Color { Tokens.Palette.accent.color }
    public static var onAccent: Color { Tokens.Palette.onAccent.color }
    public static var honey: Color { Tokens.Palette.honey.color }
    public static var meadow: Color { Tokens.Palette.meadow.color }
    public static var focus: Color { Tokens.Palette.focus.color }
    /// Текст на шафране — всегда тёмный (контраст 9:1), независимо от темы.
    public static var onHoney: Color { Color(rgb: Tokens.Palette.ink.light) }
}

/// Анимации с учётом Reduce Motion: при включённой настройке — только смена прозрачности.
public enum Motion {
    public static func base(reduceMotion: Bool) -> Animation? {
        reduceMotion ? .linear(duration: Tokens.Motion.fast) : Tokens.Motion.easing.animation(duration: Tokens.Motion.base)
    }

    public static func fast(reduceMotion: Bool) -> Animation? {
        reduceMotion ? .linear(duration: Tokens.Motion.fast) : Tokens.Motion.easing.animation(duration: Tokens.Motion.fast)
    }

    public static func slow(reduceMotion: Bool) -> Animation? {
        reduceMotion ? .linear(duration: Tokens.Motion.fast) : Tokens.Motion.easing.animation(duration: Tokens.Motion.slow)
    }

    /// Переход: при Reduce Motion — только прозрачность.
    public static func transition(reduceMotion: Bool, edge: Edge = .bottom) -> AnyTransition {
        reduceMotion ? .opacity : .move(edge: edge).combined(with: .opacity)
    }
}
