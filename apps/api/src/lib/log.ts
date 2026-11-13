import pino from "pino";
import { config } from "./config.js";

export const log = pino({
  level: process.env.LOG_LEVEL ?? (config.AFISHA_ENV === "test" ? "warn" : "info"),
  ...(config.AFISHA_ENV === "dev" && process.stdout.isTTY
    ? { transport: { target: "pino-pretty", options: { translateTime: "HH:MM:ss", ignore: "pid,hostname" } } }
    : {}),
});
