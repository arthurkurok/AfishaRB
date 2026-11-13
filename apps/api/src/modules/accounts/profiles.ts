/**
 * Профиль запроса без регистрации (docs/08-mobile.md §6): анонимное устройство (X-Device-Id) или пользователь
 * Telegram Mini App (X-Telegram-Init-Data с проверкой подписи). Вход по стороннему ID не используется (ст. 8 149-ФЗ).
 */
import { sql } from "drizzle-orm";
import type { Db } from "../../db/client.js";
import { config } from "../../lib/config.js";
import { verifyTelegramInitData } from "./telegram-init-data.js";

const DEVICE_ID = /^[0-9a-fA-F-]{16,64}$/;

export async function resolveProfile(
  db: Db,
  headers: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  const initData = headers["x-telegram-init-data"];
  let channel: string | null = null;
  let external: string | null = null;
  if (typeof initData === "string" && config.AFISHA_TELEGRAM_BOT_TOKEN) {
    const user = verifyTelegramInitData(initData, config.AFISHA_TELEGRAM_BOT_TOKEN);
    if (user) {
      channel = "telegram";
      external = String(user.id);
    }
  }
  const device = headers["x-device-id"];
  if (!channel && typeof device === "string" && DEVICE_ID.test(device)) {
    channel = "device";
    external = device.toLowerCase();
  }
  if (!channel || !external) return null;
  const r = await db.execute<{ id: string }>(sql`
    INSERT INTO profile (channel, external_id, last_seen_at) VALUES (${channel}, ${external}, now())
    ON CONFLICT (channel, external_id) DO UPDATE SET last_seen_at = now() RETURNING id`);
  return r.rows[0]?.id ?? null;
}
