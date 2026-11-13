import { AssistantRequest, AssistantResponse } from "@afisha/contract";
import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../db/client.js";
import { getGateway } from "./gateway.js";
import { handleAssistant } from "./service.js";

export function registerAssistantApi(app: FastifyInstance, db: Db): void {
  const r = app.withTypeProvider<ZodTypeProvider>();
  r.post(
    "/v1/assistant",
    {
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "askAssistant",
        tags: ["Гид"],
        summary: "ИИ-гид: свободный запрос → уточнение → подборка реальных событий с объяснениями",
        description:
          "Карточки строятся только из базы по ID; объяснения GigaChat проходят верификатор фактов. Без GigaChat работает режим правил (mode=rules).",
        body: AssistantRequest,
        response: { 200: AssistantResponse },
      },
    },
    async (req) => handleAssistant(db, req.body, { channel: String(req.headers["x-afisha-channel"] ?? "web") }),
  );
  r.get(
    "/v1/assistant/status",
    {
      schema: {
        operationId: "assistantStatus",
        tags: ["Гид"],
        summary: "Доступность ИИ (для баннера деградации)",
        response: {
          200: z.object({ providers: z.array(z.string()), available: z.boolean(), spentTokens: z.number() }),
        },
      },
    },
    async () => getGateway().status(),
  );
}
