import AfishaKit
import AfishaUI
import SwiftUI
import UIKit

/// Корневой экран: системный таб-бар (iOS 26 — Liquid Glass) и стеки навигации вкладок.
struct RootView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        @Bindable var router = app.router
        let loc = app.settings.localizer

        TabView(selection: $router.tab) {
            tab(.home, title: loc("tab.home"), icon: "sparkles") {
                if app.settings.simpleMode { SimpleHomeView() } else { HomeView() }
            }
            tab(.search, title: loc("tab.search"), icon: "magnifyingglass") { SearchView() }
            tab(.guide, title: loc("tab.guide"), icon: "bubble.left.and.text.bubble.right") { GuideView() }
            tab(.favorites, title: loc("tab.favorites"), icon: "star") { FavoritesView() }
            tab(.settings, title: loc("tab.settings"), icon: "gearshape") { SettingsView() }
        }
        .tint(Palette.accent)
        .environment(\.loc, loc)
        .environment(\.locale, app.settings.language.locale)
        // Крупный текст и режим «Просто» поднимают размер шрифта независимо от системы
        .dynamicTypeSize(app.settings.largeText || app.settings.simpleMode ? .xxxLarge ... .accessibility5 : .xSmall ... .accessibility5)
        // Смена языка перестраивает дерево — все строки берутся из каталога заново
        .id(app.settings.language)
        .task(id: app.settings.language) {
            await app.reference.load(language: app.settings.language)
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .background { app.store.pruneCache() }
        }
        .sheet(isPresented: Binding(get: { !app.settings.onboardingDone }, set: { if !$0 { app.settings.onboardingDone = true } })) {
            OnboardingView()
                .environment(\.loc, loc)
                .interactiveDismissDisabled()
        }
    }

    private func tab(_ tab: AppTab, title: String, icon: String, @ViewBuilder content: () -> some View) -> some View {
        NavigationStack(path: Binding(get: { app.router.path(tab) }, set: { app.router.setPath($0, for: tab) })) {
            content()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case let .event(id, preview):
                        EventDetailView(eventID: id, preview: preview)
                    case .recommendationRules:
                        RecommendationRulesView()
                    case .about:
                        AboutView()
                    }
                }
        }
        .tabItem { Label(title, systemImage: icon) }
        .tag(tab)
    }
}

/// Внешний вид системных панелей: фирменные шрифты в заголовках навигации.
enum Appearance {
    @MainActor
    static func apply() {
        let title = AfishaFonts.font(TypeScale.title) as UIFont
        let large = AfishaFonts.font(TypeScale.h1) as UIFont
        let navigation = UINavigationBar.appearance()
        navigation.titleTextAttributes = [.font: UIFontMetrics(forTextStyle: .headline).scaledFont(for: title)]
        navigation.largeTitleTextAttributes = [.font: UIFontMetrics(forTextStyle: .largeTitle).scaledFont(for: large)]
    }
}
