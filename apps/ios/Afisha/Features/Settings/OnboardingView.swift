import AfishaKit
import AfishaUI
import SwiftUI

/// Онбординг: язык и город (07 §12: переключатель языка — в онбординге). Пропускается одной кнопкой.
struct OnboardingView: View {
    @Environment(AppEnvironment.self) private var app
    @State private var showCityPicker = false

    var body: some View {
        @Bindable var settings = app.settings
        let loc = settings.localizer
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s5) {
                HStack {
                    Spacer()
                    BeeMascot(mood: .hello, size: 120)
                    Spacer()
                }
                Text(loc("onboarding.title"))
                    .typography(TypeScale.h1)
                    .foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                Text(loc("onboarding.text"))
                    .typography(TypeScale.body)
                    .foregroundStyle(Palette.ink2)

                VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                    Text(loc("settings.language")).typography(TypeScale.title).foregroundStyle(Palette.ink)
                    HStack(spacing: Tokens.Space.s2) {
                        ForEach(AppLanguage.allCases) { language in
                            Button { settings.language = language } label: {
                                Text(language.endonym)
                                    .typography(TypeScale.body, weight: 600)
                                    .frame(maxWidth: .infinity, minHeight: Tokens.Touch.minIos)
                                    .foregroundStyle(settings.language == language ? Palette.onAccent : Palette.ink)
                                    .background(RoundedRectangle(cornerRadius: Tokens.Radius.m).fill(settings.language == language ? Palette.accent : Palette.surface))
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(settings.language == language ? .isSelected : [])
                        }
                    }
                }

                VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                    Text(loc("settings.city")).typography(TypeScale.title).foregroundStyle(Palette.ink)
                    Button { showCityPicker = true } label: {
                        HStack {
                            Image(systemName: "mappin.and.ellipse")
                            Text(app.cityName).typography(TypeScale.body, weight: 600)
                            Spacer()
                            Image(systemName: "chevron.right")
                        }
                        .foregroundStyle(Palette.ink)
                        .padding(Tokens.Space.s3)
                        .frame(minHeight: Tokens.Touch.minIos)
                        .background(RoundedRectangle(cornerRadius: Tokens.Radius.m).fill(Palette.surface))
                    }
                    .buttonStyle(.plain)
                }

                Button(loc("onboarding.start")) { settings.onboardingDone = true }
                    .buttonStyle(.afishaPrimary)
            }
            .padding(Tokens.Space.s5)
        }
        .background(Palette.bg)
        .environment(\.loc, loc)
        .sheet(isPresented: $showCityPicker) {
            CityPickerView { municipality in
                app.selectCity(municipality)
                showCityPicker = false
            }
            .environment(\.loc, loc)
        }
        .task { await app.reference.load(language: settings.language) }
    }
}
