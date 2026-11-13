import AfishaKit
import AfishaUI
import SwiftUI
import WidgetKit

/// Виджет «Сегодня рядом» (08 §4): ближайшие события сегодня в городе пользователя
/// или в радиусе 10 км от последней геопозиции (если пользователь её разрешил в приложении).
struct TodayNearbyWidget: Widget {
    static let kind = "TodayNearby"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: TodayNearbyWidget.kind, provider: TodayNearbyProvider()) { entry in
            TodayNearbyView(entry: entry)
                .containerBackground(for: .widget) { Palette.bg }
        }
        .configurationDisplayName(Localizer(language: AppSettings.snapshot().language)("widget.today.title"))
        .description(Localizer(language: AppSettings.snapshot().language)("widget.today.description"))
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TodayNearbyEntry: TimelineEntry {
    let date: Date
    let language: AppLanguage
    let place: String
    let cards: [CardPresentation]
    /// Данные из кэша: сеть недоступна.
    let isStale: Bool

    static func placeholder(language: AppLanguage) -> TodayNearbyEntry {
        TodayNearbyEntry(date: Date(), language: language, place: Localizer(language: language)("city.default"), cards: [], isStale: false)
    }
}

struct TodayNearbyProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayNearbyEntry {
        .placeholder(language: AppSettings.snapshot().language)
    }

    func getSnapshot(in context: Context, completion: @escaping @Sendable (TodayNearbyEntry) -> Void) {
        if context.isPreview {
            completion(.placeholder(language: AppSettings.snapshot().language))
            return
        }
        Task { completion(await TodayNearbyProvider.load()) }
    }

    func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<TodayNearbyEntry>) -> Void) {
        Task {
            let entry = await TodayNearbyProvider.load()
            // Обновляем раз в 30 минут: прошедшие сеансы уходят, новые подтягиваются
            completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(30 * 60))))
        }
    }

    static func load(now: Date = Date()) async -> TodayNearbyEntry {
        AfishaFonts.register()
        let settings = AppSettings.snapshot()
        let language = settings.language
        let loc = Localizer(language: language)
        var filters = SearchFilters(when: .today)
        filters.sort = .date
        let place: String
        if settings.lastLocation != nil {
            filters.nearRadiusKm = 10
            place = loc("widget.near")
        } else {
            filters.municipalities = [settings.municipalityID]
            place = settings.municipalityName ?? loc("city.default")
        }
        do {
            let result = try await LiveAfishaService().search(filters, language: language, near: settings.lastLocation, cursor: nil, limit: 10)
            let upcoming = result.items.filter { $0.isUpcoming(now: now) && !($0.badge?.isInactive ?? false) }
            WidgetCache.save(Array(upcoming.prefix(3)))
            let cards = upcoming.prefix(3).map { CardPresentation(card: $0, language: language, now: now) }
            return TodayNearbyEntry(date: now, language: language, place: place, cards: Array(cards), isStale: false)
        } catch {
            let cached = WidgetCache.load().filter { $0.isUpcoming(now: now) }
            let cards = cached.map { CardPresentation(card: $0, language: language, now: now) }
            return TodayNearbyEntry(date: now, language: language, place: place, cards: cards, isStale: true)
        }
    }
}

/// Последняя удачная выдача виджета — показывается без сети.
enum WidgetCache {
    private static let key = "widget.today.cards"

    static func save(_ cards: [OccurrenceCard]) {
        guard let data = try? JSONEncoder().encode(cards) else { return }
        UserDefaults(suiteName: AppConstants.appGroup)?.set(data, forKey: key)
    }

    static func load() -> [OccurrenceCard] {
        guard let data = UserDefaults(suiteName: AppConstants.appGroup)?.data(forKey: key) else { return [] }
        return (try? JSONDecoder().decode([OccurrenceCard].self, from: data)) ?? []
    }
}

struct TodayNearbyView: View {
    @Environment(\.widgetFamily) private var family
    let entry: TodayNearbyEntry

    private var loc: Localizer { Localizer(language: entry.language) }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            if entry.cards.isEmpty {
                Spacer(minLength: 0)
                Text(loc("widget.today.empty"))
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
                Spacer(minLength: 0)
            } else if family == .systemSmall, let card = entry.cards.first {
                smallBody(card)
            } else {
                ForEach(entry.cards.prefix(3), id: \.id) { card in
                    Link(destination: DeepLink.event(id: card.eventID).url) { row(card) }
                }
                Spacer(minLength: 0)
            }
        }
        .widgetURL(entry.cards.first.map { DeepLink.event(id: $0.eventID).url } ?? DeepLink.today.url)
        .environment(\.loc, loc)
    }

    private var header: some View {
        HStack(spacing: 4) {
            Rhombus(cornerRadius: 0.1).fill(Palette.accent).frame(width: 8, height: 8)
            Text(loc("widget.today.header", entry.place))
                .typography(TypeScale.caption, weight: 700)
                .foregroundStyle(Palette.accent)
                .lineLimit(1)
            if entry.isStale {
                Image(systemName: "wifi.slash").font(.caption2).foregroundStyle(Palette.ink2)
                    .accessibilityLabel(loc("widget.offline"))
            }
        }
    }

    private func smallBody(_ card: CardPresentation) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(card.time ?? card.sessionLine)
                .typography(TypeScale.h2)
                .foregroundStyle(Palette.ink)
            Text(card.title)
                .typography(TypeScale.caption, weight: 600)
                .foregroundStyle(Palette.ink)
                .lineLimit(3)
            Spacer(minLength: 0)
            if let venue = card.venueLine {
                Text(venue).typography(TypeScale.caption).foregroundStyle(Palette.ink2).lineLimit(1)
            }
            KaimaBand(color: CategoryMotifKind(code: card.categoryCode).color.color, height: 3)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityLabel)
    }

    private func row(_ card: CardPresentation) -> some View {
        HStack(alignment: .top, spacing: 8) {
            Text(card.time ?? "•")
                .typography(TypeScale.caption, weight: 700)
                .foregroundStyle(Palette.ink)
                .frame(width: 44, alignment: .leading)
            Rectangle()
                .fill(CategoryMotifKind(code: card.categoryCode).color.color)
                .frame(width: 3)
            VStack(alignment: .leading, spacing: 1) {
                Text(card.title).typography(TypeScale.caption, weight: 600).foregroundStyle(Palette.ink).lineLimit(1)
                if let venue = card.venueLine {
                    Text(venue).typography(TypeScale.caption).foregroundStyle(Palette.ink2).lineLimit(1)
                }
            }
            Spacer(minLength: 0)
            if let price = card.priceChip {
                Text(price).typography(TypeScale.caption).foregroundStyle(Palette.ink2).lineLimit(1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityLabel)
    }
}
