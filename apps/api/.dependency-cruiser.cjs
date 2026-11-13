/** Границы модулей модульного монолита (docs/04-architecture.md §4, CLAUDE.md). */
module.exports = {
  forbidden: [
    {
      name: "only-via-module-index",
      comment: "Модуль обращается к другому модулю только через его index.ts",
      severity: "error",
      from: { path: "^src/modules/([^/]+)/" },
      to: {
        path: "^src/modules/([^/]+)/(?!index\\.ts$)",
        pathNot: ["^src/modules/$1/"],
      },
    },
    {
      name: "gigachat-only-in-gateway",
      comment: "GigaChat вызывается только из modules/assistant/gateway.ts",
      severity: "error",
      from: { pathNot: "^src/modules/assistant/gateway\\.ts$" },
      to: { path: "node_modules/(openai|undici)/" },
    },
    {
      name: "channels-and-api-do-not-touch-ingestion",
      severity: "error",
      from: { path: "^src/modules/(channels|publicapi|assistant)/" },
      to: { path: "^src/modules/(ingestion|dedup)/" },
    },
    { name: "no-circular", severity: "warn", from: {}, to: { circular: true } },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
    exclude: { path: "^(test|drizzle)/" },
  },
};
