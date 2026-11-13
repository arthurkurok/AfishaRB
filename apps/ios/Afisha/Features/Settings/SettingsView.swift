import AfishaKit
import AfishaUI
import SwiftUI

/// Настройки: язык ru/ba внутри приложения, город, режим «Просто», крупный текст,
/// «Как работают рекомендации», о проекте.
struct SettingsView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @State private var showCityPicker = false

    var body: some View {
        @Bindable var settings = app.settings
        Form {
            Section {
                Picker(selection: $settings.language) {
                    ForEach(AppLanguage.allCases) { language in
                        Text(language.endonym).tag(language)
                    }
                } label: {
                    Label(loc("settings.language"), systemImage: "globe")
                }
                .pickerStyle(.inline)
                .onChange(of: settings.language) { _, _ in WidgetRefresher.reload() }
            } header: {
                Text(loc("settings.language"))
            } footer: {
                if settings.language == .ba { Text(loc("settings.language.ba_note")) }
            }

            Section(loc("settings.city")) {
                Button { showCityPicker = true } label: {
                    HStack {
                        Label(app.cityName, systemImage: "mappin.and.ellipse").foregroundStyle(Palette.ink)
                        Spacer()
                        Image(systemName: "chevron.right").foregroundStyle(Palette.ink2)
                    }
                    .frame(minHeight: Tokens.Touch.minIos)
                }
                .accessibilityLabel(loc("city.current", app.cityName))
            }

            Section {
                Toggle(isOn: $settings.simpleMode) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(loc("settings.simple"))
                        Text(loc("settings.simple.hint")).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                    }
                }
                Toggle(isOn: $settings.largeText) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(loc("settings.large_text"))
                        Text(loc("settings.large_text.hint")).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                    }
                }
            } header: {
                Text(loc("settings.accessibility"))
            }
            .tint(Palette.accent)

            Section(loc("settings.about")) {
                NavigationLink(value: Route.recommendationRules) {
                    Label(loc("settings.recommendations"), systemImage: "list.bullet.rectangle")
                }
                NavigationLink(value: Route.about) {
                    Label(loc("settings.about_project"), systemImage: "info.circle")
                }
            }

            Section {
                LabeledContent(loc("settings.api"), value: AppConstants.apiBaseURL().absoluteString)
                    .typography(TypeScale.caption)
                LabeledContent(loc("settings.version"), value: Bundle.main.versionString)
                    .typography(TypeScale.caption)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Palette.bg)
        .navigationTitle(loc("tab.settings"))
        .sheet(isPresented: $showCityPicker) {
            CityPickerView { municipality in
                app.selectCity(municipality)
                showCityPicker = false
            }
        }
    }
}

extension Bundle {
    var versionString: String {
        let version = object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "—"
        let build = object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "—"
        return "\(version) (\(build))"
    }
}

/// «Как работают рекомендации» — правила применения рекомендательных технологий
/// (ст. 10.2-2 149-ФЗ): методы, виды сведений, источники, контакты. Полный текст — на сайте.
struct RecommendationRulesView: View {
    @Environment(\.loc) private var loc
    @State private var safariURL: IdentifiedURL?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s4) {
                ForEach(1...5, id: \.self) { index in
                    VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                        Text(loc("rules.\(index).title")).typography(TypeScale.title).foregroundStyle(Palette.ink)
                            .accessibilityAddTraits(.isHeader)
                        Text(loc("rules.\(index).text")).typography(TypeScale.body).foregroundStyle(Palette.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                Button(loc("rules.full")) { safariURL = IdentifiedURL(url: AppConstants.recommendationRulesURL) }
                    .buttonStyle(.afishaSecondary)
            }
            .padding(Tokens.Space.s4)
        }
        .background(Palette.bg)
        .navigationTitle(loc("settings.recommendations"))
        .sheet(item: $safariURL) { SafariView(url: $0.url).ignoresSafeArea() }
    }
}

/// О проекте: источники данных, достоверность, пометка о башкирском переводе.
struct AboutView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s4) {
                HStack(spacing: Tokens.Space.s3) {
                    BeeMascot(mood: .hello, size: 72)
                    VStack(alignment: .leading) {
                        Text(loc("app.name")).typography(TypeScale.h1).foregroundStyle(Palette.ink)
                        Text(loc("app.tagline")).typography(TypeScale.body).foregroundStyle(Palette.ink2)
                    }
                }
                Text(loc("about.text")).typography(TypeScale.body).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let stats = app.home.stats {
                    Text(loc("home.stats", stats.upcomingOccurrences, stats.venues, stats.municipalitiesWithEvents))
                        .typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                }
                Text(loc("about.sources")).typography(TypeScale.body).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Divider()
                Text(loc("about.translation")).typography(TypeScale.body).foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let mail = URL(string: "mailto:\(AppConstants.translationFeedbackEmail)") {
                    Link(loc("about.translation.suggest"), destination: mail)
                        .buttonStyle(.afishaSecondary)
                }
                Text(loc("about.fonts")).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
            }
            .padding(Tokens.Space.s4)
        }
        .background(Palette.bg)
        .navigationTitle(loc("settings.about_project"))
    }
}
