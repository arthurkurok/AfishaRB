import AfishaKit
import AfishaUI
import SwiftUI

/// Поиск (03 §2): строка запроса, чипы активных фильтров, шторка фильтров,
/// лента по дням с липкими заголовками и догрузкой.
struct SearchView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @State private var showFilters = false

    private var language: AppLanguage { app.settings.language }

    var body: some View {
        @Bindable var model = app.search
        ScrollView {
            LazyVStack(alignment: .leading, spacing: Tokens.Space.s3, pinnedViews: [.sectionHeaders]) {
                activeFilters
                    .padding(.horizontal, Tokens.Space.s4)
                content
            }
            .padding(.bottom, Tokens.Space.s5)
        }
        .background(Palette.bg)
        .navigationTitle(loc("tab.search"))
        .searchable(text: $model.filters.text, prompt: loc("search.prompt"))
        .onSubmit(of: .search) { runSearch() }
        .onChange(of: model.filters.text) { _, _ in runSearch(debounced: true) }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) { sortMenu }
            ToolbarItem(placement: .topBarTrailing) {
                Button { showFilters = true } label: {
                    Label(filtersTitle, systemImage: "line.3.horizontal.decrease.circle")
                        .labelStyle(.titleAndIcon)
                }
                .accessibilityLabel(filtersTitle)
            }
        }
        .sheet(isPresented: $showFilters) {
            FiltersSheet(initial: app.search.filters) { filters in
                app.search.filters = filters
                runSearch()
            }
            .presentationDetents([.medium, .large])
            .presentationDragIndicator(.visible)
        }
        .refreshable {
            runSearch()
            await app.search.waitForSearch()
        }
        .task { consumePendingOrLoad() }
        .onChange(of: app.router.pendingSearch) { _, _ in consumePendingOrLoad() }
    }

    private var filtersTitle: String {
        let count = app.search.filters.activeCount
        return count > 0 ? loc("search.filters.count", count) : loc("search.filters")
    }

    private func consumePendingOrLoad() {
        if let pending = app.router.pendingSearch {
            app.router.pendingSearch = nil
            app.search.filters = pending
            runSearch()
        } else if case .idle = app.search.state {
            runSearch()
        }
    }

    private func runSearch(debounced: Bool = false) {
        let needsLocation = app.search.filters.nearRadiusKm != nil && app.location.coordinate == nil
        if needsLocation {
            Task {
                let coordinate = await app.location.requestLocation()
                if let coordinate { app.settings.lastLocation = coordinate } else { app.search.filters.nearRadiusKm = nil }
                app.search.search(language: language, near: coordinate ?? app.settings.lastLocation)
            }
        } else {
            app.search.search(language: language, near: app.nearCoordinate, debounced: debounced)
        }
    }

    // MARK: Чипы активных фильтров

    @ViewBuilder private var activeFilters: some View {
        let chips = FilterChips.make(app.search.filters, language: language, reference: app.reference)
        if !chips.isEmpty {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: Tokens.Space.s2) {
                    ForEach(chips) { chip in
                        Button {
                            chip.remove(&app.search.filters)
                            runSearch()
                        } label: {
                            Chip(chip.title, systemImage: "xmark", selected: true)
                        }
                        .accessibilityLabel(loc("search.filter.remove", chip.title))
                    }
                    if app.search.filters.activeCount > 1 {
                        Button(loc("search.filters.reset")) {
                            app.search.filters.reset()
                            runSearch()
                        }
                        .typography(TypeScale.caption, weight: 600)
                        .foregroundStyle(Palette.accent)
                        .frame(minHeight: Tokens.Touch.minIos)
                    }
                }
            }
        }
    }

    private var sortMenu: some View {
        Menu {
            Picker(loc("sort.title"), selection: Binding(
                get: { app.search.filters.sort ?? .relevance },
                set: { app.search.filters.sort = $0; runSearch() }
            )) {
                ForEach(SortMode.allCases, id: \.self) { mode in
                    Text(mode.title(language)).tag(mode)
                }
            }
        } label: {
            Label(loc("sort.title"), systemImage: "arrow.up.arrow.down")
        }
    }

    // MARK: Выдача

    private var skeletons: some View {
        ForEach(0..<4, id: \.self) { _ in EventCardSkeleton().padding(.horizontal, Tokens.Space.s4) }
    }

    @ViewBuilder private var content: some View {
        let model = app.search
        switch model.state {
        case .idle:
            skeletons
        case .loading where model.items.isEmpty:
            skeletons
        case let .failed(error) where model.items.isEmpty:
            EmptyStateView(mood: .offline, title: error.message(language), actionTitle: loc("common.retry")) { runSearch() }
        default:
            if model.items.isEmpty {
                EmptyStateView(
                    mood: .notFound,
                    title: loc("search.empty"),
                    message: loc("search.empty.hint"),
                    actionTitle: model.filters.activeCount > 0 ? loc("search.filters.reset") : nil,
                    action: model.filters.activeCount > 0 ? { app.search.filters.reset(); runSearch() } : nil
                )
            } else {
                Text(loc("search.found", model.total))
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
                    .padding(.horizontal, Tokens.Space.s4)
                    .accessibilityAddTraits(.updatesFrequently)
                ForEach(model.sections) { section in
                    Section {
                        ForEach(section.items, id: \.id) { card in
                            EventCardLink(card: card, style: .row)
                                .padding(.horizontal, Tokens.Space.s4)
                                .onAppear {
                                    if card.id == model.items.last?.id {
                                        Task { await app.search.loadMore(language: language, near: app.nearCoordinate) }
                                    }
                                }
                        }
                    } header: {
                        DayHeader(title: EventDateFormatter(language: language).dayHeader(section.day), count: section.items.count)
                    }
                }
                if model.isLoadingMore {
                    ProgressView().frame(maxWidth: .infinity).padding()
                }
            }
        }
    }
}

/// Липкий заголовок дня: «Сегодня», «Суббота, 8 ноября».
struct DayHeader: View {
    @Environment(\.loc) private var loc
    let title: String
    let count: Int

    var body: some View {
        HStack(spacing: Tokens.Space.s2) {
            Rhombus(cornerRadius: 0.1).fill(Palette.accent).frame(width: 8, height: 8)
            Text(title).typography(TypeScale.title).foregroundStyle(Palette.ink)
            Spacer()
            Text(loc("count.events", count)).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
        }
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.vertical, Tokens.Space.s2)
        .background(Palette.bg.opacity(0.97))
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.isHeader)
    }
}

/// Чип активного фильтра с действием «убрать».
struct FilterChip: Identifiable {
    let id: String
    let title: String
    let remove: (inout SearchFilters) -> Void
}

enum FilterChips {
    @MainActor
    static func make(_ filters: SearchFilters, language: AppLanguage, reference: ReferenceData) -> [FilterChip] {
        let loc = Localizer(language: language)
        let dates = EventDateFormatter(language: language)
        var chips: [FilterChip] = []
        if let when = filters.when {
            chips.append(FilterChip(id: "when", title: when.title(language)) { $0.when = nil })
        }
        if let range = filters.dateRange {
            chips.append(FilterChip(id: "range", title: dates.range(range)) { $0.dateRange = nil })
        }
        for time in TimeOfDay.allCases where filters.timeOfDay.contains(time) {
            chips.append(FilterChip(id: "time-\(time.rawValue)", title: time.title(language)) { $0.timeOfDay.remove(time) })
        }
        if let radius = filters.nearRadiusKm {
            chips.append(FilterChip(id: "near", title: loc("filters.near.chip", String(format: "%g", radius))) { $0.nearRadiusKm = nil })
        } else {
            for id in filters.municipalities {
                let name = reference.municipality(id: id)?.name ?? id
                chips.append(FilterChip(id: "city-\(id)", title: name) { $0.municipalities.removeAll { $0 == id } })
            }
        }
        for code in CategoryCode.allCases where filters.categories.contains(code) {
            chips.append(FilterChip(id: "cat-\(code.rawValue)", title: code.title(language)) { $0.categories.remove(code) })
        }
        if filters.freeOnly {
            chips.append(FilterChip(id: "free", title: loc("price.free")) { $0.freeOnly = false })
        }
        if let price = filters.priceMax {
            chips.append(FilterChip(id: "price", title: PriceFormatter(language: language).upTo(price)) { $0.priceMax = nil })
        }
        if let age = filters.childAge {
            chips.append(FilterChip(id: "age", title: loc("filters.child.chip", age)) { $0.childAge = nil })
        }
        if let rating = filters.ageRatingMax {
            chips.append(FilterChip(id: "rating", title: loc("filters.rating.chip", rating)) { $0.ageRatingMax = nil })
        }
        if filters.pushkin {
            chips.append(FilterChip(id: "pushkin", title: loc("card.pushkin")) { $0.pushkin = false })
        }
        if filters.accessible {
            chips.append(FilterChip(id: "accessible", title: loc("filters.accessible")) { $0.accessible = false })
        }
        if filters.hideSoldOut {
            chips.append(FilterChip(id: "soldout", title: loc("filters.hide_sold_out.chip")) { $0.hideSoldOut = false })
        }
        return chips
    }
}
