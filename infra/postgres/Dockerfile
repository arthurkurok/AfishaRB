# PostgreSQL 18 + PostGIS 3 + pgvector (мультиарх: amd64 и arm64).
# Базовый образ закреплён по digest индекса (manifest list); обновления digest приносит Renovate.
FROM postgres:18-bookworm@sha256:5c4783a8cc3f0074912164f94dfa1be4e043438f0f707cf968d7af9a0d31a2c8

RUN apt-get update \
 && apt-get install -y --no-install-recommends postgresql-18-postgis-3 postgresql-18-pgvector \
 && rm -rf /var/lib/apt/lists/*

# gosu в официальном образе собран старым Go (1.24.6): trivy находит в его stdlib 26 исправленных
# уязвимостей HIGH/CRITICAL (MJ-24). Заменяем бинарник на sh-обёртку над setpriv из util-linux —
# этот способ сбросить привилегии рекомендует сам автор gosu. docker-entrypoint.sh вызывает
# `gosu postgres "$BASH_SOURCE" "$@"`, интерфейс `gosu user[:group] command [args…]` сохраняется.
# Go-бинарников в образе после этого нет.
COPY --chmod=0755 <<'EOF' /usr/local/bin/gosu
#!/bin/sh
set -eu
if [ "$#" -lt 2 ]; then
  echo "usage: gosu user-spec command [args]" >&2
  exit 1
fi
spec="$1"
shift
user="${spec%%:*}"
entry="$(getent passwd "$user")" || { echo "gosu: unknown user '$user'" >&2; exit 1; }
uid="$(echo "$entry" | cut -d: -f3)"
gid="$(echo "$entry" | cut -d: -f4)"
HOME="$(echo "$entry" | cut -d: -f6)"
export HOME
groups="--init-groups"
case "$spec" in
  *:*)
    group="${spec#*:}"
    gentry="$(getent group "$group")" || { echo "gosu: unknown group '$group'" >&2; exit 1; }
    gid="$(echo "$gentry" | cut -d: -f3)"
    groups="--clear-groups"
    ;;
esac
exec setpriv --reuid="$uid" --regid="$gid" "$groups" "$@"
EOF
RUN gosu postgres id && gosu nobody true
