#!/bin/sh
# Разворачивание демо-данных «Афиша РБ» (data/seed/demo.dump.gz) — дамп каталога Культура.РФ по РБ.
# Запускается one-shot сервисом `seed` в docker-compose.yml ПОСЛЕ применения миграций.
# Идемпотентно: если в таблице event уже есть события, ничего не делает.
#
# Подключение: PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE (по умолчанию — сервис db из compose).
# Дамп: pg_dump --data-only -Fc (схему создают миграции drizzle, данные — этот скрипт).
set -eu

: "${PGHOST:=db}"
: "${PGPORT:=5432}"
: "${PGUSER:=afisha}"
: "${PGPASSWORD:=afisha}"
: "${PGDATABASE:=afisha}"
DUMP="${SEED_DUMP:-/seed/demo.dump.gz}"

log() { echo "[seed] $*"; }

export PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

# 1. Ждать БД (compose уже дождался healthcheck, но скрипт используют и вручную — make seed)
i=0
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -q; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then log "ошибка: БД $PGHOST:$PGPORT недоступна"; exit 1; fi
  sleep 1
done

# 2. Ждать таблицу event: признак того, что миграции drizzle применились
i=0
until [ "$(psql -tAqc "select to_regclass('public.event') is not null")" = "t" ]; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then log "ошибка: таблица event не появилась — сперва примените миграции"; exit 1; fi
  sleep 1
done

# 3. Идемпотентность: сид нужен только пустой базе
COUNT=$(psql -tAqc "select count(*) from event")
if [ "$COUNT" != "0" ]; then
  log "в event уже $COUNT событий — сид пропущен (идемпотентность)"
  exit 0
fi

log "база пуста, восстанавливаю демо-данные из $DUMP ($(du -m "$DUMP" | cut -f1) МБ)…"
T0=$(date +%s)
gunzip -c "$DUMP" > /tmp/demo.dump
pg_restore --data-only --exit-on-error --no-owner -d "$PGDATABASE" /tmp/demo.dump
rm -f /tmp/demo.dump

EVENTS=$(psql -tAqc "select count(*) from event")
OCCS=$(psql -tAqc "select count(*) from occurrence")
VENUES=$(psql -tAqc "select count(*) from venue")
log "готово за $(( $(date +%s) - T0 )) с: событий $EVENTS, сеансов $OCCS, площадок $VENUES"
