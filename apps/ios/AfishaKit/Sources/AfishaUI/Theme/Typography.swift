import CoreText
import SwiftUI

/// Ступень типографической шкалы (`type.*` в tokens.json).
public struct TypeToken: Hashable, Sendable {
    public enum Family: String, Sendable {
        /// Commissioner — заголовки, даты, цифры.
        case display
        /// Golos Text — текст и интерфейс.
        case text
    }

    public let name: String
    public let size: CGFloat
    public let lineHeight: CGFloat
    public let weight: Int
    public let family: Family

    public init(name: String, size: CGFloat, lineHeight: CGFloat, weight: Int, family: Family) {
        self.name = name
        self.size = size
        self.lineHeight = lineHeight
        self.weight = weight
        self.family = family
    }

    /// Ось FLAR («расклёшенность») Commissioner: 60 — для крупного дисплейного кегля (07 §5).
    var flare: CGFloat? { family == .display && size >= 40 ? 60 : nil }

    /// Системный стиль, по которому масштабируется ступень (Dynamic Type).
    var textStyle: Font.TextStyle {
        switch name {
        case "display": .largeTitle
        case "h1": .title
        case "h2": .title2
        case "title": .headline
        case "caption": .caption
        case "date-big": .title
        default: .body
        }
    }
}

/// Регистрация фирменных шрифтов из ресурсов пакета. Вызывается один раз при старте
/// приложения, виджета и тестов; повторный вызов безопасен.
public enum AfishaFonts {
    static let files = ["GolosText-Variable", "Commissioner-Variable"]
    /// PostScript-имена начертаний по умолчанию в вариативных файлах.
    static let textName = "GolosText-Regular"
    static let displayName = "Commissioner-Thin"

    private static let registration: Bool = {
        var ok = true
        for file in files {
            guard let url = Bundle.module.url(forResource: file, withExtension: "ttf", subdirectory: "Fonts")
                ?? Bundle.module.url(forResource: file, withExtension: "ttf") else {
                ok = false
                continue
            }
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                // kCTFontManagerErrorAlreadyRegistered (105) — не ошибка
                if let code = error?.takeRetainedValue(), CFErrorGetCode(code) != 105 { ok = false }
            }
        }
        return ok
    }()

    /// Регистрирует шрифты. Возвращает `false`, если файлов нет — тогда используется системный шрифт.
    @discardableResult
    public static func register() -> Bool { registration }

    /// Шрифт ступени для UIKit/AppKit (CTFont мостится в UIFont/NSFont): заголовки навигации, виджет.
    public static func font(_ token: TypeToken, scale: CGFloat = 1) -> CTFont {
        ctFont(token, scale: scale)
    }

    /// Шрифт ступени `token` с учётом Dynamic Type.
    static func ctFont(_ token: TypeToken, scale: CGFloat, weightOverride: Int? = nil) -> CTFont {
        _ = registration
        let name = token.family == .display ? displayName : textName
        let size = token.size * scale
        let weight = CGFloat(weightOverride ?? token.weight)
        var variation: [NSNumber: NSNumber] = [NSNumber(value: Axis.weight): NSNumber(value: Double(weight))]
        if let flare = token.flare { variation[NSNumber(value: Axis.flare)] = NSNumber(value: Double(flare)) }
        let attributes: [CFString: Any] = [
            kCTFontNameAttribute: name,
            kCTFontVariationAttribute: variation,
        ]
        let descriptor = CTFontDescriptorCreateWithAttributes(attributes as CFDictionary)
        let font = CTFontCreateWithFontDescriptor(descriptor, size, nil)
        // Если фирменного шрифта нет (например, ресурсы не скопированы), CoreText вернёт запасной —
        // проверяем имя и берём системный шрифт нужной насыщенности.
        if (CTFontCopyPostScriptName(font) as String).hasPrefix(token.family == .display ? "Commissioner" : "GolosText") {
            return font
        }
        return CTFontCreateUIFontForLanguage(.system, size, nil) ?? font
    }

    enum Axis {
        static let weight = 0x7767_6874 // 'wght'
        static let flare = 0x464C_4152 // 'FLAR'
    }
}

/// Масштаб Dynamic Type относительно размера «Large» (по таблице Apple HIG для body: 17 pt).
/// Для крупных заголовков рост ограничен, чтобы на AX5 заголовок не занимал весь экран.
public enum DynamicTypeScale {
    public static func factor(_ size: DynamicTypeSize, for token: TypeToken) -> CGFloat {
        let body: CGFloat = switch size {
        case .xSmall: 14
        case .small: 15
        case .medium: 16
        case .large: 17
        case .xLarge: 19
        case .xxLarge: 21
        case .xxxLarge: 23
        case .accessibility1: 28
        case .accessibility2: 33
        case .accessibility3: 40
        case .accessibility4: 47
        case .accessibility5: 53
        @unknown default: 17
        }
        let raw = body / 17
        // Заголовки растут медленнее текста — как системные стили largeTitle/title
        switch token.size {
        case 32...: return min(raw, 1 + (raw - 1) * 0.5).clamped(0.85...1.9)
        case 22...: return min(raw, 1 + (raw - 1) * 0.7).clamped(0.85...2.4)
        default: return raw
        }
    }
}

extension CGFloat {
    func clamped(_ range: ClosedRange<CGFloat>) -> CGFloat { Swift.min(Swift.max(self, range.lowerBound), range.upperBound) }
}

/// Модификатор шрифта ступени: фирменный шрифт + Dynamic Type + межстрочный интервал из токена.
struct TypeTokenModifier: ViewModifier {
    let token: TypeToken
    let weight: Int?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @Environment(\.legibilityWeight) private var legibilityWeight

    func body(content: Content) -> some View {
        let scale = DynamicTypeScale.factor(dynamicTypeSize, for: token)
        // «Жирный текст» в настройках доступности — плюс 200 к насыщенности
        let boldBoost = legibilityWeight == .bold ? 200 : 0
        let font = AfishaFonts.ctFont(token, scale: scale, weightOverride: min(900, (weight ?? token.weight) + boldBoost))
        let natural = CTFontGetAscent(font) + CTFontGetDescent(font) + CTFontGetLeading(font)
        let spacing = Swift.max(0, token.lineHeight * scale - natural)
        content
            .font(Font(font))
            .lineSpacing(spacing)
    }
}

extension View {
    /// Применяет ступень типографики: `.typography(Tokens.Typography.title)`.
    public func typography(_ token: TypeToken, weight: Int? = nil) -> some View {
        modifier(TypeTokenModifier(token: token, weight: weight))
    }
}

/// Короткие имена ступеней.
public enum TypeScale {
    public static var display: TypeToken { Tokens.Typography.display }
    public static var h1: TypeToken { Tokens.Typography.h1 }
    public static var h2: TypeToken { Tokens.Typography.h2 }
    public static var title: TypeToken { Tokens.Typography.title }
    public static var body: TypeToken { Tokens.Typography.body }
    public static var caption: TypeToken { Tokens.Typography.caption }
    public static var dateBig: TypeToken { Tokens.Typography.dateBig }
}
