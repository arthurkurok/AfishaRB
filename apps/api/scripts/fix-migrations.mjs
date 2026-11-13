// drizzle-kit берёт в кавычки имена пользовательских типов ("geography(Point,4326)") — убираем кавычки.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";

const dir = new URL("../drizzle/", import.meta.url);
for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
  const p = new URL(f, dir);
  const src = readFileSync(p, "utf8");
  const out = src.replaceAll('"geography(Point,4326)"', "geography(Point,4326)").replaceAll('"tsvector"', "tsvector");
  if (out !== src) {
    writeFileSync(p, out);
    console.log(`fixed ${f}`);
  }
}
