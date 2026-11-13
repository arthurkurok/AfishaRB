import AfishaKit
import SwiftUI

/// Картинка-превью 9:16 для сторис VK и Telegram (08 §4, «Поделиться карточкой»).
/// Рисуется без сетевых изображений — ImageRenderer не ждёт загрузки, поэтому обложка —
/// фирменная иллюстрация категории.
public struct StoryCardView: View {
    let card: CardPresentation
    let language: AppLanguage
    let brand: String
    let link: String

    public init(card: CardPresentation, language: AppLanguage, brand: String, link: String) {
        self.card = card
        self.language = language
        self.brand = brand
        self.link = link
    }

    private var category: CategoryMotifKind { CategoryMotifKind(code: card.categoryCode) }

    public var body: some View {
        VStack(alignment: .leading, spacing: 40) {
            HStack(spacing: 14) {
                BeeFigure(mood: .found).frame(width: 96, height: 96)
                Text(brand)
                    .typography(TypeScale.h1.scaled(1.4))
                    .foregroundStyle(Color(rgb: Tokens.Palette.ink.dark))
            }
            CategoryIllustration(category, seed: 1)
                .frame(height: 520)
                .clipShape(KuskarCutRectangle(cornerRadius: Tokens.Radius.l))
            HStack(alignment: .top, spacing: 20) {
                DateRhombus(day: card.day, month: card.monthShort, caption: card.time, color: category.color.color)
                    .scaleEffect(1.8)
                    .frame(width: 130, height: 140)
                VStack(alignment: .leading, spacing: 10) {
                    Text(card.title)
                        .typography(TypeScale.display.scaled(1.2))
                        .foregroundStyle(Color(rgb: Tokens.Palette.ink.dark))
                        .lineLimit(4)
                        .minimumScaleFactor(0.6)
                    Text(card.sessionLine)
                        .typography(TypeScale.h2.scaled(1.3))
                        .foregroundStyle(Color(rgb: Tokens.Palette.accent.dark))
                    if let venue = card.venueLine {
                        Text(venue)
                            .typography(TypeScale.title.scaled(1.3))
                            .foregroundStyle(Color(rgb: Tokens.Palette.ink2.dark))
                            .lineLimit(2)
                    }
                }
            }
            HStack(spacing: 10) {
                if let price = card.priceChip { storyChip(price) }
                storyChip(card.ageLabel)
            }
            Spacer(minLength: 0)
            KaimaBand(color: category.color.color, height: 10)
            Text(link)
                .typography(TypeScale.title)
                .foregroundStyle(Color(rgb: Tokens.Palette.ink2.dark))
        }
        .padding(56)
        .frame(width: 720, height: 1280)
        // Холст фиксированного размера: системный размер шрифта на картинку не влияет
        .dynamicTypeSize(.large)
        .background(Color(rgb: Tokens.Palette.bg.dark))
    }

    private func storyChip(_ text: String) -> some View {
        Text(text)
            .typography(TypeScale.h2.scaled(1.2))
            .foregroundStyle(Color(rgb: Tokens.Palette.ink.light))
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(Capsule().fill(Color(rgb: Tokens.Palette.honey.light)))
    }
}
