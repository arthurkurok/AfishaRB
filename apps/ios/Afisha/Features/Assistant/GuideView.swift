import AfishaKit
import AfishaUI
import SwiftUI

/// Гид (05 §6, iOS): чат с чипами понимания (тап — изменить), уточнением в шторке,
/// карточками с чипами причин и строкой объяснения, быстрыми ответами и баннером режима без ИИ.
struct GuideView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @State private var input = ""
    @FocusState private var inputFocused: Bool

    private var model: GuideModel { app.guide }
    private var language: AppLanguage { app.settings.language }

    var body: some View {
        @Bindable var model = app.guide
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: Tokens.Space.s4) {
                    if model.isRulesMode { rulesBanner }
                    if model.messages.isEmpty { welcome }
                    ForEach(model.messages) { message in
                        messageView(message).id(message.id)
                    }
                    if model.isThinking { thinking.id("thinking") }
                    Color.clear.frame(height: 1).id("bottom")
                }
                .padding(Tokens.Space.s4)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: model.messages.count) { _, _ in
                withAnimation { proxy.scrollTo("bottom", anchor: .bottom) }
            }
            .onChange(of: model.isThinking) { _, thinking in
                if thinking { withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
        }
        .background(Palette.bg)
        .navigationTitle(loc("tab.guide"))
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if !model.messages.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(loc("guide.new")) { model.reset() }
                }
            }
        }
        .safeAreaInset(edge: .bottom) { inputBar }
        .sheet(item: $model.activeClarify) { clarify in
            ClarifySheet(clarify: clarify) { option in
                Task { await model.choose(option, context: app.guideContext) }
            }
            .presentationDetents([.medium])
            .presentationDragIndicator(.visible)
        }
        .task { consumePending() }
        .onChange(of: app.router.pendingGuideQuestion) { _, _ in consumePending() }
    }

    private func consumePending() {
        guard let pending = app.router.pendingGuideQuestion else { return }
        app.router.pendingGuideQuestion = nil
        Task {
            if let eventID = pending.eventID {
                await model.ask(about: eventID, title: pending.eventTitle ?? "", context: app.guideContext)
            } else if let text = pending.text {
                await model.send(text: text, context: app.guideContext)
            }
        }
    }

    private func send() {
        let text = input
        input = ""
        Task { await model.send(text: text, context: app.guideContext) }
    }

    // MARK: Элементы

    private var rulesBanner: some View {
        InfoBanner(.info, text: loc("guide.rules_mode"))
    }

    private var welcome: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s4) {
            HStack(alignment: .top, spacing: Tokens.Space.s3) {
                BeeMascot(mood: .hello, size: 64)
                VStack(alignment: .leading, spacing: Tokens.Space.s1) {
                    Text(loc("guide.welcome.title")).typography(TypeScale.h2).foregroundStyle(Palette.ink)
                    Text(loc("guide.welcome.text")).typography(TypeScale.body).foregroundStyle(Palette.ink2)
                }
            }
            .accessibilityElement(children: .combine)
            Text(loc("guide.examples")).typography(TypeScale.caption, weight: 600).foregroundStyle(Palette.ink2)
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(1...4, id: \.self) { index in
                    let example = loc("guide.example.\(index)")
                    Button {
                        Task { await model.send(text: example, context: app.guideContext) }
                    } label: {
                        Chip(example, systemImage: "sparkle")
                    }
                    .buttonStyle(.plain)
                    .frame(minHeight: Tokens.Touch.minIos)
                }
            }
        }
    }

    private var thinking: some View {
        HStack(spacing: Tokens.Space.s3) {
            BeeMascot(mood: .thinking, size: 44)
            Text(loc("guide.thinking")).typography(TypeScale.body).foregroundStyle(Palette.ink2)
        }
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(.updatesFrequently)
    }

    @ViewBuilder private func messageView(_ message: GuideMessage) -> some View {
        switch message.content {
        case let .user(text):
            HStack {
                Spacer(minLength: 48)
                Text(text)
                    .typography(TypeScale.body)
                    .foregroundStyle(Palette.onAccent)
                    .padding(.horizontal, Tokens.Space.s3)
                    .padding(.vertical, Tokens.Space.s2)
                    .background(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).fill(Palette.accent))
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(loc("guide.you.said", text))
        case let .guide(response):
            GuideResponseView(response: response, isLatest: message.id == model.messages.last?.id)
        case let .failure(error):
            HStack(alignment: .top, spacing: Tokens.Space.s3) {
                BeeMascot(mood: .offline, size: 44)
                VStack(alignment: .leading, spacing: Tokens.Space.s2) {
                    Text(error.message(language)).typography(TypeScale.body).foregroundStyle(Palette.ink)
                    Button(loc("common.retry")) { Task { await model.retry() } }
                        .buttonStyle(.afishaSecondary)
                        .frame(maxWidth: 220)
                }
            }
        }
    }

    private var inputBar: some View {
        HStack(alignment: .bottom, spacing: Tokens.Space.s2) {
            TextField(loc("guide.input"), text: $input, axis: .vertical)
                .typography(TypeScale.body)
                .lineLimit(1...4)
                .focused($inputFocused)
                .submitLabel(.send)
                .onSubmit(send)
                .padding(.horizontal, Tokens.Space.s3)
                .padding(.vertical, Tokens.Space.s2)
                .frame(minHeight: Tokens.Touch.minIos)
                .background(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).fill(Palette.surface))
                .overlay(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).strokeBorder(Palette.line, lineWidth: 1))
            Button(action: send) {
                Image(systemName: "arrow.up")
                    .font(.headline)
                    .foregroundStyle(Palette.onAccent)
                    .frame(width: Tokens.Touch.minIos, height: Tokens.Touch.minIos)
                    .background(Circle().fill(Palette.accent))
            }
            .disabled(input.trimmingCharacters(in: .whitespaces).isEmpty || model.isThinking)
            .opacity(input.trimmingCharacters(in: .whitespaces).isEmpty ? 0.5 : 1)
            .accessibilityLabel(loc("guide.send"))
        }
        .padding(.horizontal, Tokens.Space.s4)
        .padding(.vertical, Tokens.Space.s2)
        .background(.bar)
    }
}

/// Ответ Гида: текст, чипы понимания, уточнение, карточки с причинами, быстрые ответы.
struct GuideResponseView: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    let response: AssistantResponse
    let isLatest: Bool

    private var language: AppLanguage { app.settings.language }

    private var mood: BeeMood {
        switch response.kind {
        case .results: .found
        case .clarify: .asking
        case .empty: .notFound
        case .error: .offline
        default: .hello
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s3) {
            HStack(alignment: .top, spacing: Tokens.Space.s3) {
                BeeMascot(mood: mood, size: 44)
                Text(response.text)
                    .typography(TypeScale.body)
                    .foregroundStyle(Palette.ink)
                    .padding(.horizontal, Tokens.Space.s3)
                    .padding(.vertical, Tokens.Space.s2)
                    .background(RoundedRectangle(cornerRadius: Tokens.Radius.l, style: .continuous).fill(Palette.surface))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
            .accessibilityLabel(loc("guide.said", response.text))

            if !response.chips.isEmpty, response.kind != .help, response.kind != .offtopic {
                understandingChips
            }
            if let clarify = response.clarify, isLatest {
                FlowLayout(spacing: Tokens.Space.s2) {
                    ForEach(clarify.options, id: \.id) { option in
                        Button {
                            Task { await app.guide.choose(option, context: app.guideContext) }
                        } label: {
                            Chip(option.label, selected: false, tint: Palette.accent)
                        }
                        .buttonStyle(.plain)
                        .frame(minHeight: Tokens.Touch.minIos)
                    }
                }
            }
            if !response.relaxed.isEmpty {
                Text(loc("guide.relaxed", response.relaxed.joined(separator: ", ")))
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
            }
            ForEach(response.picks, id: \.occurrence.id) { pick in
                PickCard(pick: pick)
            }
            if !response.followups.isEmpty, isLatest {
                FlowLayout(spacing: Tokens.Space.s2) {
                    ForEach(response.followups, id: \.id) { reply in
                        Button {
                            Task { await app.guide.choose(reply, context: app.guideContext) }
                        } label: {
                            Chip(reply.label, outline: .dashed, tint: Palette.accent)
                        }
                        .buttonStyle(.plain)
                        .frame(minHeight: Tokens.Touch.minIos)
                    }
                }
            }
        }
    }

    /// Чипы понимания: сплошной контур — сказано пользователем, пунктир — достроено (07 §7).
    private var understandingChips: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s1) {
            Text(loc("guide.understood")).typography(TypeScale.caption, weight: 600).foregroundStyle(Palette.ink2)
            FlowLayout(spacing: Tokens.Space.s2) {
                ForEach(response.chips, id: \.self) { chip in
                    Menu {
                        if chip.slot == "date" {
                            ForEach([WhenPreset.today, .tomorrow, .weekend]) { preset in
                                Button(preset.title(language)) {
                                    Task { await app.guide.setPeriod(preset, context: app.guideContext) }
                                }
                            }
                        }
                        Button(loc("guide.chip.remove"), role: .destructive) {
                            Task { await app.guide.remove(chip, context: app.guideContext) }
                        }
                    } label: {
                        Chip(chip.label, outline: chip.isUserProvided ? .solid : .dashed)
                    }
                    .disabled(!isLatest)
                    .accessibilityLabel(loc(chip.isUserProvided ? "guide.chip.user" : "guide.chip.inferred", chip.label))
                    .accessibilityHint(loc("guide.chip.hint"))
                }
            }
        }
    }
}

/// Карточка подборки Гида: карточка события + чипы причин + строка объяснения.
struct PickCard: View {
    @Environment(AppEnvironment.self) private var app
    let pick: AssistantPick

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s2) {
            EventCardLink(card: pick.occurrence, style: .row)
            FlowLayout(spacing: Tokens.Space.s1 + 2) {
                ForEach(pick.reasonCodes, id: \.self) { code in
                    Chip(code.title(app.settings.language), systemImage: "checkmark", tint: Palette.meadow)
                }
            }
            if !pick.reasonText.isEmpty {
                Text(pick.reasonText)
                    .typography(TypeScale.caption)
                    .foregroundStyle(Palette.ink2)
                    .italic()
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.leading, Tokens.Space.s2)
        .overlay(alignment: .leading) {
            Rectangle().fill(Palette.honey).frame(width: 3)
        }
    }
}

/// Уточнение Гида в шторке (iOS: bottom sheet с вариантами, 05 §6).
struct ClarifySheet: View {
    @Environment(\.dismiss) private var dismiss
    let clarify: Clarify
    let onChoose: (QuickReply) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: Tokens.Space.s4) {
            HStack(alignment: .top, spacing: Tokens.Space.s3) {
                BeeMascot(mood: .asking, size: 56)
                Text(clarify.question)
                    .typography(TypeScale.title)
                    .foregroundStyle(Palette.ink)
                    .fixedSize(horizontal: false, vertical: true)
            }
            ScrollView {
                VStack(spacing: Tokens.Space.s2) {
                    ForEach(clarify.options, id: \.id) { option in
                        Button(option.label) {
                            dismiss()
                            onChoose(option)
                        }
                        .buttonStyle(.afishaSecondary)
                    }
                }
            }
        }
        .padding(Tokens.Space.s4)
        .background(Palette.bg)
    }
}

extension Clarify: @retroactive Identifiable {
    public var id: String { slot + question }
}
