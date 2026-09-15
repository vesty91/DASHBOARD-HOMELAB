# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@11.23.0 --activate
WORKDIR /repo

FROM base AS deps
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages
COPY scripts ./scripts
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile

FROM deps AS build
ARG APP_VERSION=1.1.0
ENV APP_VERSION=$APP_VERSION \
    NODE_ENV=production \
    AUTH_SECRET=build-only-placeholder-secret-32chars \
    APP_URL=http://localhost:3000
COPY . .
RUN pnpm --filter @dashboard/web build \
  && pnpm bundle:runtime

FROM node:24-bookworm-slim AS pg-deps
WORKDIR /pg
RUN npm install --omit=dev pg@8.16.3

FROM node:24-bookworm-slim AS runtime-base
RUN groupadd --system --gid 10001 dashboard \
  && useradd --system --uid 10001 --gid dashboard --home /app --create-home dashboard
WORKDIR /app
ENV NODE_ENV=production \
    APP_VERSION=1.1.0
USER dashboard

FROM runtime-base AS web
ARG APP_VERSION=1.1.0
USER root
RUN mkdir -p /appdata/backups && chown -R dashboard:dashboard /appdata
USER dashboard
ENV APP_VERSION=$APP_VERSION \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    BACKUP_DIR=/appdata/backups
COPY --from=build --chown=dashboard:dashboard /repo/apps/web/.next/standalone ./
COPY --from=build --chown=dashboard:dashboard /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=dashboard:dashboard /repo/apps/web/public ./apps/web/public
VOLUME ["/appdata"]
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/web/server.js"]

FROM runtime-base AS worker
ARG APP_VERSION=1.1.0
ENV APP_VERSION=$APP_VERSION \
    WORKER_HOST=0.0.0.0 \
    WORKER_PORT=3001
COPY --from=pg-deps --chown=dashboard:dashboard /pg/node_modules ./node_modules
COPY --from=build --chown=dashboard:dashboard /repo/dist/worker.mjs ./worker.mjs
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "worker.mjs"]

FROM runtime-base AS realtime
ARG APP_VERSION=1.1.0
ENV APP_VERSION=$APP_VERSION \
    REALTIME_HOST=0.0.0.0 \
    REALTIME_PORT=3002
COPY --from=build --chown=dashboard:dashboard /repo/dist/realtime.mjs ./realtime.mjs
EXPOSE 3002
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3002/health/live').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "realtime.mjs"]

FROM runtime-base AS migrate
ARG APP_VERSION=1.1.0
ENV APP_VERSION=$APP_VERSION \
    DB_DRIVER=postgres \
    MIGRATIONS_DIR=/migrations/postgresql
COPY --from=pg-deps --chown=dashboard:dashboard /pg/node_modules ./node_modules
COPY --from=build --chown=dashboard:dashboard /repo/dist/migrate.mjs ./migrate.mjs
COPY --from=build --chown=dashboard:dashboard /repo/packages/db/drizzle/postgresql /migrations/postgresql
CMD ["node", "migrate.mjs"]
