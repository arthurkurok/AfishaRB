# Образ бэкенда: один образ — три процесса (api, bot, worker). Node 24 LTS.
#   docker build -f infra/docker/api.Dockerfile -t afisha-api .
#   api:    node dist/api.js (по умолчанию)   bot: node dist/bot.js   worker: node dist/worker.js
#   миграции: node dist/cli.js db:migrate
# Базовый образ закреплён по digest индекса (manifest list, amd64 и arm64); обновления приносит Renovate.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

# ---------- сборка: зависимости → esbuild-бандл → prod-node_modules ----------
FROM ${NODE_IMAGE} AS build
ENV CI=1 PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
# Сначала только манифесты: слой с зависимостями пересобирается лишь при изменении lock-файла
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/contract/package.json packages/contract/
RUN --mount=type=cache,id=afisha-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@afisha/api..."
COPY packages/contract packages/contract
COPY apps/api apps/api
RUN pnpm --filter @afisha/api build
# Самодостаточный каталог с prod-зависимостями (без devDependencies и без симлинков на воркспейс)
RUN --mount=type=cache,id=afisha-pnpm-store,target=/pnpm/store \
    pnpm --filter @afisha/api deploy --prod /out \
 && node -e "const p=require('/out/package.json');const d=Object.keys(p.devDependencies||{}).filter(n=>require('fs').existsSync('/out/node_modules/'+n));if(d.length){console.error('devDependencies в prod:',d);process.exit(1)}"

# ---------- рантайм ----------
FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="afisha-api" \
      org.opencontainers.image.description="Афиша культуры РБ: API, Telegram-бот и воркер" \
      org.opencontainers.image.revision="${GIT_SHA}"
# Менеджеры пакетов в рантайме не нужны: убираем npm, corepack и yarn (меньше поверхность атаки и находок
# сканера). Процессы работают от непривилегированного пользователя с числовым UID (runAsNonRoot в Kubernetes).
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
 && groupadd --system --gid 10001 afisha \
 && useradd --system --uid 10001 --gid afisha --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin afisha \
 && mkdir -p /data \
 && chown afisha:afisha /data
# Корневой сертификат НУЦ Минцифры (Russian Trusted Root CA) — для TLS к GigaChat API Сбера.
# Файл кладётся в infra/certs/ перед сборкой (infra/certs/README.md, docs/13-owner-tasks.md). Если его нет,
# сборка не падает (в каталоге всегда есть README.md), Node просто не добавит сертификат — работает только cloud.ru.
COPY infra/certs/ /usr/local/share/ca-certificates/afisha/
ENV NODE_ENV=production \
    AFISHA_ENV=prod \
    AFISHA_DATA_DIR=/data \
    NODE_OPTIONS=--enable-source-maps \
    NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/afisha/russian_trusted_root_ca.pem
WORKDIR /app
# Код и зависимости принадлежат root и доступны процессу только на чтение
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY --from=build /repo/apps/api/drizzle ./drizzle
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.AFISHA_PORT||8000)+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/api.js"]
