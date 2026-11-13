import { defineConfig } from "vitest/config";

/**
 * Сборка виджета в один ES-модуль dist/afisha.js (без зависимостей, ≤ 35 КБ gzip — проверяет scripts/size-check.mjs).
 * Адреса API и сайта по умолчанию задаются при сборке: AFISHA_API_BASE, AFISHA_SITE_BASE.
 */
export default defineConfig({
  define: {
    __API_BASE__: JSON.stringify(process.env.AFISHA_API_BASE ?? "http://localhost:8000"),
    __SITE_BASE__: JSON.stringify(process.env.AFISHA_SITE_BASE ?? "http://localhost:3000"),
  },
  json: { namedExports: true, stringify: false },
  build: {
    target: "es2020",
    lib: { entry: "src/index.ts", formats: ["es"], fileName: () => "afisha.js" },
    outDir: "dist",
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    reportCompressedSize: true,
  },
  test: { environment: "happy-dom", include: ["test/**/*.test.ts"] },
});
