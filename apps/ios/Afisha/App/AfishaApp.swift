import AfishaKit
import AfishaStore
import AfishaUI
import SwiftUI

/// Точка входа «Тамаши» — афиши культуры Башкортостана.
@main
struct AfishaApp: App {
    @State private var environment: AppEnvironment

    init() {
        AfishaFonts.register()
        Appearance.apply()
        let environment = AppEnvironment.live()
        _environment = State(initialValue: environment)
        // Siri и Shortcuts открывают экраны через тот же роутер, что и диплинки
        IntentBridge.open = { link in environment.router.handle(link) }
        AfishaShortcuts.updateAppShortcutParameters()
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(environment)
                .modelContainer(environment.store.container)
                .onOpenURL { url in
                    if let link = DeepLink(url: url) { environment.router.handle(link) }
                }
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL, let link = DeepLink(url: url) { environment.router.handle(link) }
                }
        }
    }
}
