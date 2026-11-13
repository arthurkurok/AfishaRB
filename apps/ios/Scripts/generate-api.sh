#!/usr/bin/env bash
# Генерация Swift-клиента API из контракта (docs/08-mobile.md §1, CLAUDE.md инвариант 3).
#
#   packages/contract/openapi.json
#     └─ Scripts/normalize-openapi.mjs  → AfishaKit/Sources/AfishaAPI/openapi.json
#          └─ swift-openapi-generator   → AfishaKit/Sources/AfishaAPI/Generated/{Types,Client}.swift
#
# Генерация «заранее» (ahead-of-time), а не build-плагином: сборка приложения не зависит от
# сборки генератора и не требует «Trust & Enable» плагина в Xcode/CI. Версия генератора
# зафиксирована в Tools/OpenAPIGen/Package.resolved. Сгенерированный код руками не правится.
#
# Режим проверки дрейфа для CI: `Scripts/generate-api.sh --check` (код 1, если файлы устарели).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$ROOT/../.." && pwd)"
API_DIR="$ROOT/AfishaKit/Sources/AfishaAPI"
OUT_DIR="$API_DIR/Generated"
TOOLS="$ROOT/Tools/OpenAPIGen"

node "$ROOT/Scripts/normalize-openapi.mjs" "$REPO/packages/contract/openapi.json" "$API_DIR/openapi.json"

swift build --package-path "$TOOLS" -c release --product swift-openapi-generator >/dev/null
GENERATOR="$(swift build --package-path "$TOOLS" -c release --show-bin-path)/swift-openapi-generator"

TARGET_DIR="$OUT_DIR"
if [[ "${1:-}" == "--check" ]]; then
  TARGET_DIR="$(mktemp -d)"
fi

"$GENERATOR" generate \
  --config "$API_DIR/openapi-generator-config.yaml" \
  --output-directory "$TARGET_DIR" \
  "$API_DIR/openapi.json"

if [[ "${1:-}" == "--check" ]]; then
  if diff -rq "$TARGET_DIR" "$OUT_DIR" >/dev/null; then
    echo "Клиент API актуален"
  else
    echo "Клиент API устарел: запустите Scripts/generate-api.sh" >&2
    exit 1
  fi
else
  echo "Клиент API сгенерирован в $OUT_DIR"
fi
