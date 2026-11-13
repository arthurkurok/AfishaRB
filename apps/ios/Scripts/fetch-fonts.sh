#!/usr/bin/env bash
# Скачивает шрифты Golos Text и Commissioner (лицензия SIL OFL 1.1) из репозитория google/fonts
# и проверяет, что в них есть все башкирские буквы (docs/07-design.md §5).
# Шрифты кладутся в ресурсы AfishaUI: их используют приложение, виджет и снапшот-тесты.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/AfishaKit/Sources/AfishaUI/Resources/Fonts"
BASE="https://raw.githubusercontent.com/google/fonts/main/ofl"
mkdir -p "$DEST"

fetch() {
  local url="$1" out="$2"
  if [[ -s "$out" && "${FORCE:-0}" != "1" ]]; then
    echo "уже есть: $(basename "$out")"
    return
  fi
  echo "скачиваю: $(basename "$out")"
  curl -fsSL --retry 3 -o "$out.tmp" "$url"
  mv "$out.tmp" "$out"
}

fetch "$BASE/golostext/GolosText%5Bwght%5D.ttf" "$DEST/GolosText-Variable.ttf"
fetch "$BASE/golostext/OFL.txt" "$DEST/GolosText-OFL.txt"
fetch "$BASE/commissioner/Commissioner%5BFLAR%2CVOLM%2Cslnt%2Cwght%5D.ttf" "$DEST/Commissioner-Variable.ttf"
fetch "$BASE/commissioner/OFL.txt" "$DEST/Commissioner-OFL.txt"

swift "$ROOT/Scripts/check-fonts.swift" "$DEST/GolosText-Variable.ttf" "$DEST/Commissioner-Variable.ttf"
