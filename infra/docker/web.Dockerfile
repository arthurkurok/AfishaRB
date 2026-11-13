# Образ сайта и Mini App (apps/web) + раздача виджета /widget/v1/afisha.js.
#   docker build -f infra/docker/web.Dockerfile -t afisha-web .
# next.config.ts БЕЗ output: "standalone" (не редактируем чужой конфиг):
# сборка — `pnpm --filter @afisha/web build`, запуск — `next start` из обычного билда.
# Виджет собирается здесь же и копируется в public скриптом prepare-assets (apps/web/scripts/prepare-assets.mjs).
# Базовый образ закреплён по digest индекса (manifest list, amd64 и arm64); обновления приносит Renovate.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

# ---------- сборка: зависимости → виджет → сайт ----------
FROM ${NODE_IMAGE} AS build
ENV CI=1 PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
# Сначала только манифесты: слой с зависимостями пересобирается лишь при изменении lock-файла
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/contract/package.json packages/contract/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/i18n/package.json packages/i18n/
COPY apps/web/package.json apps/web/
COPY apps/widget/package.json apps/widget/
RUN --mount=type=cache,id=afisha-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@afisha/web..." --filter @afisha/widget
COPY packages packages
COPY apps/web apps/web
COPY apps/widget apps/widget
# NEXT_PUBLIC_* вшиваются в клиентский бандл при сборке (build args → ARG ниже в compose)
ARG NEXT_PUBLIC_API_BASE=http://localhost:8000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE} NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} NEXT_TELEMETRY_DISABLED=1
# Виджет → public/widget/v1/afisha.js (prepare-assets), затем Next-сборка сайта
RUN pnpm --filter @afisha/widget build \
 && pnpm --filter @afisha/web build
# Самодостаточный каталог с зависимостями (без devDependencies и симлинков на воркспейс)
RUN --mount=type=cache,id=afisha-pnpm-store,target=/pnpm/store \
    pnpm --filter @afisha/web deploy --prod /out \
 && node -e "const p=require('/out/package.json');const d=Object.keys(p.devDependencies||{}).filter(n=>require('fs').existsSync('/out/node_modules/'+n));if(d.length){console.error('devDependencies в prod:',d);process.exit(1)}"

# ---------- рантайм ----------
FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="afisha-web" \
      org.opencontainers.image.description="Афиша РБ: сайт, Telegram Mini App и раздача виджета" \
      org.opencontainers.image.revision="${GIT_SHA}"
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
 && groupadd --system --gid 10001 afisha \
 && useradd --system --uid 10001 --gid afisha --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin afisha
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    PORT=3000
WORKDIR /app
# Код и зависимости принадлежат root и доступны процессу только на чтение
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/web/.next ./.next
COPY --from=build /repo/apps/web/public ./public
COPY --from=build /repo/apps/web/next.config.ts ./next.config.ts
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# next start без standalone: бинарник Next запускается напрямую (pnpm в рантайм-образе нет)
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
