import AfishaKit
import AfishaUI
import AppIntents
import SwiftUI

/// Мост App Intents → навигация приложения: интенты с `openAppWhenRun` выполняются в процессе
/// приложения и передают диплинк роутеру.
@MainActor
enum IntentBridge {
    static var open: ((DeepLink) -> Void)?
}

// MARK: - Город

/// Город или район для Siri: «Куда сходить сегодня в Стерлитамаке».
struct CityEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Город")
    static let defaultQuery = CityQuery()

    let id: String
    let name: String

    var displayRepresentation: DisplayRepresentation { DisplayRepresentation(title: "\(name)") }
}

struct CityQuery: EntityStringQuery {
    func entities(for identifiers: [String]) async throws -> [CityEntity] {
        try await all().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [CityEntity] {
        let query = string.lowercased()
        return try await all().filter { $0.name.lowercased().contains(query) || $0.id.contains(query) }
    }

    func suggestedEntities() async throws -> [CityEntity] {
        Array(try await all().prefix(12))
    }

    private func all() async throws -> [CityEntity] {
        let language = AppSettings.snapshot().language
        let municipalities = try await LiveAfishaService().municipalities(language: language)
        return municipalities
            .sorted { ($0.upcoming ?? 0) > ($1.upcoming ?? 0) }
            .map { CityEntity(id: $0.id, name: $0.name) }
    }
}

// MARK: - Событие

struct EventEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Событие")
    static let defaultQuery = EventEntityQuery()

    let id: String
    let title: String
    let subtitle: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)", subtitle: "\(subtitle)")
    }
}

struct EventEntityQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [EventEntity] {
        let language = AppSettings.snapshot().language
        var result: [EventEntity] = []
        for id in identifiers.prefix(10) {
            if let detail = try? await LiveAfishaService().event(id: id, language: language) {
                let session = detail.nearestSession()
                let card = session.map { CardPresentation(card: detail.card(for: $0), language: language) }
                result.append(EventEntity(id: detail.id, title: detail.title, subtitle: card?.sessionLine ?? ""))
            }
        }
        return result
    }
}

// MARK: - «Куда сходить сегодня»

/// «Куда сходить сегодня» — главный голосовой сценарий (08 §4): Siri отвечает фразой
/// и показывает три ближайших события; тап по карточке открывает паспорт.
struct WhereToGoTodayIntent: AppIntent {
    static let title: LocalizedStringResource = "Куда сходить сегодня"
    static let description = IntentDescription("Подбирает культурные события на сегодня в выбранном городе Башкортостана.")

    @Parameter(title: "Город")
    var city: CityEntity?

    static var parameterSummary: some ParameterSummary {
        Summary("Куда сходить сегодня в \(\.$city)")
    }

    @MainActor
    func perform() async throws -> some IntentResult & ProvidesDialog & ShowsSnippetView & ReturnsValue<[EventEntity]> {
        let settings = AppSettings.snapshot()
        let language = settings.language
        let loc = Localizer(language: language)
        let municipalityID = city?.id ?? settings.municipalityID
        let cityName = city?.name ?? settings.municipalityName ?? loc("city.default")

        var filters = SearchFilters(when: .today, municipalities: [municipalityID])
        filters.sort = .date
        let result: SearchResult
        do {
            result = try await LiveAfishaService().search(filters, language: language, near: nil, cursor: nil, limit: 5)
        } catch {
            let message = AfishaError.from(error).message(language)
            return .result(value: [], dialog: IntentDialog("\(message)"), view: IntentSnippet(cards: [], language: language, emptyText: message))
        }

        let now = Date()
        let upcoming = result.items.filter { $0.isUpcoming(now: now) }
        let cards = upcoming.prefix(3).map { CardPresentation(card: $0, language: language, now: now) }
        let entities = cards.map { EventEntity(id: $0.eventID, title: $0.title, subtitle: $0.sessionLine) }
        let text: String
        if let first = cards.first {
            text = loc("intent.today.found", cityName, result.total, first.title, first.sessionLine)
        } else {
            text = loc("intent.today.empty", cityName)
        }
        return .result(value: entities, dialog: IntentDialog("\(text)"), view: IntentSnippet(cards: cards, language: language, emptyText: text))
    }
}

/// Открыть паспорт события в приложении.
struct OpenEventIntent: AppIntent {
    static let title: LocalizedStringResource = "Открыть событие"
    static let openAppWhenRun = true

    @Parameter(title: "Событие")
    var event: EventEntity

    @MainActor
    func perform() async throws -> some IntentResult {
        IntentBridge.open?(.event(id: event.id))
        return .result()
    }
}

/// Открыть Гида с вопросом.
struct AskGuideIntent: AppIntent {
    static let title: LocalizedStringResource = "Спросить Гида"
    static let description = IntentDescription("Открывает Гида афиши с вашим вопросом.")
    static let openAppWhenRun = true

    @Parameter(title: "Вопрос")
    var question: String?

    @MainActor
    func perform() async throws -> some IntentResult {
        IntentBridge.open?(.guide(question: question))
        return .result()
    }
}

/// Ярлыки Siri и Spotlight. Фразы обязаны содержать название приложения.
struct AfishaShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(
            intent: WhereToGoTodayIntent(),
            phrases: [
                "Куда сходить сегодня в \(.applicationName)",
                "Что сегодня в \(.applicationName)",
                "Афиша на сегодня в \(.applicationName)",
            ],
            shortTitle: "Куда сходить сегодня",
            systemImageName: "sparkles"
        )
        AppShortcut(
            intent: AskGuideIntent(),
            phrases: ["Спросить гида \(.applicationName)", "Открой гида в \(.applicationName)"],
            shortTitle: "Спросить Гида",
            systemImageName: "bubble.left.and.text.bubble.right"
        )
    }

    static let shortcutTileColor: ShortcutTileColor = .orange
}

/// Сниппет Siri: до трёх ближайших событий.
struct IntentSnippet: View {
    let cards: [CardPresentation]
    let language: AppLanguage
    let emptyText: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            if cards.isEmpty {
                Text(emptyText).typography(TypeScale.body)
            }
            ForEach(cards, id: \.id) { card in
                Link(destination: DeepLink.event(id: card.eventID).url) {
                    HStack(alignment: .top, spacing: 10) {
                        DateRhombus(day: card.day, month: card.monthShort, caption: nil, color: CategoryMotifKind(code: card.categoryCode).color.color)
                            .scaleEffect(0.7)
                            .frame(width: 48, height: 48)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(card.title).typography(TypeScale.body, weight: 600).lineLimit(2)
                            Text(card.sessionLine).typography(TypeScale.caption).foregroundStyle(Palette.accent)
                            if let venue = card.venueLine {
                                Text(venue).typography(TypeScale.caption).foregroundStyle(Palette.ink2).lineLimit(1)
                            }
                        }
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(card.accessibilityLabel)
            }
        }
        .padding()
    }
}
