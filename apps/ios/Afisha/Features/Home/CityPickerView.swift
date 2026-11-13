import AfishaKit
import AfishaUI
import SwiftUI

/// Выбор города или района: поиск по ru и ba названиям (Өфө = Уфа), «Определить по геопозиции».
struct CityPickerView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var locating = false
    let onSelect: (Municipality) -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        Task { await detectCity() }
                    } label: {
                        HStack {
                            Label(loc("city.detect"), systemImage: "location.fill")
                            Spacer()
                            if locating { ProgressView() }
                        }
                        .frame(minHeight: Tokens.Touch.minIos)
                    }
                    .disabled(locating)
                    if app.location.isDenied {
                        Text(loc("location.denied"))
                            .typography(TypeScale.caption)
                            .foregroundStyle(Palette.ink2)
                    }
                }
                Section(loc("city.list")) {
                    if app.reference.municipalities.isEmpty {
                        ProgressView().frame(maxWidth: .infinity)
                    }
                    ForEach(app.reference.searchMunicipalities(query), id: \.id) { municipality in
                        Button {
                            onSelect(municipality)
                        } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(municipality.name)
                                        .typography(TypeScale.body, weight: municipality.id == app.settings.municipalityID ? 600 : 400)
                                        .foregroundStyle(Palette.ink)
                                    if let upcoming = municipality.upcoming {
                                        Text(loc("count.events", upcoming))
                                            .typography(TypeScale.caption)
                                            .foregroundStyle(Palette.ink2)
                                    }
                                }
                                Spacer()
                                if municipality.id == app.settings.municipalityID {
                                    Image(systemName: "checkmark").foregroundStyle(Palette.accent)
                                }
                            }
                            .frame(minHeight: Tokens.Touch.minIos)
                            .contentShape(Rectangle())
                        }
                        .accessibilityAddTraits(municipality.id == app.settings.municipalityID ? .isSelected : [])
                    }
                }
            }
            .searchable(text: $query, prompt: loc("city.search"))
            .navigationTitle(loc("city.choose"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(loc("common.close")) { dismiss() }
                }
            }
            .task { await app.reference.load(language: app.settings.language) }
        }
    }

    private func detectCity() async {
        locating = true
        defer { locating = false }
        guard let coordinate = await app.location.requestLocation() else { return }
        app.settings.lastLocation = coordinate
        if let nearest = app.reference.nearestMunicipality(to: coordinate) { onSelect(nearest) }
    }
}
