import { config } from "../lib/config.js";
import { log } from "../lib/log.js";
import { buildApp } from "./app.js";

const app = await buildApp({ logger: false });
await app.listen({ port: config.AFISHA_PORT, host: "0.0.0.0" });
log.info(`API: ${config.AFISHA_API_BASE_URL} · документация: ${config.AFISHA_API_BASE_URL}/docs`);
