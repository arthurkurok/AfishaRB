/** Псевдонимизация идентификаторов для журналов (152-ФЗ): HMAC с секретом сервиса, без обратного восстановления. */
import { createHmac } from "node:crypto";
import { config } from "./config.js";

export function pseudonym(value: string, scope = "id"): string {
  return createHmac("sha256", config.AFISHA_SECRET).update(`${scope}:${value}`).digest("base64url").slice(0, 22);
}
