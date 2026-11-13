import AfishaKit
import AfishaUI
import SwiftUI

/// Режим «Просто» (08 §4): крупные элементы и три главные кнопки — для старшего поколения.
/// «Позвонить в кассу» заменено на «Спросить Гида»: телефонов касс в API пока нет.
struct SimpleHomeView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @State private var locating = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s4) {
                Text(loc("simple.greeting", app.cityName))
                    .typography(TypeScale.h1)
                    .foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)

                bigButton(title: loc("simple.today"), subtitle: loc("simple.today.hint"), icon: "calendar", tint: Palette.accent) {
                    app.router.openSearch(SearchFilters(when: .today, municipalities: [app.settings.municipalityID]))
                }
                bigButton(title: loc("simple.near"), subtitle: loc("simple.near.hint"), icon: "location.fill", tint: Palette.meadow) {
                    Task { await openNearby() }
                }
                bigButton(title: loc("simple.guide"), subtitle: loc("simple.guide.hint"), icon: "bubble.left.fill", tint: Palette.focus) {
                    app.router.openGuide()
                }
                if app.location.isDenied {
                    InfoBanner(.info, text: loc("location.denied"))
                }
                Button(loc("simple.exit")) { app.settings.simpleMode = false }
                    .buttonStyle(.afishaSecondary)
                    .padding(.top, Tokens.Space.s4)
            }
            .padding(Tokens.Space.s4)
        }
        .background(Palette.bg)
        .navigationTitle(loc("app.name"))
    }

    private func openNearby() async {
        locating = true
        defer { locating = false }
        var filters = SearchFilters(when: .today)
        if let coordinate = await app.location.requestLocation() {
            app.settings.lastLocation = coordinate
            filters.nearRadiusKm = 10
        } else {
            filters.municipalities = [app.settings.municipalityID]
        }
        app.router.openSearch(filters)
    }

    private func bigButton(title: String, subtitle: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: Tokens.Space.s4) {
                ZStack {
                    Rhombus(cornerRadius: 0.12).fill(tint)
                    Image(systemName: icon).font(.title2.bold()).foregroundStyle(Palette.onAccent)
                }
                .frame(width: 64, height: 64)
                .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                    Text(title).typography(TypeScale.h2).foregroundStyle(Palette.ink)
                    Text(subtitle).typography(TypeScale.body).foregroundStyle(Palette.ink2)
                }
                Spacer(minLength: 0)
                if locating && icon == "location.fill" { ProgressView() }
            }
            .padding(Tokens.Space.s4)
            .frame(maxWidth: .infinity, minHeight: 96, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).fill(Palette.surface))
            .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).strokeBorder(tint, lineWidth: 2))
        }
        .buttonStyle(CardButtonStyle())
        .accessibilityElement(children: .combine)
    }
}
