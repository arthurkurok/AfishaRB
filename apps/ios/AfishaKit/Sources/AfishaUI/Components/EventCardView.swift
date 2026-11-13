import AfishaKit
import SwiftUI

/// Постер события: фото источника или фирменная иллюстрация категории, со «срезом ҡусҡар».
public struct PosterView: View {
    let imageURL: URL?
    let placeholderHex: String?
    let category: CategoryMotifKind
    let seed: Int
    let inactive: Bool
    let cornerRadius: CGFloat

    public init(imageURL: URL?, placeholderHex: String?, category: CategoryMotifKind, seed: Int = 0, inactive: Bool = false, cornerRadius: CGFloat = Tokens.Radius.m) {
        self.imageURL = imageURL
        self.placeholderHex = placeholderHex
        self.category = category
        self.seed = seed
        self.inactive = inactive
        self.cornerRadius = cornerRadius
    }

    public var body: some View {
        ZStack {
            if let imageURL {
                AsyncImage(url: imageURL, transaction: Transaction(animation: .easeOut(duration: Tokens.Motion.fast))) { phase in
                    switch phase {
                    case let .success(image):
                        image.resizable().scaledToFill()
                    case .failure:
                        CategoryIllustration(category, seed: seed)
                    default:
                        (Color(hex: placeholderHex) ?? Palette.surface2)
                    }
                }
            } else {
                CategoryIllustration(category, seed: seed)
            }
        }
        // Отменённое и прошедшее — обесцвечено (07 §7)
        .grayscale(inactive ? 1 : 0)
        .opacity(inactive ? 0.7 : 1)
        .clipShape(KuskarCutRectangle(cornerRadius: cornerRadius))
        .overlay {
            KuskarCornerOrnament()
                .stroke(category.color.color, style: StrokeStyle(lineWidth: 1.6, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}

/// Кнопка избранного: «ромб наполняется мёдом» (07 §9).
public struct FavoriteRhombusButton: View {
    let isFavorite: Bool
    let label: String
    let action: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(isFavorite: Bool, label: String, action: @escaping () -> Void) {
        self.isFavorite = isFavorite
        self.label = label
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            ZStack {
                Rhombus(cornerRadius: 0.14)
                    .fill(Palette.surface.opacity(0.92))
                // Мёд заполняет ромб снизу вверх
                Rhombus(cornerRadius: 0.14)
                    .fill(Palette.honey)
                    .mask(alignment: .bottom) {
                        Rectangle().frame(height: isFavorite ? 30 : 0)
                    }
                Rhombus(cornerRadius: 0.14)
                    .stroke(isFavorite ? Palette.onHoney : Palette.ink, lineWidth: 1.6)
                Image(systemName: isFavorite ? "star.fill" : "star")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(isFavorite ? Palette.onHoney : Palette.ink)
            }
            .frame(width: 30, height: 30)
            .frame(width: Tokens.Touch.minIos, height: Tokens.Touch.minIos)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .animation(Motion.base(reduceMotion: reduceMotion), value: isFavorite)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isFavorite ? .isSelected : [])
    }
}

/// Вариант раскладки карточки.
public enum EventCardStyle: Sendable {
    /// Крупная вертикальная карточка (карусели главной, подборки Гида).
    case feature
    /// Строка списка: постер слева, текст справа. На AX-размерах шрифта — вертикально.
    case row
}

/// Карточка события «Живого орнамента» (docs/07-design.md §7).
public struct EventCardView: View {
    let card: CardPresentation
    let style: EventCardStyle
    let language: AppLanguage
    let isFavorite: Bool?
    let onFavorite: (() -> Void)?
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(_ card: CardPresentation, style: EventCardStyle = .row, language: AppLanguage, isFavorite: Bool? = nil, onFavorite: (() -> Void)? = nil) {
        self.card = card
        self.style = style
        self.language = language
        self.isFavorite = isFavorite
        self.onFavorite = onFavorite
    }

    private var category: CategoryMotifKind { CategoryMotifKind(code: card.categoryCode) }
    private var inactive: Bool { card.badge?.isInactive ?? false }
    /// Стабильный «рисунок» обложки для события: hashValue в Swift случаен между запусками.
    private var seed: Int { card.eventID.unicodeScalars.reduce(0) { ($0 &* 31 &+ Int($1.value)) & 0xFFFF } % 7 }

    public var body: some View {
        let vertical = style == .feature || dynamicTypeSize.isAccessibilitySize
        VStack(spacing: 0) {
            if vertical { verticalLayout } else { rowLayout }
            KaimaBand(color: category.color.color)
        }
        .background(Palette.surface)
        .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).strokeBorder(Palette.line, lineWidth: 0.5))
        .overlay(alignment: .topTrailing) { favoriteButton }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityLabel)
        .accessibilityAddTraits(.isButton)
        .accessibilityActions {
            if let onFavorite, let isFavorite {
                Button(Localizer(language: language)(isFavorite ? "favorites.remove" : "favorites.add"), action: onFavorite)
            }
        }
    }

    @ViewBuilder private var favoriteButton: some View {
        if let isFavorite, let onFavorite {
            FavoriteRhombusButton(isFavorite: isFavorite, label: Localizer(language: language)(isFavorite ? "favorites.remove" : "favorites.add"), action: onFavorite)
                .padding(style == .feature ? Tokens.Space.s1 : 0)
        }
    }

    // MARK: Раскладки

    private var verticalLayout: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            PosterView(imageURL: card.imageURL, placeholderHex: card.imageColor, category: category, seed: seed, inactive: inactive)
                .aspectRatio(16 / 9, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .bottomLeading) {
                    if let badge = card.badge {
                        StatusBadgeView(badge, language: language, compact: true).padding(Tokens.Space.s2)
                    }
                }
            // На AX-размерах ромб с датой — над текстом, чтобы заголовок не рвался посреди слова
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                    dateRhombus
                    textBlock
                }
                .padding(.horizontal, Tokens.Space.s3)
            } else {
                HStack(alignment: .top, spacing: Tokens.Space.s3) {
                    dateRhombus
                    textBlock
                }
                .padding(.horizontal, Tokens.Space.s3)
            }
            chips
                .padding(.horizontal, Tokens.Space.s3)
                .padding(.bottom, Tokens.Space.s3)
        }
    }

    private var rowLayout: some View {
        HStack(alignment: .top, spacing: Tokens.Space.s3) {
            ZStack(alignment: .bottomLeading) {
                PosterView(imageURL: card.imageURL, placeholderHex: card.imageColor, category: category, seed: seed, inactive: inactive, cornerRadius: Tokens.Radius.s)
                    .frame(width: 96, height: 112)
                dateRhombus
                    .scaleEffect(0.8, anchor: .bottomLeading)
                    .offset(x: -4, y: 6)
            }
            .padding(.bottom, Tokens.Space.s2)
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                textBlock
                    .padding(.trailing, isFavorite == nil ? 0 : 28)
                if let badge = card.badge { StatusBadgeView(badge, language: language) }
                chips
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(Tokens.Space.s3)
    }

    private var dateRhombus: some View {
        DateRhombus(
            day: card.day, month: card.monthShort, caption: card.time,
            color: category.color.color, dimmed: inactive, crossed: card.badge == .cancelled
        )
    }

    private var textBlock: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
            Text(card.title)
                .typography(TypeScale.title)
                .foregroundStyle(Palette.ink)
                .lineLimit(dynamicTypeSize.isAccessibilitySize ? 4 : 2)
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            Text(card.sessionLine)
                .typography(TypeScale.caption, weight: 600)
                .foregroundStyle(inactive ? Palette.ink2 : Palette.accent)
            if let venue = card.venueLine {
                Text(venue)
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
                    .lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var chips: some View {
        FlowLayout(spacing: Tokens.Space.s1 + 2) {
            if let price = card.priceChip {
                Chip(price, tint: card.priceChip == Localizer(language: language)("price.free") ? Palette.meadow : nil)
            }
            Chip(card.ageLabel)
            if card.pushkin { PushkinBadge(title: Localizer(language: language)("card.pushkin")) }
            if let more = card.moreDates { Chip(more, outline: .dashed) }
            if let distance = card.distance { Chip(distance, systemImage: "location") }
        }
    }
}

/// Раскладка «по строкам с переносом» для чипов (на крупном шрифте чипы не обрезаются).
public struct FlowLayout: Layout {
    let spacing: CGFloat

    public init(spacing: CGFloat = 6) {
        self.spacing = spacing
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, maxX: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0, x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            x += size.width + spacing
            maxX = max(maxX, x - spacing)
            rowHeight = max(rowHeight, size.height)
        }
        return CGSize(width: min(maxX, width), height: y + rowHeight)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowHeight: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: bounds.width, height: nil))
            if x > bounds.minX, x + size.width > bounds.maxX {
                x = bounds.minX
                y += rowHeight + spacing
                rowHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
    }
}

/// Скелетон карточки на время загрузки.
public struct EventCardSkeleton: View {
    public init() {}

    public var body: some View {
        HStack(alignment: .top, spacing: Tokens.Space.s3) {
            SkeletonBlock(height: 112).frame(width: 96)
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                SkeletonBlock(height: 18)
                SkeletonBlock(height: 18).padding(.trailing, 60)
                SkeletonBlock(height: 12).padding(.trailing, 120)
                HStack { SkeletonBlock(height: 24, cornerRadius: 12).frame(width: 70); SkeletonBlock(height: 24, cornerRadius: 12).frame(width: 40) }
            }
        }
        .padding(Tokens.Space.s3)
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.m).fill(Palette.surface))
        .accessibilityHidden(true)
    }
}
