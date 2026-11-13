import AfishaKit
import AfishaStore
import AfishaUI
import SwiftUI

/// Главная (03 §2): строка Гида, «Сегодня / Завтра / Выходные», «зонтик курая», лента,
/// подборки «Бесплатно», «Пушкинская карта», «Детям», выбор города.
struct HomeView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @State private var showCityPicker = false

    var body: some View {
        let model = app.home
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s5) {
                header
                GuidePromptBar { app.router.openGuide() }
                    .padding(.horizontal, Tokens.Space.s4)
                periodPicker
                    .padding(.horizontal, Tokens.Space.s4)
                if let since = model.offlineSince {
                    InfoBanner(.offline, text: loc("offline.cached", EventDateFormatter(language: app.settings.language).ago(since)))
                        .padding(.horizontal, Tokens.Space.s4)
                }
                categories
                feed
                ForEach(HomeCollection.allCases) { collection in
                    collectionSection(collection)
                }
                statsFooter
            }
            .padding(.vertical, Tokens.Space.s4)
        }
        .background(Palette.bg)
        .refreshable { await reload() }
        .task(id: reloadKey) { await reload() }
        .toolbar(.hidden, for: .navigationBar)
        .sheet(isPresented: $showCityPicker) {
            CityPickerView { municipality in
                app.selectCity(municipality)
                showCityPicker = false
            }
        }
    }

    private var reloadKey: String { "\(app.settings.municipalityID)|\(app.settings.language.rawValue)|\(app.home.period.rawValue)" }

    private func reload() async {
        await app.home.load(municipalityID: app.settings.municipalityID, language: app.settings.language)
    }

    // MARK: Шапка

    private var header: some View {
        HStack(alignment: .center, spacing: Tokens.Space.s3) {
            VStack(alignment: .leading, spacing: 2) {
                Text(loc("app.name"))
                    .typography(TypeScale.h1)
                    .foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(loc("app.tagline"))
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
            }
            Spacer(minLength: Tokens.Space.s2)
            Button { showCityPicker = true } label: {
                HStack(spacing: 4) {
                    Image(systemName: "mappin.and.ellipse").imageScale(.small)
                    Text(app.cityName).typography(TypeScale.body, weight: 600).lineLimit(1)
                    Image(systemName: "chevron.down").imageScale(.small)
                }
                .foregroundStyle(Palette.accent)
                .padding(.horizontal, Tokens.Space.s3)
                .frame(minHeight: Tokens.Touch.minIos)
                .background(Capsule().fill(Palette.surface))
                .overlay(Capsule().strokeBorder(Palette.line, lineWidth: 1))
            }
            .accessibilityLabel(loc("city.current", app.cityName))
            .accessibilityHint(loc("city.change.hint"))
        }
        .padding(.horizontal, Tokens.Space.s4)
    }

    // MARK: Период

    private var periodPicker: some View {
        @Bindable var model = app.home
        return Picker(loc("home.period"), selection: $model.period) {
            ForEach(HomeModel.periods) { preset in
                Text(preset.title(app.settings.language)).tag(preset)
            }
        }
        .pickerStyle(.segmented)
    }

    // MARK: Зонтик курая

    private var categories: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            SectionTitle(loc("home.categories"))
                .padding(.horizontal, Tokens.Space.s4)
            KuraiUmbrella(
                rays: kuraiRays,
                countFormatter: { loc("count.events", $0) },
                onSelect: { ray in
                    var filters = app.home.baseFilters(municipalityID: app.settings.municipalityID)
                    if let code = CategoryCode(rawValue: ray.id) { filters.categories = [code] }
                    app.router.openSearch(filters)
                }
            )
            .padding(.horizontal, dynamicTypeIsAX ? Tokens.Space.s4 : 0)
        }
    }

    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var dynamicTypeIsAX: Bool { dynamicTypeSize.isAccessibilitySize }

    private var kuraiRays: [KuraiRay] {
        let fromAPI = app.reference.categories
        if fromAPI.isEmpty {
            return CategoryCode.allCases.map { KuraiRay(id: $0.rawValue, kind: CategoryMotifKind(code: $0.rawValue), title: $0.title(app.settings.language), count: nil) }
        }
        return fromAPI.map { KuraiRay(id: $0.code.rawValue, kind: CategoryMotifKind(code: $0.code.rawValue), title: $0.title, count: $0.count) }
    }

    // MARK: Лента периода

    @ViewBuilder private var feed: some View {
        let model = app.home
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            SectionTitle(
                loc("home.feed.title", model.period.title(app.settings.language), app.cityName),
                actionTitle: loc("common.show_all"),
                action: { app.router.openSearch(model.baseFilters(municipalityID: app.settings.municipalityID)) }
            )
            .padding(.horizontal, Tokens.Space.s4)

            switch model.feed {
            case .idle, .loading:
                VStack(spacing: Tokens.Space.s3) {
                    ForEach(0..<3, id: \.self) { _ in EventCardSkeleton() }
                }
                .padding(.horizontal, Tokens.Space.s4)
            case let .failed(error):
                EmptyStateView(mood: .offline, title: error.message(app.settings.language), actionTitle: loc("common.retry")) {
                    Task { await reload() }
                }
            case let .loaded(result, _):
                if result.items.isEmpty {
                    EmptyStateView(
                        mood: .notFound,
                        title: loc("home.feed.empty"),
                        actionTitle: loc("home.feed.empty.action"),
                        action: {
                            var filters = model.baseFilters(municipalityID: app.settings.municipalityID)
                            filters.setWhen(.week)
                            app.router.openSearch(filters)
                        }
                    )
                } else {
                    LazyVStack(spacing: Tokens.Space.s3) {
                        ForEach(result.items.prefix(8), id: \.id) { card in
                            EventCardLink(card: card, style: .row)
                        }
                    }
                    .padding(.horizontal, Tokens.Space.s4)
                    if result.total > 8 {
                        Button(loc("home.feed.more", result.total)) {
                            app.router.openSearch(model.baseFilters(municipalityID: app.settings.municipalityID))
                        }
                        .buttonStyle(.afishaSecondary)
                        .padding(.horizontal, Tokens.Space.s4)
                    }
                }
            }
        }
    }

    // MARK: Подборки

    @ViewBuilder private func collectionSection(_ collection: HomeCollection) -> some View {
        let items = app.home.collections[collection] ?? []
        if !items.isEmpty {
            VStack(alignment: .leading, spacing: Tokens.Space.s3) {
                SectionTitle(
                    collection.title(app.settings.language),
                    actionTitle: loc("common.show_all"),
                    action: {
                        var base = app.home.baseFilters(municipalityID: app.settings.municipalityID)
                        base.setWhen(.week)
                        app.router.openSearch(collection.filters(base: base))
                    }
                )
                .padding(.horizontal, Tokens.Space.s4)
                ScrollView(.horizontal, showsIndicators: false) {
                    LazyHStack(alignment: .top, spacing: Tokens.Space.s3) {
                        ForEach(items, id: \.id) { card in
                            EventCardLink(card: card, style: .feature)
                                .frame(width: dynamicTypeIsAX ? 320 : 272)
                        }
                    }
                    .padding(.horizontal, Tokens.Space.s4)
                }
            }
        }
    }

    @ViewBuilder private var statsFooter: some View {
        if let stats = app.home.stats {
            Text(loc("home.stats", stats.upcomingOccurrences, stats.venues, stats.municipalitiesWithEvents))
                .typography(TypeScale.caption)
                .foregroundStyle(Palette.ink2)
                .padding(.horizontal, Tokens.Space.s4)
                .frame(maxWidth: .infinity, alignment: .center)
                .multilineTextAlignment(.center)
        }
    }
}

/// Строка Гида на главной: «Спросите, куда сходить…».
struct GuidePromptBar: View {
    @Environment(\.loc) private var loc
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: Tokens.Space.s3) {
                BeeMascot(mood: .hello, size: 36)
                VStack(alignment: .leading, spacing: 2) {
                    Text(loc("home.guide.prompt"))
                        .typography(TypeScale.body, weight: 600)
                        .foregroundStyle(Palette.ink)
                    Text(loc("home.guide.example"))
                        .typography(TypeScale.caption)
                        .foregroundStyle(Palette.ink2)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.right.circle.fill")
                    .font(.title2)
                    .foregroundStyle(Palette.accent)
            }
            .padding(Tokens.Space.s3)
            .frame(minHeight: Tokens.Touch.minIos)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).fill(Palette.surface))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).strokeBorder(Palette.honey, lineWidth: 1.5))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityHint(loc("home.guide.hint"))
    }
}

/// Карточка события со ссылкой на паспорт и кнопкой избранного.
struct EventCardLink: View {
    @Environment(AppEnvironment.self) private var app
    let card: OccurrenceCard
    var style: EventCardStyle = .row

    var body: some View {
        Button {
            app.router.openEvent(id: card.event.id, preview: card)
        } label: {
            EventCardView(
                CardPresentation(card: card, language: app.settings.language),
                style: style,
                language: app.settings.language,
                isFavorite: app.store.isFavorite(card.event.id),
                onFavorite: { app.store.toggleFavorite(card: card) }
            )
        }
        .buttonStyle(CardButtonStyle())
    }
}

/// Нажатие на карточку: лёгкое уменьшение (при Reduce Motion — только прозрачность).
struct CardButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.9 : 1)
            .animation(Motion.fast(reduceMotion: reduceMotion), value: configuration.isPressed)
    }
}
