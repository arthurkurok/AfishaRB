import AfishaAPI
import Foundation
import Observation
import OpenAPIRuntime

/// Сообщение в чате с Гидом.
public struct GuideMessage: Identifiable, Sendable {
    public enum Content: Sendable {
        /// Реплика пользователя (текст или подпись нажатой кнопки).
        case user(String)
        /// Ответ Гида: текст, чипы понимания, уточнение, карточки с причинами, быстрые ответы.
        case guide(AssistantResponse)
        /// Ошибка связи — с возможностью повторить.
        case failure(AfishaError)
    }

    public let id: UUID
    public let content: Content
    public let date: Date

    public init(_ content: Content, id: UUID = UUID(), date: Date = Date()) {
        self.id = id
        self.content = content
        self.date = date
    }
}

/// Чат с Гидом (docs/05-ai-agent.md §6). Факты в ответе — только из БД: клиент показывает
/// карточки `picks[].occurrence` как есть и не дописывает текст сам.
@MainActor
@Observable
public final class GuideModel {
    public private(set) var messages: [GuideMessage] = []
    public private(set) var isThinking = false
    /// Активное уточнение — показывается шторкой с вариантами (iOS: bottom sheet).
    public var activeClarify: Clarify?

    private(set) var conversationID: String?
    private var lastRequest: AssistantRequest?
    private let service: any AfishaService

    public init(service: any AfishaService) {
        self.service = service
    }

    /// Последний ответ Гида — для чипов понимания и баннера режима.
    public var lastResponse: AssistantResponse? {
        for message in messages.reversed() {
            if case let .guide(response) = message.content { return response }
        }
        return nil
    }

    /// Гид работает без ИИ (деградация: правила вместо GigaChat) — показываем баннер.
    public var isRulesMode: Bool { lastResponse?.mode == .rules }

    /// Отправить свободный текст.
    public func send(text: String, context: GuideContext) async {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, !isThinking else { return }
        messages.append(GuideMessage(.user(trimmed)))
        await perform(request(context: context, text: String(trimmed.prefix(1000))))
    }

    /// Нажатие быстрого ответа (уточнение или продолжение).
    public func choose(_ reply: QuickReply, context: GuideContext) async {
        guard !isThinking else { return }
        activeClarify = nil
        messages.append(GuideMessage(.user(reply.label)))
        await perform(request(context: context, patch: reply.patch.additionalProperties))
    }

    /// Убрать условие, которое Гид понял из запроса (тап по чипу понимания → «Убрать»).
    public func remove(_ chip: SlotChip, context: GuideContext) async {
        guard !isThinking, let patch = GuideModel.removalPatch(for: chip, slots: lastResponse?.slots) else { return }
        let loc = Localizer(language: context.language)
        messages.append(GuideMessage(.user(loc("guide.chip.removed", chip.label))))
        await perform(request(context: context, patch: patch))
    }

    /// Изменить период через чип даты: «сегодня», «завтра», «на выходных».
    public func setPeriod(_ preset: WhenPreset, context: GuideContext, now: Date = Date()) async {
        guard !isThinking else { return }
        let range = preset.range(now: now)
        let label = preset.title(context.language)
        messages.append(GuideMessage(.user(label)))
        let patch: [String: (any Sendable)?] = [
            "date_from": range.from.iso, "date_to": range.to.iso, "date_label": label, "date_source": "user",
        ]
        await perform(request(context: context, patch: GuideModel.container(patch)))
    }

    /// Вопрос о конкретном событии из паспорта («Спросить Гида об этом событии»).
    public func ask(about eventID: String, title: String, context: GuideContext) async {
        let loc = Localizer(language: context.language)
        let text = loc("guide.ask_about", title)
        messages.append(GuideMessage(.user(text)))
        var request = request(context: context, text: text)
        request.eventId = eventID
        await perform(request)
    }

    /// Повторить последний запрос после ошибки сети.
    public func retry() async {
        guard let lastRequest, !isThinking else { return }
        if case .failure = messages.last?.content { messages.removeLast() }
        await perform(lastRequest)
    }

    /// Начать разговор заново.
    public func reset() {
        messages = []
        conversationID = nil
        activeClarify = nil
        lastRequest = nil
    }

    // MARK: - Запросы

    private func request(context: GuideContext, text: String? = nil, patch: [String: OpenAPIValueContainer]? = nil) -> AssistantRequest {
        AssistantRequest(
            conversationId: conversationID,
            text: text,
            patch: patch.map { AssistantRequest.PatchPayload(additionalProperties: $0) },
            eventId: nil,
            lang: Components.Schemas.Lang(rawValue: context.language.rawValue),
            municipalityId: context.municipalityID,
            near: context.near?.queryValue
        )
    }

    private func perform(_ request: AssistantRequest) async {
        lastRequest = request
        isThinking = true
        defer { isThinking = false }
        do {
            let response = try await service.ask(request)
            conversationID = response.conversationId
            messages.append(GuideMessage(.guide(response)))
            if response.kind == .clarify, let clarify = response.clarify, !clarify.options.isEmpty {
                activeClarify = clarify
            }
        } catch {
            let afishaError = AfishaError.from(error)
            guard afishaError != .cancelled else { return }
            messages.append(GuideMessage(.failure(afishaError)))
        }
    }

    // MARK: - Патчи слотов

    /// Патч, снимающий условие чипа. Имена слотов — из контракта (`Slots`); логика совпадает с
    /// быстрыми ответами сервера (`apps/api/src/modules/assistant/service.ts`).
    static func removalPatch(for chip: SlotChip, slots: Slots?) -> [String: OpenAPIValueContainer]? {
        let patch: [String: (any Sendable)?]
        switch chip.slot {
        case "date": patch = ["date_from": nil, "date_to": nil, "date_label": nil, "date_source": nil]
        case "time_of_day": patch = ["time_of_day": [String]()]
        case "municipality": patch = ["municipality_id": nil, "municipality_label": nil, "municipality_source": "user"]
        case "near": patch = ["near_me": false]
        case "kids": patch = ["with_kids": false, "kids_ages": [Int]()]
        case "budget": patch = ["budget": nil, "budget_per": nil, "free_only": false]
        case "category":
            // Снимаем одну категорию, если её можно узнать по подписи; иначе все
            let remaining = (slots?.categories ?? []).filter { code in
                !AppLanguage.allCases.contains { code.title($0).lowercased() == chip.label.lowercased() }
            }
            let keep = remaining.count < (slots?.categories.count ?? 0) ? remaining.map(\.rawValue) : [String]()
            patch = ["categories": keep]
        case "pushkin": patch = ["pushkin": false]
        case "accessible": patch = ["accessible": false]
        case "text": patch = ["text": nil]
        default: return nil
        }
        return container(patch)
    }

    static func container(_ values: [String: (any Sendable)?]) -> [String: OpenAPIValueContainer] {
        values.reduce(into: [:]) { result, pair in
            result[pair.key] = (try? OpenAPIValueContainer(unvalidatedValue: pair.value)) ?? (try! OpenAPIValueContainer(unvalidatedValue: nil))
        }
    }
}

/// Контекст запроса к Гиду: язык, город профиля, геопозиция (если разрешена).
public struct GuideContext: Sendable {
    public let language: AppLanguage
    public let municipalityID: String?
    public let near: Coordinate?

    public init(language: AppLanguage, municipalityID: String?, near: Coordinate?) {
        self.language = language
        self.municipalityID = municipalityID
        self.near = near
    }
}

extension SlotChip {
    /// Сплошной контур — сказано пользователем, пунктир — достроено Гидом.
    public var isUserProvided: Bool { source == .user }
}
