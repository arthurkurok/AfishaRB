import AfishaKit
import AfishaUI
import SwiftUI

/// Шторка фильтров (03 §1.2): дата, время суток, город или «рядом», цена, возраст,
/// категории, Пушкинская карта, доступная среда, распроданные. Кнопка «Показать N».
struct FiltersSheet: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @Environment(\.dismiss) private var dismiss
    @State private var draft: SearchFilters
    @State private var customFrom = Date()
    @State private var customTo = Date().addingTimeInterval(7 * 86400)
    @State private var showCityPicker = false
    let onApply: (SearchFilters) -> Void

    init(initial: SearchFilters, onApply: @escaping (SearchFilters) -> Void) {
        _draft = State(initialValue: initial)
        self.onApply = onApply
        if let range = initial.dateRange {
            _customFrom = State(initialValue: range.from.startOfDay)
            _customTo = State(initialValue: range.to.startOfDay)
        }
    }

    private var language: AppLanguage { app.settings.language }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Tokens.Space.s5) {
                    dateSection
                    placeSection
                    priceSection
                    ageSection
                    categorySection
                    optionsSection
                }
                .padding(Tokens.Space.s4)
            }
            .background(Palette.bg)
            .navigationTitle(loc("search.filters"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button(loc("common.close")) { dismiss() } }
                ToolbarItem(placement: .destructiveAction) {
                    Button(loc("search.filters.reset")) { draft.reset() }
                        .disabled(draft.activeCount == 0)
                }
            }
            .safeAreaInset(edge: .bottom) { applyBar }
            .onChange(of: draft) { _, newValue in
                app.search.updatePreview(for: newValue, language: language, near: app.nearCoordinate)
            }
            .onAppear { app.search.updatePreview(for: draft, language: language, near: app.nearCoordinate) }
            .onDisappear { app.search.clearPreview() }
            .sheet(isPresented: $showCityPicker) {
                CityPickerView { municipality in
                    draft.municipalities = [municipality.id]
                    draft.nearRadiusKm = nil
                    showCityPicker = false
                }
            }
        }
    }

    private var applyBar: some View {
        let count = app.search.previewCount
        return Button {
            onApply(draft)
            dismiss()
        } label: {
            Text(count.map { loc("filters.show.count", $0) } ?? loc("filters.show"))
        }
        .buttonStyle(.afishaPrimary)
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.vertical, Tokens.Space.s2)
        .background(.bar)
    }

    // MARK: Секции

    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            Text(title)
                .typography(TypeScale.title)
                .foregroundStyle(Palette.ink)
                .accessibilityAddTraits(.isHeader)
            content()
        }
    }

    private func toggleChip(_ title: String, isOn: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) { Chip(title, selected: isOn) }
            .buttonStyle(.plain)
            .frame(minHeight: Tokens.Touch.minIos)
            .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }

    private var dateSection: some View {
        section(loc("filters.date")) {
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(WhenPreset.allCases) { preset in
                    toggleChip(preset.title(language), isOn: draft.when == preset) {
                        draft.setWhen(draft.when == preset ? nil : preset)
                    }
                }
                toggleChip(loc("filters.date.custom"), isOn: draft.dateRange != nil) {
                    if draft.dateRange == nil {
                        draft.setDateRange(DateRange(from: LocalDate(customFrom), to: LocalDate(customTo)))
                    } else {
                        draft.setDateRange(nil)
                    }
                }
            }
            if draft.dateRange != nil {
                DatePicker(loc("filters.date.from"), selection: $customFrom, in: Date()..., displayedComponents: .date)
                    .onChange(of: customFrom) { _, value in
                        if customTo < value { customTo = value }
                        draft.setDateRange(DateRange(from: LocalDate(value), to: LocalDate(customTo)))
                    }
                DatePicker(loc("filters.date.to"), selection: $customTo, in: customFrom..., displayedComponents: .date)
                    .onChange(of: customTo) { _, value in
                        draft.setDateRange(DateRange(from: LocalDate(customFrom), to: LocalDate(value)))
                    }
            }
            Text(loc("filters.time")).typography(TypeScale.caption, weight: 600).foregroundStyle(Palette.ink2)
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(TimeOfDay.allCases) { time in
                    toggleChip(time.title(language), isOn: draft.timeOfDay.contains(time)) {
                        if draft.timeOfDay.contains(time) { draft.timeOfDay.remove(time) } else { draft.timeOfDay.insert(time) }
                    }
                }
            }
        }
    }

    private var placeSection: some View {
        section(loc("filters.place")) {
            Button { showCityPicker = true } label: {
                HStack {
                    Image(systemName: "mappin.and.ellipse")
                    Text(draft.nearRadiusKm == nil
                         ? (draft.municipalities.first.flatMap { app.reference.municipality(id: $0)?.name } ?? loc("filters.place.all"))
                         : loc("filters.near"))
                        .typography(TypeScale.body, weight: 600)
                    Spacer()
                    Image(systemName: "chevron.right").foregroundStyle(Palette.ink2)
                }
                .foregroundStyle(Palette.ink)
                .padding(Tokens.Space.s3)
                .frame(minHeight: Tokens.Touch.minIos)
                .background(RoundedRectangle(cornerRadius: Tokens.Radius.m).fill(Palette.surface))
            }
            .buttonStyle(.plain)
            if !draft.municipalities.isEmpty || draft.nearRadiusKm != nil {
                Button(loc("filters.place.all")) {
                    draft.municipalities = []
                    draft.nearRadiusKm = nil
                }
                .typography(TypeScale.caption, weight: 600)
                .foregroundStyle(Palette.accent)
            }
            Text(loc("filters.near")).typography(TypeScale.caption, weight: 600).foregroundStyle(Palette.ink2)
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(SearchFilters.radiusPresets, id: \.self) { radius in
                    toggleChip(loc("filters.radius", String(format: "%g", radius)), isOn: draft.nearRadiusKm == radius) {
                        draft.nearRadiusKm = draft.nearRadiusKm == radius ? nil : radius
                    }
                }
            }
            if app.location.isDenied {
                Text(loc("location.denied")).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
            }
        }
    }

    private var priceSection: some View {
        section(loc("filters.price")) {
            FlowLayout(spacing: Tokens.Space.s2) {
                toggleChip(loc("price.free"), isOn: draft.freeOnly) { draft.setFree(!draft.freeOnly) }
                ForEach(SearchFilters.pricePresets, id: \.self) { value in
                    toggleChip(PriceFormatter(language: language).upTo(value), isOn: draft.priceMax == value) {
                        draft.setPriceMax(draft.priceMax == value ? nil : value)
                    }
                }
            }
        }
    }

    private var ageSection: some View {
        section(loc("filters.age")) {
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(AgeRating.allowed, id: \.self) { rating in
                    toggleChip(AgeRating(rating).label, isOn: draft.ageRatingMax == rating && draft.childAge == nil) {
                        draft.childAge = nil
                        draft.ageRatingMax = draft.ageRatingMax == rating ? nil : rating
                    }
                }
            }
            Toggle(isOn: Binding(
                get: { draft.childAge != nil },
                set: { draft.childAge = $0 ? 5 : nil; if $0 { draft.ageRatingMax = nil } }
            )) {
                Text(loc("filters.child")).typography(TypeScale.body)
            }
            .tint(Palette.accent)
            if let age = draft.childAge {
                Stepper(value: Binding(get: { age }, set: { draft.childAge = $0 }), in: 0...17) {
                    Text(loc("filters.child.chip", age)).typography(TypeScale.body, weight: 600)
                }
                Text(loc("filters.child.hint", AgeRating.maxRating(forChildAge: age).label))
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
            }
        }
    }

    private var categorySection: some View {
        section(loc("filters.categories")) {
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(CategoryCode.allCases, id: \.self) { code in
                    toggleChip(code.title(language), isOn: draft.categories.contains(code)) { draft.toggle(code) }
                }
            }
        }
    }

    private var optionsSection: some View {
        section(loc("filters.more")) {
            VStack(spacing: Tokens.Space.s1) {
                Toggle(isOn: $draft.pushkin) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(loc("card.pushkin")).typography(TypeScale.body)
                        Text(loc("filters.pushkin.hint")).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                    }
                }
                Toggle(isOn: $draft.accessible) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(loc("filters.accessible")).typography(TypeScale.body)
                        Text(loc("filters.accessible.hint")).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                    }
                }
                Toggle(isOn: $draft.hideSoldOut) {
                    Text(loc("filters.hide_sold_out")).typography(TypeScale.body)
                }
            }
            .tint(Palette.accent)
        }
    }
}
