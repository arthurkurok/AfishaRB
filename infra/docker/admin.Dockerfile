# Образ рабочего места сотрудников (apps/admin, порт 3001).
#   docker build -f infra/docker/admin.Dockerfile -t afisha-admin .
# next.config.ts БЕЗ output: "standalone" (не редактируем чужой конфиг):
# сборка — `pnpm --filter @afisha/admin build`, запуск — `next start` из обычного билда.
# ADMIN_API_BASE и ADMIN_SESSION_SECRET читаются на сервере во время работы (runtime ENV в compose).
# Базовый образ закреплён по digest индекса (manifest list, amd64 и arm64); обновления приносит Renovate.
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c

# ---------- сборка: зависимости → админка ----------
FROM ${NODE_IMAGE} AS build
ENV CI=1 PNPM_HOME=/pnpm COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
# Сначала только манифесты: слой с зависимостями пересобирается лишь при изменении lock-файла
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/contract/package.json packages/contract/
COPY packages/design-tokens/package.json packages/design-tokens/
COPY packages/i18n/package.json packages/i18n/
COPY apps/admin/package.json apps/admin/
RUN --mount=type=cache,id=afisha-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@afisha/admin..."
COPY packages packages
COPY apps/admin apps/admin
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @afisha/admin build
# Самодостаточный каталог с зависимостями (без devDependencies и симлинков на воркспейс)
RUN --mount=type=cache,id=afisha-pnpm-store,target=/pnpm/store \
    pnpm --filter @afisha/admin deploy --prod /out \
 && node -e "const p=require('/out/package.json');const d=Object.keys(p.devDependencies||{}).filter(n=>require('fs').existsSync('/out/node_modules/'+n));if(d.length){console.error('devDependencies в prod:',d);process.exit(1)}"

# ---------- рантайм ----------
FROM ${NODE_IMAGE} AS runtime
ARG GIT_SHA=unknown
LABEL org.opencontainers.image.title="afisha-admin" \
      org.opencontainers.image.description="Афиша РБ: рабочее место сотрудников (кабинет, модерация, «Пульс культуры»)" \
      org.opencontainers.image.revision="${GIT_SHA}"
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
           /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-* \
 && groupadd --system --gid 10001 afisha \
 && useradd --system --uid 10001 --gid afisha --home-dir /nonexistent --no-create-home --shell /usr/sbin/nologin afisha
ENV NODE_ENV=production \
    NODE_OPTIONS=--enable-source-maps \
    PORT=3001
WORKDIR /app
# Код и зависимости принадлежат root и доступны процессу только на чтение
# (у админки нет каталога public — только .next, конфиг и зависимости)
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /repo/apps/admin/.next ./.next
COPY --from=build /repo/apps/admin/next.config.ts ./next.config.ts
USER 10001:10001
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
# next start без standalone: бинарник Next запускается напрямую (pnpm в рантайм-образе нет)
CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3001"]
