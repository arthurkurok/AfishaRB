package ru.tamasha.afisha.core.data

import kotlinx.serialization.json.JsonElement
import ru.tamasha.afisha.core.model.AssistantQuery
import ru.tamasha.afisha.core.model.AssistantReply
import ru.tamasha.afisha.core.network.AfishaApi
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Гид. Факты в ответе — только из БД через сервер (верификатор фактов на бэкенде),
 * клиент лишь передаёт текст/нажатие кнопки и контекст: язык и город из профиля.
 */
/** Шлюз к Гиду — интерфейс, чтобы ViewModel проверялась без сети. */
public interface AssistantGateway {
    public suspend fun ask(
        conversationId: String?,
        text: String? = null,
        patch: Map<String, JsonElement?>? = null,
        eventId: String? = null,
        near: String? = null,
    ): AssistantReply
}

@Singleton
public class AssistantRepository @Inject constructor(
    private val api: AfishaApi,
    private val settings: SettingsRepository,
) : AssistantGateway {
    override suspend fun ask(
        conversationId: String?,
        text: String?,
        patch: Map<String, JsonElement?>?,
        eventId: String?,
        near: String?,
    ): AssistantReply {
        val s = settings.current()
        return api.assistant(
            AssistantQuery(
                conversationId = conversationId,
                text = text,
                patch = patch,
                eventId = eventId,
                language = s.language,
                municipalityId = s.municipalityId.takeIf { s.assistantUsesCity },
                near = near,
            ),
        )
    }
}
