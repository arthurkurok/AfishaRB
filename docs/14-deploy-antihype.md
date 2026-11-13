# Развёртывание на antihype.best

Прод-контур: VPS (Ubuntu, `ssh gvps`, 201.58.190.98), стек в `~/stacks/afisha`,
фронтенд — Caddy (80/443, TLS от Let's Encrypt, уже обслуживает другие проекты домена).

## Состав контура

| Домен                  | Куда                                   | Что                          |
| :--------------------- | :------------------------------------- | :--------------------------- |
| `antihype.best`        | `127.0.0.1:3200` (compose: web)        | Сайт + Mini App + виджет     |
| `api.antihype.best`    | `127.0.0.1:8100` (compose: api)        | REST API, /docs (OpenAPI)    |
| `admin.antihype.best`  | `127.0.0.1:3201` (compose: admin)      | Админ-панель (вход по токену)|

Сервисы: `db` (PostgreSQL 18, PostGIS+pgvector, том `pgdata`), `valkey`, `api`,
`worker` (pg-boss: синхронизация источников, жизненный цикл событий, дайджесты),
`web`, `admin`; one-shot `migrate` (миграции drizzle) и `seed` (демо-каталог
Культура.РФ: 8541 событие, 26374 сеанса, 1944 площадки — идемпотентно, непустую
базу не трогает).

Конфигурация: `~/stacks/afisha/.env` (секреты сгенерированы на сервере, в git их
нет; токен админа — `AFISHA_ADMIN_TOKEN` в этом файле). При `AFISHA_ENV=prod`
API не стартует с небезопасными значениями — проверка в `apps/api/src/lib/config.ts`.

## Как разворачивалось (первый запуск)

Образы собираются локально на macOS (arm64) под платформу сервера — на VPS всего
4 ГБ RAM, Next-сборки там падают по OOM:

```bash
docker buildx build --platform linux/amd64 -f infra/docker/api.Dockerfile  -t afisha-api      --load .
docker buildx build --platform linux/amd64 -f infra/docker/web.Dockerfile  -t afisha-web \
  --build-arg NEXT_PUBLIC_API_BASE=https://api.antihype.best \
  --build-arg NEXT_PUBLIC_SITE_URL=https://antihype.best --load .
docker buildx build --platform linux/amd64 -f infra/docker/admin.Dockerfile -t afisha-admin \
  --build-arg NEXT_PUBLIC_SITE_URL=https://antihype.best --load .
docker buildx build --platform linux/amd64 -t afisha-postgres:18 --load ./infra/postgres
# перенос (без registry):
docker save afisha-api afisha-web afisha-admin afisha-postgres:18 | gzip | ssh gvps 'gunzip | docker load'
```

Файлы стека и данные:

```bash
rsync docker-compose.prod.yml docker-compose.server.yml gvps:~/stacks/afisha/
rsync infra/docker/seed.sh gvps:~/stacks/afisha/infra/docker/
rsync data/seed/demo.dump.gz gvps:~/stacks/afisha/data/seed/
# .env создать на сервере по .env.example (prod требует AFISHA_ADMIN_TOKEN/AFISHA_SECRET/
# ADMIN_SESSION_SECRET ≥32 симв., PG_PASSWORD, AFISHA_CORS_ORIGINS без «*»)
```

Запуск на сервере:

```bash
cd ~/stacks/afisha
docker compose -f docker-compose.prod.yml -f docker-compose.server.yml up -d
# порядок обеспечен зависимостями: db → migrate → seed → api/worker; web/admin после api
```

`docker-compose.server.yml` — оверлей для этой машины: порты только на 127.0.0.1
(8100/3200/3201, наружу их отдаёт Caddy) и one-shot `seed`. Telegram-бот —
опциональный профиль: `--profile bot` при заданном `AFISHA_TELEGRAM_BOT_TOKEN`.

## Обновление версии

1. Локально: сборка изменившихся образов (как выше), `docker save | ssh … load`.
2. `rsync` обновлённых compose/данных.
3. `docker compose -f docker-compose.prod.yml -f docker-compose.server.yml up -d`
   (миграции применит one-shot `migrate`, БД и тома сохраняются).

## DNS (действие владельца домена)

Регистратор: Global Domain Group, DNS — `ns1/ns2.regexdomain.com`. Сейчас есть
только A-запись корня. Для полного контура добавить в панели регистратора:

```
api.antihype.best.    A  201.58.190.98
admin.antihype.best.  A  201.58.190.98   (или wildcard *.antihype.best)
```

Пока записей нет: сайт работает целиком (SSR ходит в API внутри compose-сети),
но недоступны снаружи публичный REST API, ссылки RSS/iCal, встраиваемый виджет
(браузер пользователя ходит на `api.antihype.best`) и админ-панель по HTTPS
(админка доступна до того через SSH-туннель: `ssh -L 3201:127.0.0.1:3201 gvps`).
Сертификаты для поддоменов Caddy выпустит сам после появления записей.

## Наблюдение

- `docker compose -f docker-compose.prod.yml -f docker-compose.server.yml ps`
- Логи: `docker compose … logs api -f`; доступы Caddy: `/var/log/caddy/afisha-*-access.log`
- Healthcheck: `curl http://127.0.0.1:8100/health` (на сервере)
