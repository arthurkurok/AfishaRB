#!/bin/sh
# Ставит инструменты цепочки поставок (trivy, cosign) закреплённых версий с проверкой SHA-256.
# Одинаково для GitLab CI и GitHub Actions; сторонние CI-экшены для них не используются намеренно:
# версия и контрольная сумма бинарника фиксируются здесь, обновления приносит Renovate (renovate.json).
#   infra/ci/install-tools.sh [trivy] [cosign]      # без аргументов — оба
# Каталог установки: $AFISHA_TOOLS_DIR (по умолчанию $HOME/.local/bin; его нужно добавить в PATH).
set -eu

# renovate: datasource=github-releases depName=aquasecurity/trivy
TRIVY_VERSION=0.76.1
TRIVY_SHA256_AMD64=c7cbe3137fb8a48a17574bede3dd6beb16742d1e9772929940fc90082c39d9c0
TRIVY_SHA256_ARM64=e174dff2a6dba5e3ae41f8d0537a6324405bd08132497340304c6b20e0f16a1f
# renovate: datasource=github-releases depName=sigstore/cosign
COSIGN_VERSION=3.1.4
COSIGN_SHA256_AMD64=424e2c97d0b45fd7a6b608a87f090f35633f4c23ece5f092d48bba11aaf4bbfa
COSIGN_SHA256_ARM64=ade83b7aac62e131cacfe96d958948b2150cc9efec46a570a2649b8e27dedad2

DIR="${AFISHA_TOOLS_DIR:-$HOME/.local/bin}"
mkdir -p "$DIR"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

case "$(uname -m)" in
  x86_64 | amd64) ARCH=amd64 ;;
  aarch64 | arm64) ARCH=arm64 ;;
  *) echo "Неподдерживаемая архитектура: $(uname -m)" >&2; exit 1 ;;
esac

download() { # url файл
  if command -v curl >/dev/null 2>&1; then curl -fsSL --retry 3 -o "$2" "$1"; else wget -q -O "$2" "$1"; fi
}
verify() { # файл ожидаемая-сумма
  echo "$2  $1" | sha256sum -c - >/dev/null || { echo "Контрольная сумма не совпала: $1" >&2; exit 1; }
}

install_trivy() {
  if [ "$ARCH" = amd64 ]; then asset="Linux-64bit"; sum="$TRIVY_SHA256_AMD64"; else asset="Linux-ARM64"; sum="$TRIVY_SHA256_ARM64"; fi
  file="$TMP/trivy.tar.gz"
  download "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_${asset}.tar.gz" "$file"
  verify "$file" "$sum"
  tar -xzf "$file" -C "$TMP" trivy
  install -m 0755 "$TMP/trivy" "$DIR/trivy"
  "$DIR/trivy" --version | head -1
}

install_cosign() {
  if [ "$ARCH" = amd64 ]; then sum="$COSIGN_SHA256_AMD64"; else sum="$COSIGN_SHA256_ARM64"; fi
  file="$TMP/cosign"
  download "https://github.com/sigstore/cosign/releases/download/v${COSIGN_VERSION}/cosign-linux-${ARCH}" "$file"
  verify "$file" "$sum"
  install -m 0755 "$file" "$DIR/cosign"
  "$DIR/cosign" version 2>/dev/null | grep -i '^GitVersion' || true
}

[ "$#" -gt 0 ] || set -- trivy cosign
for tool in "$@"; do
  case "$tool" in
    trivy) install_trivy ;;
    cosign) install_cosign ;;
    *) echo "Неизвестный инструмент: $tool" >&2; exit 1 ;;
  esac
done
