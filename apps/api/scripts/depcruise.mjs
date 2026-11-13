// Проверка границ модулей. dependency-cruiser поддерживает только LTS-ветки Node (чётные);
// на нечётной ветке запускаем через Node 24, если он установлен.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const major = Number(process.versions.node.split(".")[0]);
const lts = ["/opt/homebrew/opt/node@24/bin/node", "/usr/local/opt/node@24/bin/node"].find(existsSync);
const nodeBin = major % 2 === 1 && lts ? lts : process.execPath;
const args = [
  "node_modules/dependency-cruiser/bin/dependency-cruiser.mjs",
  "src",
  "--config",
  ".dependency-cruiser.cjs",
  "--output-type",
  "err",
];
const r = spawnSync(nodeBin, args, { stdio: "inherit" });
process.exit(r.status ?? 1);
