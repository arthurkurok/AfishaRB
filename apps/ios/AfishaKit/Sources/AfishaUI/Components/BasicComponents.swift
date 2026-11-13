import AfishaKit
import SwiftUI

// MARK: - Локализация в SwiftUI

private struct LocalizerKey: EnvironmentKey {
    static let defaultValue = Localizer.ru
}

extension EnvironmentValues {
    /// Локализатор текущего языка приложения (переключается внутри приложения, 07 §12).
    public var loc: Localizer {
        get { self[LocalizerKey.self] }
        set { self[LocalizerKey.self] = newValue }
    }
}

// MARK: - Дата в ромбе

/// Дата в ромбе: день крупно, месяц и время мелко (карточка события, 07 §7).
public struct DateRhombus: View {
    let day: String
    let month: String
    let caption: String?
    let color: Color
    let dimmed: Bool
    let crossed: Bool
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(day: String, month: String, caption: String?, color: Color, dimmed: Bool = false, crossed: Bool = false) {
        self.day = day
        self.month = month
        self.caption = caption
        self.color = color
        self.dimmed = dimmed
        self.crossed = crossed
    }

    public var body: some View {
        let side = 64 * min(1.25, DynamicTypeScale.factor(min(dynamicTypeSize, .xxLarge), for: TypeScale.title))
        ZStack {
            Rhombus(cornerRadius: 0.1).fill(Palette.surface)
            Rhombus(cornerRadius: 0.1).strokeBorderCompat(dimmed ? Palette.ink2 : color, lineWidth: 2)
            VStack(spacing: -2) {
                Text(day)
                    .typography(Tokens.Typography.dateBig.scaled(0.62))
                    .foregroundStyle(dimmed ? Palette.ink2 : Palette.ink)
                    .strikethrough(crossed, color: Tokens.Palette.Status.cancelled.color)
                Text(month.uppercased())
                    .typography(TypeScale.caption, weight: 700)
                    .foregroundStyle(dimmed ? Palette.ink2 : color)
            }
            .minimumScaleFactor(0.6)
            .padding(side * 0.2)
            if crossed {
                Path { path in
                    path.move(to: CGPoint(x: side * 0.22, y: side * 0.78))
                    path.addLine(to: CGPoint(x: side * 0.78, y: side * 0.22))
                }
                .stroke(Tokens.Palette.Status.cancelled.color, lineWidth: 2)
            }
        }
        .frame(width: side, height: side)
        .overlay(alignment: .bottom) {
            if let caption {
                Text(caption)
                    .typography(TypeScale.caption, weight: 600)
                    .foregroundStyle(Palette.onAccent)
                    .padding(.horizontal, 6)
                    .padding(.vertical, 1)
                    .background(Capsule().fill(dimmed ? Palette.ink2 : Palette.accent))
                    .offset(y: 8)
                    .fixedSize()
            }
        }
        .padding(.bottom, caption == nil ? 0 : 8)
        // Ромб декоративный: та же дата есть текстом рядом, поэтому рост шрифта внутри ограничен
        .dynamicTypeSize(...DynamicTypeSize.xxLarge)
        .accessibilityHidden(true)
    }
}

extension TypeToken {
    /// Та же ступень в другом масштабе (для дат внутри компактных элементов).
    public func scaled(_ factor: CGFloat) -> TypeToken {
        TypeToken(name: name, size: size * factor, lineHeight: lineHeight * factor, weight: weight, family: family)
    }
}

extension Shape {
    /// `strokeBorder` есть только у `InsettableShape`; ромб обводим с отступом вручную.
    func strokeBorderCompat(_ color: Color, lineWidth: CGFloat) -> some View {
        self.stroke(color, lineWidth: lineWidth).padding(lineWidth / 2)
    }
}

// MARK: - Чипы

/// Стиль контура чипа: сплошной — сказано пользователем, пунктир — достроено Гидом (05 §6).
public enum ChipOutline: Sendable {
    case solid, dashed, none
}

/// Чип: фильтр, цена, возраст, причина, понимание запроса.
public struct Chip: View {
    let title: String
    let systemImage: String?
    let selected: Bool
    let outline: ChipOutline
    let tint: Color?

    public init(_ title: String, systemImage: String? = nil, selected: Bool = false, outline: ChipOutline = .solid, tint: Color? = nil) {
        self.title = title
        self.systemImage = systemImage
        self.selected = selected
        self.outline = outline
        self.tint = tint
    }

    public var body: some View {
        HStack(spacing: Tokens.Space.s1) {
            if let systemImage {
                Image(systemName: systemImage).imageScale(.small)
            }
            Text(title)
                .typography(TypeScale.caption, weight: selected ? 600 : 500)
                .lineLimit(2)
                .multilineTextAlignment(.leading)
        }
        .foregroundStyle(selected ? Palette.onAccent : (tint ?? Palette.ink))
        .padding(.horizontal, Tokens.Space.s3)
        .padding(.vertical, Tokens.Space.s1 + 2)
        .background(Capsule().fill(selected ? (tint ?? Palette.accent) : Palette.surface))
        .overlay {
            switch outline {
            case .solid:
                Capsule().strokeBorder(selected ? Color.clear : (tint ?? Palette.line), lineWidth: 1)
            case .dashed:
                Capsule().strokeBorder(tint ?? Palette.ink2, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            case .none:
                EmptyView()
            }
        }
    }
}

/// Бейдж Пушкинской карты.
public struct PushkinBadge: View {
    let title: String

    public init(title: String) {
        self.title = title
    }

    public var body: some View {
        HStack(spacing: 4) {
            Rhombus(cornerRadius: 0.1)
                .fill(Palette.focus)
                .frame(width: 10, height: 10)
            Text(title)
                .typography(TypeScale.caption, weight: 600)
                .foregroundStyle(Palette.focus)
                .lineLimit(1)
        }
        .padding(.horizontal, Tokens.Space.s2)
        .padding(.vertical, 3)
        .background(Capsule().strokeBorder(Palette.focus.opacity(0.7), lineWidth: 1))
    }
}

// MARK: - Кнопки

/// Основная кнопка (коралл).
public struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled

    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .typography(TypeScale.title)
            .foregroundStyle(Palette.onAccent)
            .frame(maxWidth: .infinity, minHeight: Tokens.Touch.minIos)
            .padding(.horizontal, Tokens.Space.s4)
            .padding(.vertical, Tokens.Space.s1)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).fill(Palette.accent))
            .opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.45)
            .contentShape(Rectangle())
    }
}

/// Вторичная кнопка (контур).
public struct SecondaryButtonStyle: ButtonStyle {
    public init() {}

    public func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .typography(TypeScale.body, weight: 600)
            .foregroundStyle(Palette.accent)
            .frame(maxWidth: .infinity, minHeight: Tokens.Touch.minIos)
            .padding(.horizontal, Tokens.Space.s3)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).fill(Palette.surface))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).strokeBorder(Palette.accent.opacity(0.6), lineWidth: 1))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .contentShape(Rectangle())
    }
}

extension ButtonStyle where Self == PrimaryButtonStyle {
    public static var afishaPrimary: PrimaryButtonStyle { PrimaryButtonStyle() }
}

extension ButtonStyle where Self == SecondaryButtonStyle {
    public static var afishaSecondary: SecondaryButtonStyle { SecondaryButtonStyle() }
}

// MARK: - Заголовки, баннеры, пустые состояния

/// Заголовок секции с ромбом-буллетом.
public struct SectionTitle: View {
    let title: String
    let actionTitle: String?
    let action: (() -> Void)?

    public init(_ title: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.title = title
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: Tokens.Space.s2) {
            Rhombus(cornerRadius: 0.1)
                .fill(Palette.accent)
                .frame(width: 10, height: 10)
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 1 }
            Text(title)
                .typography(TypeScale.h2)
                .foregroundStyle(Palette.ink)
                .accessibilityAddTraits(.isHeader)
            Spacer(minLength: Tokens.Space.s2)
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .typography(TypeScale.body, weight: 600)
                    .foregroundStyle(Palette.accent)
                    .frame(minHeight: Tokens.Touch.minIos)
            }
        }
    }
}

/// Баннер «нет сети / данные из кэша» (тон — спокойный, 07 §10).
public struct InfoBanner: View {
    public enum Kind: Sendable { case offline, info, warning }
    let kind: Kind
    let text: String
    let actionTitle: String?
    let action: (() -> Void)?

    public init(_ kind: Kind, text: String, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.kind = kind
        self.text = text
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        HStack(alignment: .top, spacing: Tokens.Space.s3) {
            Image(systemName: icon)
                .foregroundStyle(tint)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                Text(text)
                    .typography(TypeScale.body)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let actionTitle, let action {
                    Button(actionTitle, action: action)
                        .typography(TypeScale.body, weight: 600)
                        .foregroundStyle(Palette.accent)
                        .frame(minHeight: Tokens.Touch.minIos)
                }
            }
            Spacer(minLength: 0)
        }
        .padding(Tokens.Space.s3)
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).fill(Palette.surface2))
        .overlay(alignment: .leading) {
            Rectangle().fill(tint).frame(width: 4).clipShape(RoundedRectangle(cornerRadius: 2))
        }
        .accessibilityElement(children: .combine)
    }

    private var icon: String {
        switch kind {
        case .offline: "wifi.slash"
        case .info: "info.circle"
        case .warning: "exclamationmark.triangle"
        }
    }

    private var tint: Color {
        switch kind {
        case .offline: Palette.ink2
        case .info: Palette.focus
        case .warning: Tokens.Palette.Status.unverified.color
        }
    }
}

/// Пустое состояние: маскот + одна фраза + одно действие (07 §8).
public struct EmptyStateView: View {
    let mood: BeeMood
    let title: String
    let message: String?
    let actionTitle: String?
    let action: (() -> Void)?

    public init(mood: BeeMood = .notFound, title: String, message: String? = nil, actionTitle: String? = nil, action: (() -> Void)? = nil) {
        self.mood = mood
        self.title = title
        self.message = message
        self.actionTitle = actionTitle
        self.action = action
    }

    public var body: some View {
        VStack(spacing: Tokens.Space.s3) {
            BeeMascot(mood: mood, size: 96)
            Text(title)
                .typography(TypeScale.title)
                .foregroundStyle(Palette.ink)
                .multilineTextAlignment(.center)
            if let message {
                Text(message)
                    .typography(TypeScale.body)
                    .foregroundStyle(Palette.ink2)
                    .multilineTextAlignment(.center)
            }
            if let actionTitle, let action {
                Button(actionTitle, action: action)
                    .buttonStyle(.afishaSecondary)
                    .frame(maxWidth: 320)
            }
        }
        .padding(Tokens.Space.s5)
        .frame(maxWidth: .infinity)
        .accessibilityElement(children: .contain)
    }
}

/// Скелетон загрузки с мягким мерцанием (при Reduce Motion — без анимации).
public struct SkeletonBlock: View {
    let height: CGFloat
    let cornerRadius: CGFloat
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pulse = false

    public init(height: CGFloat, cornerRadius: CGFloat = Tokens.Radius.s) {
        self.height = height
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
            .fill(Palette.surface2)
            .frame(height: height)
            .opacity(pulse ? 0.55 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { pulse = true }
            }
            .accessibilityHidden(true)
    }
}
