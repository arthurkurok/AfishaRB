/**
 * Прод-сборка бэкенда: esbuild → dist/{api,bot,worker,cli}.js (ESM, Node 24 LTS) + source maps.
 *
 * - npm-зависимости остаются внешними: в образ они попадают через `pnpm deploy --prod`;
 *   workspace-пакеты `@afisha/*` (исходники .ts) инлайнятся в бандл.
 * - Каждый внешний импорт обязан быть объявлен в `dependencies` пакета: иначе в прод-образе
 *   (без devDependencies) процесс упадёт при старте — такая ошибка ловится здесь, на сборке.
 * - `import.meta.url|dirname|filename` в исходниках переписываются на «виртуальный» путь исходного
 *   файла относительно бандла. Поэтому `resolve(import.meta.dirname, "../../drizzle")` и `REPO_ROOT`
 *   дают те же каталоги, что и при запуске через tsx: dist/ лежит рядом с src/ и drizzle/.
 *
 * Запуск: `pnpm --filter @afisha/api build`.
 */
import { readFile, rm } from "node:fs/promises";
import { builtinModules, createRequire } from "node:module";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const pkgDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outdir = resolve(pkgDir, "dist");
const pkg = JSON.parse(await readFile(resolve(pkgDir, "package.json"), "utf8"));

// esbuild не объявлен отдельной зависимостью: берём ту версию, с которой работает tsx (devDependency).
const requireFromHere = createRequire(import.meta.url);
const esbuild = createRequire(requireFromHere.resolve("tsx/package.json"))("esbuild");

const entryPoints = Object.fromEntries(
  ["api", "bot", "worker", "cli"].map((name) => [name, resolve(pkgDir, `src/main/${name}.ts`)]),
);

const prodDeps = new Set(Object.keys(pkg.dependencies ?? {}));
const builtins = new Set(builtinModules);
/** Имя пакета из спецификатора: `drizzle-orm/pg-core` → `drizzle-orm`, `@fastify/cors` → `@fastify/cors`. */
const packageName = (spec) =>
  spec
    .split("/")
    .slice(0, spec.startsWith("@") ? 2 : 1)
    .join("/");

const externals = new Map(); // пакет → первый импортирующий файл

/** Голые спецификаторы (кроме `@afisha/*`) — внешние; workspace-пакеты собираются в бандл. */
const externalizeNpm = {
  name: "externalize-npm",
  setup(build) {
    build.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.path.startsWith("@afisha/")) return undefined;
      if (args.path.startsWith("node:") || builtins.has(args.path)) return { path: args.path, external: true };
      const name = packageName(args.path);
      if (!externals.has(name)) externals.set(name, relative(pkgDir, args.importer));
      return { path: args.path, external: true };
    });
  },
};

const LOADERS = { ".ts": "ts", ".mts": "ts", ".cts": "ts", ".tsx": "tsx", ".js": "js", ".mjs": "js", ".cjs": "js" };
const toPosix = (p) => p.split(sep).join("/");

/** Сохраняет семантику import.meta.* исходного файла (см. шапку). */
const sourceImportMeta = {
  name: "source-import-meta",
  setup(build) {
    build.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, async (args) => {
      if (args.path.includes(`${sep}node_modules${sep}`)) return undefined;
      const code = await readFile(args.path, "utf8");
      if (!/\bimport\.meta\.(url|dirname|filename)\b/.test(code)) return undefined;
      const virtualUrl = `new URL(${JSON.stringify(toPosix(relative(outdir, args.path)))}, import.meta.url)`;
      const replacements = {
        url: `${virtualUrl}.href`,
        filename: `__afishaFileURLToPath(${virtualUrl})`,
        dirname: `__afishaDirname(__afishaFileURLToPath(${virtualUrl}))`,
      };
      const header =
        'import { fileURLToPath as __afishaFileURLToPath } from "node:url";\n' +
        'import { dirname as __afishaDirname } from "node:path";\n';
      const contents = header + code.replace(/\bimport\.meta\.(url|dirname|filename)\b/g, (_, k) => replacements[k]);
      return { contents, loader: LOADERS[extname(args.path)] ?? "ts", resolveDir: dirname(args.path) };
    });
  },
};

await rm(outdir, { recursive: true, force: true });
const result = await esbuild.build({
  absWorkingDir: pkgDir,
  entryPoints,
  outdir,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: "linked",
  sourcesContent: false,
  keepNames: true,
  legalComments: "none",
  metafile: true,
  logLevel: "warning",
  // Внешние CJS-зависимости и вызовы require в коде бандла работают через настоящий require
  banner: {
    js: 'import { createRequire as __afishaCreateRequire } from "node:module";\nconst require = __afishaCreateRequire(import.meta.url);',
  },
  plugins: [externalizeNpm, sourceImportMeta],
});

const undeclared = [...externals].filter(([name]) => !prodDeps.has(name));
if (undeclared.length > 0) {
  for (const [name, from] of undeclared) {
    console.error(`✗ ${name} (импорт из ${from}) не объявлен в dependencies @afisha/api — в прод-образе его не будет`);
  }
  process.exit(1);
}

for (const [file, out] of Object.entries(result.metafile.outputs)) {
  if (file.endsWith(".js")) console.log(`${toPosix(relative(pkgDir, file))}\t${(out.bytes / 1024).toFixed(0)} КБ`);
}
console.log(`Внешние зависимости (${externals.size}): ${[...externals.keys()].sort().join(", ")}`);
