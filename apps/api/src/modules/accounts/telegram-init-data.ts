/**
 * Проверка подписи initData Telegram Mini App (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).
 * secret = HMAC_SHA256(key = "WebAppData", data = bot_token); hash = HMAC_SHA256(secret, data_check_string).
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export type TelegramUser = { id: number; first_name?: string; language_code?: string };

export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  maxAgeSec = 24 * 3600,
  now = Date.now(),
): TelegramUser | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expected = createHmac("sha256", secret).update(dataCheck).digest();
  const given = Buffer.from(hash, "hex");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || now / 1000 - authDate > maxAgeSec) return null;
  try {
    return JSON.parse(params.get("user") ?? "null") as TelegramUser | null;
  } catch {
    return null;
  }
}
