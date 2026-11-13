@testable import AfishaKit
@testable import AfishaUI
import CoreText
import Foundation
import SwiftUI
import Testing

/// Карточка из реальной выдачи (фикстура пакета AfishaKitTests недоступна здесь — строим из JSON).
private func sampleCard(status: OccurrenceStatus = .scheduled, availability: Availability = .unknown) throws -> OccurrenceCard {
    let json = """
    {"id":"01a19c9d-556a-7f43-99a1-7b191403559f","event":{"id":"01a19c9d-5565-754a-a891-0bdc58d650b7",
    "title":"Спектакль «Буратино»","summary":"Кукольный спектакль для всей семьи",
    "categories":["theatre","kids"],"tags":["family","pushkin"],"age_rating":0,"pushkin_card":true,
    "price":{"min":"400.00","max":"800.00","is_free":false,"currency":"RUB"},"image":null,
    "organization":"Башкирский государственный театр кукол"},
    "venue":{"id":"01a19c9d-5564-77c2-a9ac-6c667d789232","name":"Башкирский театр кукол",
    "address":"Респ. Башкортостан, г. Уфа, ул. Гоголя, д. 58","geo":[54.73,55.95],"municipality_id":"ufa","municipality":"Уфа"},
    "starts_at":"2026-11-07T11:00:00+05:00","ends_at":null,"is_range":false,"status":"\(status.rawValue)",
    "status_reason":null,"previous_starts_at":null,"availability":"\(availability.rawValue)","ticket_url":null,
    "more_dates":3,"distance_km":null,"reasons":["age_fit"],"freshness":"fresh"}
    """
    return try JSONDecoder().decode(OccurrenceCard.self, from: Data(json.utf8))
}

private let now = APIDate.parse("2026-11-02T12:00:00+05:00")!

@Suite("Шрифты: Golos Text и Commissioner")
struct FontTests {
    init() { AfishaFonts.register() }

    @Test("Фирменные шрифты регистрируются из ресурсов пакета")
    func registered() {
        #expect(AfishaFonts.register())
        let text = AfishaFonts.font(TypeScale.body)
        let display = AfishaFonts.font(TypeScale.h1)
        #expect((CTFontCopyPostScriptName(text) as String).hasPrefix("GolosText"))
        #expect((CTFontCopyPostScriptName(display) as String).hasPrefix("Commissioner"))
    }

    @Test("Насыщенность задаётся осью wght, у дисплейного кегля — ось FLAR 60")
    func variationAxes() {
        let title = AfishaFonts.font(TypeScale.title)
        let variation = CTFontCopyVariation(title) as? [NSNumber: NSNumber] ?? [:]
        #expect(variation[NSNumber(value: AfishaFonts.Axis.weight)]?.doubleValue == 600)
        let display = AfishaFonts.font(TypeScale.display)
        let displayVariation = CTFontCopyVariation(display) as? [NSNumber: NSNumber] ?? [:]
        #expect(displayVariation[NSNumber(value: AfishaFonts.Axis.flare)]?.doubleValue == 60)
    }

    @Test("Все башкирские буквы есть в обоих шрифтах", arguments: [TypeScale.body, TypeScale.h1])
    func bashkirGlyphs(token: TypeToken) {
        let font = AfishaFonts.font(token)
        for character in "ӘәҒғҘҙҠҡҢңӨөҪҫҮүҺһ" {
            let utf16 = Array(String(character).utf16)
            var glyphs = [CGGlyph](repeating: 0, count: utf16.count)
            #expect(CTFontGetGlyphsForCharacters(font, utf16, &glyphs, utf16.count), "нет глифа «\(character)»")
        }
    }

    @Test("Dynamic Type: AX5 крупнее стандартного, заголовки растут медленнее текста")
    func dynamicType() {
        let body = DynamicTypeScale.factor(.accessibility5, for: TypeScale.body)
        let display = DynamicTypeScale.factor(.accessibility5, for: TypeScale.display)
        #expect(body > 3)
        #expect(display < body)
        #expect(DynamicTypeScale.factor(.large, for: TypeScale.body) == 1)
    }
}

@Suite("Снапшоты компонентов дизайн-системы")
@MainActor
struct ComponentSnapshotTests {
    init() { AfishaFonts.register() }

    @Test("Карточка события: строка, ru, светлая тема")
    func cardRowRu() throws {
        let card = CardPresentation(card: try sampleCard(availability: .fewLeft), language: .ru, now: now)
        Snapshot.assert(EventCardView(card, style: .row, language: .ru, isFavorite: false, onFavorite: {}).padding(), named: "card-row-ru-light", width: 390)
    }

    @Test("Карточка события: крупная, ba, тёмная тема")
    func cardFeatureBaDark() throws {
        let card = CardPresentation(card: try sampleCard(), language: .ba, now: now)
        Snapshot.assert(EventCardView(card, style: .feature, language: .ba, isFavorite: true, onFavorite: {}).padding(), named: "card-feature-ba-dark", width: 320, dark: true)
    }

    @Test("Карточка события: отменено, вертикальная раскладка на AX3")
    func cardCancelledAX() throws {
        let card = CardPresentation(card: try sampleCard(status: .cancelled), language: .ru, now: now)
        Snapshot.assert(EventCardView(card, style: .row, language: .ru).padding(), named: "card-cancelled-ax3", width: 390, dynamicType: .accessibility3)
    }

    @Test("Бейджи статусов: форма + текст")
    func statusBadges() {
        let badges: [StatusBadge] = [.rescheduled(newStart: APIDate.parse("2026-11-19T19:00:00+05:00")), .postponed, .cancelled, .soldOut, .fewLeft, .ended, .unverified]
        let view = VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(badges.enumerated()), id: \.offset) { _, badge in
                HStack {
                    StatusBadgeView(badge, language: .ru)
                    StatusBadgeView(badge, language: .ba)
                }
            }
        }
        .padding()
        Snapshot.assert(view, named: "status-badges", width: 560)
    }

    @Test("Зонтик курая")
    func kurai() {
        let rays = CategoryMotifKind.allCases.map { KuraiRay(id: $0.rawValue, kind: $0, title: Localizer.ru("category.\($0.rawValue)"), count: 120) }
        Snapshot.assert(
            KuraiUmbrella(rays: rays, selected: ["kids"], countFormatter: { Localizer.ru("count.events", $0) }, onSelect: { _ in }).strip.padding(.vertical),
            named: "kurai-umbrella", width: 760
        )
    }

    @Test("Иллюстрации-заглушки категорий")
    func illustrations() {
        let view = LazyVGrid(columns: Array(repeating: GridItem(.fixed(160)), count: 4), spacing: 8) {
            ForEach(CategoryMotifKind.allCases, id: \.self) { kind in
                CategoryIllustration(kind, seed: 1).frame(width: 160, height: 90).clipShape(KuskarCutRectangle())
            }
        }
        .padding()
        Snapshot.assert(view, named: "category-illustrations", width: 700)
    }

    @Test("Пчела Бал: состояния")
    func mascot() {
        let view = HStack(spacing: 12) {
            ForEach(BeeMood.allCases, id: \.self) { mood in BeeFigure(mood: mood).frame(width: 80, height: 80) }
        }
        .padding()
        Snapshot.assert(view, named: "bee-moods", width: 600)
    }

    @Test("Блок «Паспорт события»")
    func passport() throws {
        let provenance = try JSONDecoder().decode(Provenance.self, from: Data("""
        {"trust_level":"official","sources":[{"id":"culture_ru","title":"Культура.РФ / PRO.Культура.РФ","url":"https://www.culture.ru"},
        {"id":"site","title":"Сайт театра","url":null}],"last_verified_at":"2026-11-02T11:20:00+05:00","freshness":"fresh"}
        """.utf8))
        let history = try JSONDecoder().decode([ChangeEntry].self, from: Data("""
        [{"at":"2026-10-20T10:00:00+05:00","kind":"created","field":null,"old":null,"new":null,"text":"Событие добавлено в афишу","source":"culture_ru"},
         {"at":"2026-11-02T09:00:00+05:00","kind":"rescheduled","field":"starts_at","old":"2026-11-12","new":"2026-11-19","text":"Перенесено с 12 на 19 ноября (сообщил театр)","source":"site"}]
        """.utf8))
        Snapshot.assert(PassportBlock(provenance: provenance, history: history, qualityScore: 0.8, now: now, openURL: { _ in }).padding(), named: "passport-ru", width: 390)
    }

    @Test("Картинка для сторис 9:16")
    func story() throws {
        let card = CardPresentation(card: try sampleCard(), language: .ru, now: now)
        Snapshot.assert(StoryCardView(card: card, language: .ru, brand: "Тамаша", link: "afisharb.ru/e/…"), named: "story-ru", width: 720, height: 1280)
    }
}
