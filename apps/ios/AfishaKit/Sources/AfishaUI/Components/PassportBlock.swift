import AfishaKit
import SwiftUI

/// Блок доверия «Паспорт события» (03 §1.5, п. 7; 07 §7): источники в виде «печатей»,
/// «проверено N мин назад», уровень доверия и вертикальная лента истории с ромбами-узлами.
public struct PassportBlock: View {
    let provenance: Provenance
    let history: [ChangeEntry]
    let qualityScore: Double?
    let openURL: (URL) -> Void
    let now: Date
    @Environment(\.loc) private var loc

    public init(provenance: Provenance, history: [ChangeEntry], qualityScore: Double?, now: Date = Date(), openURL: @escaping (URL) -> Void) {
        self.provenance = provenance
        self.history = history
        self.qualityScore = qualityScore
        self.now = now
        self.openURL = openURL
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s4) {
            SectionTitle(loc("passport.title"))
            Text(loc("passport.lead"))
                .typography(TypeScale.caption)
                .foregroundStyle(Palette.ink2)

            // Печати источников
            VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                ForEach(provenance.sources, id: \.id) { source in
                    sourceStamp(source)
                }
            }

            VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                if let verified = APIDate.parse(provenance.lastVerifiedAt) {
                    Label(EventDateFormatter(language: loc.language).verifiedAgo(verified, now: now), systemImage: "checkmark.seal")
                        .typography(TypeScale.caption, weight: 600)
                        .foregroundStyle(freshnessColor)
                }
                Text(provenance.trustLevel.title(loc.language))
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
            }
            if provenance.freshness == .stale || provenance.freshness == .vanished {
                InfoBanner(.warning, text: loc("passport.freshness.\(provenance.freshness.rawValue)"))
            }

            if !history.isEmpty {
                Text(loc("passport.history"))
                    .typography(TypeScale.title)
                    .foregroundStyle(Palette.ink)
                    .accessibilityAddTraits(.isHeader)
                VStack(alignment: .leading, spacing: 0) {
                    ForEach(Array(history.enumerated()), id: \.offset) { index, entry in
                        historyRow(entry, isLast: index == history.count - 1)
                    }
                }
            }
        }
        .padding(Tokens.Space.s4)
        .background(RoundedRectangle(cornerRadius: Tokens.Radius.m, style: .continuous).fill(Palette.surface2))
    }

    private var freshnessColor: Color {
        switch provenance.freshness {
        case .fresh: Palette.meadow
        case .aging: Palette.ink2
        case .stale, .vanished: Tokens.Palette.Status.unverified.color
        }
    }

    private func sourceStamp(_ source: ProvenanceSource) -> some View {
        let content = HStack(spacing: Tokens.Space.s3) {
            ZStack {
                Rhombus(cornerRadius: 0.1).stroke(Palette.accent, lineWidth: 1.5)
                Rhombus(cornerRadius: 0.1).stroke(Palette.accent.opacity(0.5), style: StrokeStyle(lineWidth: 1, dash: [2, 2])).padding(5)
                Image(systemName: "checkmark").font(.system(size: 11, weight: .bold)).foregroundStyle(Palette.accent)
            }
            .frame(width: 34, height: 34)
            .accessibilityHidden(true)
            Text(source.title)
                .typography(TypeScale.body, weight: 600)
                .foregroundStyle(Palette.ink)
                .multilineTextAlignment(.leading)
            Spacer(minLength: 0)
            if source.url != nil {
                Image(systemName: "arrow.up.right.square").foregroundStyle(Palette.accent).accessibilityHidden(true)
            }
        }
        .frame(minHeight: Tokens.Touch.minIos)
        .contentShape(Rectangle())

        return Group {
            if let url = source.url.flatMap(URL.init(string:)) {
                Button { openURL(url) } label: { content }
                    .buttonStyle(.plain)
                    .accessibilityLabel(loc("passport.source", source.title))
                    .accessibilityHint(loc("passport.source.hint"))
            } else {
                content
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel(loc("passport.source", source.title))
            }
        }
    }

    private func historyRow(_ entry: ChangeEntry, isLast: Bool) -> some View {
        HStack(alignment: .top, spacing: Tokens.Space.s3) {
            VStack(spacing: 0) {
                Rhombus(cornerRadius: 0.1)
                    .fill(entry.kind == "created" ? Palette.meadow : Palette.accent)
                    .frame(width: 12, height: 12)
                    .padding(.top, 4)
                if !isLast {
                    Rectangle().fill(Palette.line).frame(width: 2).frame(maxHeight: .infinity)
                }
            }
            .frame(width: 12)
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.text)
                    .typography(TypeScale.body)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
                if let date = APIDate.parse(entry.at) {
                    let formatter = EventDateFormatter(language: loc.language)
                    Text("\(formatter.dayMonthYear(LocalDate(date), now: now)), \(formatter.time(date))")
                        .typography(TypeScale.caption)
                        .foregroundStyle(Palette.ink2)
                }
            }
            .padding(.bottom, Tokens.Space.s3)
        }
        .accessibilityElement(children: .combine)
    }
}
