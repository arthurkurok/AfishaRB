import AfishaKit
import AfishaStore
import AfishaUI
import SwiftData
import SwiftUI

/// Избранное (08 §4): работает без сети — карточки и паспорта сохранены в SwiftData.
/// Предстоящие сверху, прошедшие — отдельной секцией.
struct FavoritesView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @Query(sort: [SortDescriptor(\FavoriteEvent.startsAt), SortDescriptor(\FavoriteEvent.addedAt)])
    private var favorites: [FavoriteEvent]

    private var language: AppLanguage { app.settings.language }

    var body: some View {
        let now = Date()
        let upcoming = favorites.filter { ($0.startsAt ?? .distantFuture) > now.addingTimeInterval(-3 * 3600) }
        let past = favorites.filter { ($0.startsAt ?? .distantFuture) <= now.addingTimeInterval(-3 * 3600) }

        Group {
            if favorites.isEmpty {
                ScrollView {
                    EmptyStateView(
                        mood: .hello,
                        title: loc("favorites.empty"),
                        message: loc("favorites.empty.hint"),
                        actionTitle: loc("favorites.empty.action"),
                        action: { app.router.tab = .home }
                    )
                    .padding(.top, Tokens.Space.s6)
                }
            } else {
                List {
                    Section {
                        Label(loc("favorites.offline"), systemImage: "arrow.down.circle")
                            .typography(TypeScale.caption)
                            .foregroundStyle(Palette.ink2)
                            .listRowBackground(Color.clear)
                    }
                    if !upcoming.isEmpty {
                        Section(loc("favorites.upcoming")) { rows(upcoming) }
                    }
                    if !past.isEmpty {
                        Section(loc("favorites.past")) { rows(past) }
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
            }
        }
        .background(Palette.bg)
        .navigationTitle(loc("tab.favorites"))
    }

    private func rows(_ items: [FavoriteEvent]) -> some View {
        ForEach(items) { favorite in
            Button {
                app.router.openEvent(id: favorite.eventID, preview: app.store.favoriteCard(favorite))
            } label: {
                if let card = app.store.favoriteCard(favorite) {
                    EventCardView(CardPresentation(card: card, language: language), style: .row, language: language)
                } else {
                    VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                        Text(favorite.title).typography(TypeScale.title).foregroundStyle(Palette.ink)
                        if let venue = favorite.venueName {
                            Text(venue).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                        }
                    }
                    .padding(Tokens.Space.s3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: Tokens.Radius.m).fill(Palette.surface))
                }
            }
            .buttonStyle(CardButtonStyle())
            .listRowSeparator(.hidden)
            .listRowBackground(Color.clear)
            .listRowInsets(EdgeInsets(top: Tokens.Space.s2, leading: Tokens.Space.s4, bottom: Tokens.Space.s2, trailing: Tokens.Space.s4))
            .swipeActions {
                Button(role: .destructive) {
                    app.store.removeFavorite(eventID: favorite.eventID)
                } label: {
                    Label(loc("favorites.remove"), systemImage: "trash")
                }
            }
            .accessibilityAction(named: loc("favorites.remove")) {
                app.store.removeFavorite(eventID: favorite.eventID)
            }
        }
    }
}
