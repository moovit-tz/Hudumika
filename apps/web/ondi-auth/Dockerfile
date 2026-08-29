# Build context is the monorepo root (see .dockerignore at repo root) —
# pnpm workspace installs need the whole workspace manifest set, not just
# this app's package.json.
FROM node:20-slim AS deps
RUN corepack enable
WORKDIR /repo

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/ondi-auth/package.json apps/web/ondi-auth/package.json

RUN pnpm install --frozen-lockfile --filter ondi-auth...

FROM node:20-slim AS build
RUN corepack enable
WORKDIR /repo

COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/apps/web/ondi-auth/node_modules apps/web/ondi-auth/node_modules
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/ondi-auth apps/web/ondi-auth

# NEXT_PUBLIC_* vars are inlined into the client bundle at build time, not
# read at container start — so this has to be a build ARG, not a runtime
# `environment:` entry in docker-compose. Override it at build time for any
# deploy where the browser can't reach ondi-api at localhost:7020.
ARG NEXT_PUBLIC_ONDI_API_URL=http://localhost:7020/v1
ENV NEXT_PUBLIC_ONDI_API_URL=${NEXT_PUBLIC_ONDI_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter ondi-auth run build

# Next's standalone output mirrors the monorepo path
# (apps/web/ondi-auth/server.js) — static assets and public/ aren't included
# by default and must be copied in alongside it.
FROM node:20-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=3022

COPY --from=build /repo/apps/web/ondi-auth/.next/standalone ./
COPY --from=build /repo/apps/web/ondi-auth/.next/static ./apps/web/ondi-auth/.next/static
COPY --from=build /repo/apps/web/ondi-auth/public ./apps/web/ondi-auth/public

EXPOSE 3022
CMD ["node", "apps/web/ondi-auth/server.js"]
