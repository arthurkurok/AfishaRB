import AfishaKit
import AfishaUI
import EventKitUI
import MapKit
import SwiftUI

/// Паспорт события (03 §1.5): обложка, статус, ближайший сеанс и все даты, билеты,
/// площадка с картой и маршрутом, описание, блок доверия «Паспорт» с источниками и историей.
struct EventDetailView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @State private var model: EventDetailModel?
    @State private var showAllSessions = false
    @State private var descriptionExpanded = false
    @State private var safariURL: IdentifiedURL?
    @State private var calendarEvent: CalendarDraft?
    @State private var showReport = false
    @State private var showRoute = false
    @State private var storyImage: Image?

    let eventID: String
    let preview: OccurrenceCard?

    private var language: AppLanguage { app.settings.language }

    var body: some View {
        Group {
            if let model {
                content(model)
            } else {
                ProgressView()
            }
        }
        .background(Palette.bg)
        .navigationBarTitleDisplayMode(.inline)
        .task(id: language) {
            let model = self.model ?? EventDetailModel(eventID: eventID, preview: preview, service: app.service, cache: app.store)
            self.model = model
            await model.load(language: language)
            renderStory(model)
        }
        .sheet(item: $safariURL) { item in SafariView(url: item.url).ignoresSafeArea() }
        .sheet(item: $calendarEvent) { draft in
            CalendarEventEditor(event: draft.event, store: app.calendar.store) { _ in calendarEvent = nil }
                .ignoresSafeArea()
        }
        .sheet(isPresented: $showReport) {
            if let model { ReportSheet(model: model, sessionID: model.detail?.nearestSession()?.id) }
        }
    }

    // MARK: Содержимое

    @ViewBuilder private func content(_ model: EventDetailModel) -> some View {
        switch model.state {
        case let .failed(error):
            EmptyStateView(
                mood: error == .notFound ? .notFound : .offline,
                title: error.message(language),
                actionTitle: loc("common.retry"),
                action: { Task { await model.load(language: language) } }
            )
        case let .loaded(detail, cachedAt):
            detailBody(detail, cachedAt: cachedAt)
        case .idle, .loading:
            if let preview = model.preview {
                previewBody(preview)
            } else {
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }

    /// Пока грузится паспорт — карточка из выдачи, чтобы экран не был пустым.
    private func previewBody(_ card: OccurrenceCard) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s4) {
                PosterView(imageURL: card.event.imageURL, placeholderHex: card.event.image?.color, category: CategoryMotifKind(code: card.event.primaryCategory.rawValue))
                    .aspectRatio(16 / 9, contentMode: .fit)
                Text(card.event.title).typography(TypeScale.h1).foregroundStyle(Palette.ink)
                ProgressView().frame(maxWidth: .infinity)
            }
            .padding(Tokens.Space.s4)
        }
    }

    private func detailBody(_ detail: EventDetail, cachedAt: Date?) -> some View {
        let session = detail.nearestSession()
        let category = CategoryMotifKind(code: detail.primaryCategory.rawValue)
        let badge = session?.badge
        return ScrollView {
            VStack(alignment: .leading, spacing: Tokens.Space.s5) {
                if let cachedAt {
                    InfoBanner(.offline, text: loc("offline.cached", EventDateFormatter(language: language).ago(cachedAt)))
                }
                PosterView(
                    imageURL: detail.imageURL, placeholderHex: (detail.image ?? detail.images.first)?.color,
                    category: category, inactive: badge?.isInactive ?? false, cornerRadius: Tokens.Radius.l
                )
                .aspectRatio(16 / 9, contentMode: .fit)
                .frame(maxWidth: .infinity)
                .overlay(alignment: .bottomLeading) {
                    if let author = (detail.image ?? detail.images.first)?.author {
                        Text(loc("event.photo.author", DescriptionText.decodeEntities(author)))
                            .typography(TypeScale.caption)
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .padding(.horizontal, 6)
                            .background(Capsule().fill(.black.opacity(0.45)))
                            .padding(Tokens.Space.s2)
                    }
                }

                titleBlock(detail, badge: badge, session: session)
                if let session { sessionBlock(detail, session: session) }
                ticketsBlock(detail, session: session, badge: badge)
                actionsRow(detail, session: session)
                if let venue = session?.venue { venueBlock(venue) }
                descriptionBlock(detail)
                PassportBlock(provenance: detail.provenance, history: detail.history, qualityScore: detail.qualityScore) { url in
                    safariURL = IdentifiedURL(url: url)
                }
                Button {
                    showReport = true
                } label: {
                    Label(loc("event.report"), systemImage: "exclamationmark.bubble")
                }
                .buttonStyle(.afishaSecondary)
            }
            .padding(Tokens.Space.s4)
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                FavoriteRhombusButton(
                    isFavorite: app.store.isFavorite(detail.id),
                    label: loc(app.store.isFavorite(detail.id) ? "favorites.remove" : "favorites.add")
                ) { app.store.toggleFavorite(detail: detail) }
            }
        }
    }

    // MARK: Блоки

    private func titleBlock(_ detail: EventDetail, badge: StatusBadge?, session: OccurrenceSession?) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(detail.categories, id: \.self) { code in
                    Chip(code.title(language), tint: CategoryMotifKind(code: code.rawValue).color.color)
                }
                Chip(AgeRating(detail.ageRating).label)
                if detail.pushkinCard { PushkinBadge(title: loc("card.pushkin")) }
            }
            Text(detail.title)
                .typography(TypeScale.h1)
                .foregroundStyle(Palette.ink)
                .accessibilityAddTraits(.isHeader)
                .fixedSize(horizontal: false, vertical: true)
            if let badge {
                VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                    StatusBadgeView(badge, language: language)
                    if let reason = session?.statusReason, !reason.isEmpty {
                        Text(reason).typography(TypeScale.body).foregroundStyle(Palette.ink2)
                    }
                    if case .cancelled = badge {
                        Text(loc("event.cancelled.refund")).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                    }
                }
            }
        }
    }

    private func sessionBlock(_ detail: EventDetail, session: OccurrenceSession) -> some View {
        let dates = EventDateFormatter(language: language)
        let upcoming = detail.sortedSessions.filter { $0.isUpcoming() }
        return VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            SessionRow(session: session, detail: detail, language: language, prominent: true)
            if let previous = session.previousStartDate {
                Text(loc("event.rescheduled.from", dates.dayMonth(LocalDate(previous)) + ", " + dates.time(previous)))
                    .typography(TypeScale.caption)
                    .strikethrough()
                    .foregroundStyle(Palette.ink2)
            }
            if upcoming.count > 1 {
                DisclosureGroup(isExpanded: $showAllSessions) {
                    VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                        ForEach(upcoming.filter { $0.id != session.id }, id: \.id) { other in
                            SessionRow(session: other, detail: detail, language: language, prominent: false)
                            Divider()
                        }
                    }
                    .padding(.top, Tokens.Space.s2)
                } label: {
                    Text(loc("card.more_dates", upcoming.count - 1))
                        .typography(TypeScale.body, weight: 600)
                        .foregroundStyle(Palette.accent)
                }
                .tint(Palette.accent)
            }
        }
        .padding(Tokens.Space.s4)
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).fill(Palette.surface))
    }

    private func ticketsBlock(_ detail: EventDetail, session: OccurrenceSession?, badge: StatusBadge?) -> some View {
        let prices = PriceFormatter(language: language)
        let ticketURL = session?.ticketURL ?? detail.ticketURL
        return VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            if let price = prices.full(detail.priceInfo) {
                HStack {
                    Text(loc("event.price")).typography(TypeScale.body).foregroundStyle(Palette.ink2)
                    Spacer()
                    Text(price).typography(TypeScale.title).foregroundStyle(detail.priceInfo.isEffectivelyFree ? Palette.meadow : Palette.ink)
                }
                .accessibilityElement(children: .combine)
            }
            if let ticketURL, !(badge?.isInactive ?? false), badge != .soldOut {
                Button {
                    safariURL = IdentifiedURL(url: ticketURL)
                } label: {
                    Label(detail.priceInfo.isEffectivelyFree ? loc("event.register") : loc("event.tickets"), systemImage: "ticket")
                }
                .buttonStyle(.afishaPrimary)
                if let host = ticketURL.host() {
                    Text(loc("event.tickets.seller", host))
                        .typography(TypeScale.caption)
                        .foregroundStyle(Palette.ink2)
                }
            } else if badge == .soldOut {
                Text(loc("event.sold_out.hint")).typography(TypeScale.body).foregroundStyle(Palette.ink2)
            }
            if detail.pushkinCard {
                Text(loc("event.pushkin.hint")).typography(TypeScale.caption).foregroundStyle(Palette.focus)
            }
        }
    }

    private func actionsRow(_ detail: EventDetail, session: OccurrenceSession?) -> some View {
        let webURL = DeepLink.webURL(eventID: detail.id, language: language)
        return HStack(spacing: Tokens.Space.s2) {
            if let session, session.isUpcoming() {
                actionButton(loc("event.calendar"), icon: "calendar.badge.plus") {
                    let summary = [detail.summary, loc("event.calendar.note")].joined(separator: "\n\n")
                    calendarEvent = CalendarDraft(event: app.calendar.draft(title: detail.title, session: session, summary: summary, webURL: webURL))
                }
            }
            ShareLink(item: webURL, subject: Text(detail.title), message: Text(shareText(detail, session: session))) {
                actionLabel(loc("event.share"), icon: "square.and.arrow.up")
            }
            if let storyImage {
                ShareLink(item: storyImage, preview: SharePreview(detail.title, image: storyImage)) {
                    actionLabel(loc("event.share.story"), icon: "photo")
                }
            }
            actionButton(loc("event.ask_guide"), icon: "bubble.left.and.text.bubble.right") {
                app.router.openGuide(eventID: detail.id, eventTitle: detail.title)
            }
        }
    }

    private func actionButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) { actionLabel(title, icon: icon) }.buttonStyle(.plain)
    }

    private func actionLabel(_ title: String, icon: String) -> some View {
        VStack(spacing: Tokens.Space.s1) {
            Image(systemName: icon).font(.title3)
            Text(title).typography(TypeScale.caption, weight: 600).multilineTextAlignment(.center).lineLimit(2)
        }
        .foregroundStyle(Palette.accent)
        .frame(maxWidth: .infinity, minHeight: 64)
        .padding(.vertical, Tokens.Space.s2)
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).fill(Palette.surface))
        .contentShape(Rectangle())
    }

    private func shareText(_ detail: EventDetail, session: OccurrenceSession?) -> String {
        guard let session, let start = session.startDate else { return detail.title }
        let line = EventDateFormatter(language: language).session(start: start, end: session.endDate, isRange: session.isRange)
        return [detail.title, line, session.venue?.name].compactMap { $0 }.joined(separator: "\n")
    }

    private func venueBlock(_ venue: VenueRef) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            SectionTitle(loc("event.venue"))
            VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                Text(venue.name).typography(TypeScale.title).foregroundStyle(Palette.ink)
                if let address = venue.address {
                    Text(address).typography(TypeScale.body).foregroundStyle(Palette.ink2).textSelection(.enabled)
                }
            }
            .accessibilityElement(children: .combine)
            if let coordinate = venue.coordinate {
                let location = CLLocationCoordinate2D(latitude: coordinate.latitude, longitude: coordinate.longitude)
                Map(initialPosition: .region(MKCoordinateRegion(center: location, latitudinalMeters: 1200, longitudinalMeters: 1200)), interactionModes: []) {
                    Marker(venue.name, coordinate: location).tint(Palette.accent)
                }
                .frame(height: 160)
                .clipShape(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous))
                .accessibilityLabel(loc("event.map", venue.name))
                Button { showRoute = true } label: {
                    Label(loc("event.route"), systemImage: "arrow.triangle.turn.up.right.diamond")
                }
                .buttonStyle(.afishaSecondary)
                .confirmationDialog(loc("event.route"), isPresented: $showRoute, titleVisibility: .visible) {
                    ForEach(MapsRoute.allCases) { provider in
                        Button(loc("route.\(provider.rawValue)")) {
                            if let url = provider.url(to: coordinate, name: venue.name) { UIApplication.shared.open(url) }
                        }
                    }
                }
            }
        }
    }

    @ViewBuilder private func descriptionBlock(_ detail: EventDetail) -> some View {
        let paragraphs = DescriptionText.paragraphs(fromHTML: detail.descriptionHtml)
        let text = paragraphs.isEmpty ? [detail.summary] : paragraphs
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            SectionTitle(loc("event.about"))
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                ForEach(Array(text.enumerated()), id: \.offset) { _, paragraph in
                    Text(paragraph)
                        .typography(TypeScale.body)
                        .foregroundStyle(Palette.ink)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .frame(maxHeight: descriptionExpanded || text.joined().count < 400 ? nil : 180, alignment: .top)
            .clipped()
            if text.joined().count >= 400 {
                Button(descriptionExpanded ? loc("common.collapse") : loc("common.expand")) {
                    descriptionExpanded.toggle()
                }
                .typography(TypeScale.body, weight: 600)
                .foregroundStyle(Palette.accent)
                .frame(minHeight: Tokens.Touch.minIos)
            }
            infoRows(detail)
        }
    }

    private func infoRows(_ detail: EventDetail) -> some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            if !detail.languages.isEmpty {
                infoRow(loc("event.languages"), detail.languages.map { loc.has("language.\($0)") ? loc("language.\($0)") : $0 }.joined(separator: ", "))
            }
            if let organization = detail.organization {
                infoRow(loc("event.organizer"), DescriptionText.decodeEntities(organization))
            }
            if !detail.tags.isEmpty {
                infoRow(loc("event.tags"), detail.tags.map { $0.title(language) }.joined(separator: " · "))
            }
        }
    }

    private func infoRow(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title).typography(TypeScale.caption, weight: 600).foregroundStyle(Palette.ink2)
            Text(value).typography(TypeScale.body).foregroundStyle(Palette.ink)
        }
        .accessibilityElement(children: .combine)
    }

    // MARK: Картинка для сторис

    private func renderStory(_ model: EventDetailModel) {
        guard storyImage == nil, let detail = model.detail, let session = detail.nearestSession() else { return }
        let card = CardPresentation(card: detail.card(for: session), language: language)
        let view = StoryCardView(card: card, language: language, brand: loc("app.name"), link: DeepLink.webURL(eventID: detail.id, language: language).absoluteString)
            .environment(\.colorScheme, .dark)
        let renderer = ImageRenderer(content: view)
        renderer.scale = 1.5
        if let image = renderer.uiImage { storyImage = Image(uiImage: image) }
    }
}

/// Черновик события календаря для `.sheet(item:)`.
struct CalendarDraft: Identifiable {
    let id = UUID()
    let event: EKEvent
}

/// Строка сеанса: ромб с датой, время, площадка, статус.
struct SessionRow: View {
    let session: OccurrenceSession
    let detail: EventDetail
    let language: AppLanguage
    let prominent: Bool

    var body: some View {
        let card = CardPresentation(card: detail.card(for: session), language: language)
        HStack(alignment: .top, spacing: Tokens.Space.s3) {
            DateRhombus(
                day: card.day, month: card.monthShort, caption: prominent ? nil : card.time,
                color: CategoryMotifKind(code: card.categoryCode).color.color,
                dimmed: card.badge?.isInactive ?? false, crossed: card.badge == .cancelled
            )
            .scaleEffect(prominent ? 1 : 0.8)
            VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                Text(card.sessionLine.capitalizedFirst)
                    .typography(prominent ? TypeScale.title : TypeScale.body, weight: 600)
                    .foregroundStyle(Palette.ink)
                if let venue = card.venueLine {
                    Text(venue).typography(TypeScale.caption).foregroundStyle(Palette.ink2)
                }
                if let badge = card.badge { StatusBadgeView(badge, language: language, compact: true) }
            }
            Spacer(minLength: 0)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(card.accessibilityLabel)
    }
}
