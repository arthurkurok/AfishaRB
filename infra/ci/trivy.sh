#!/bin/sh
# Политика сканирования trivy — одна для GitLab CI, GitHub Actions и локального запуска.
# Падение (exit 1) — на HIGH/CRITICAL, для которых уже есть исправление. Осознанные исключения —
# только в infra/ci/trivy-ignore, с обоснованием и сроком пересмотра.
#   infra/ci/trivy.sh fs [каталог]                     — lock-файлы, секреты и конфигурации в репозитории
#   infra/ci/trivy.sh image <образ> [sbom.cdx.json]    — образ; при втором аргументе ещё и SBOM CycloneDX
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
POLICY="--ignore-unfixed --severity HIGH,CRITICAL --exit-code 1 --ignorefile $ROOT/infra/ci/trivy-ignore"
mode="${1:?укажите fs или image}"

case "$mode" in
  fs)
    target="${2:-$ROOT}"
    # shellcheck disable=SC2086
    trivy fs $POLICY --scanners vuln,secret,misconfig \
      --skip-dirs node_modules --skip-dirs '**/node_modules' --skip-dirs data --skip-dirs jury \
      --skip-dirs apps/ios --skip-dirs apps/android --skip-dirs '**/.next' --skip-dirs '**/dist' \
      "$target"
    ;;
  image)
    image="${2:?укажите образ}"
    sbom="${3:-}"
    # shellcheck disable=SC2086
    trivy image $POLICY --scanners vuln,secret "$image"
    if [ -n "$sbom" ]; then
      # SBOM полного состава образа (пакеты ОС + node_modules) — артефакт CI и аттестация cosign
      trivy image --format cyclonedx --output "$sbom" "$image"
      echo "SBOM CycloneDX → $sbom"
    fi
    ;;
  *)
    echo "Неизвестный режим: $mode (fs | image)" >&2
    exit 2
    ;;
esac
