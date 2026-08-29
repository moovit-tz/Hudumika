# Build context is the monorepo root (see .dockerignore) — ondi-api pulls in
# workspace packages (@ondi/db, @ondi/shared-types) via pnpm workspace
# protocol, so pnpm install needs the whole workspace, not just this folder.
#
# Runtime deliberately uses `tsx` instead of the `tsc` build output: @ondi/db
# re-exports its generated Prisma client from a .ts entry file
# (`export * from './src/client/index.js'` in index.ts), which plain `node`
# can't load directly. `tsx` is what already runs this exact import graph
# correctly in local dev (`pnpm dev`) — production runs the same way rather
# than through an unverified tsc+node path. Revisit if this service grows a
# real compiled-output pipeline across the workspace.
FROM node:20-slim

# sharp and tesseract.js pull in native/wasm bits that need these at
# install time; openssl is required by Prisma's query engine.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable

WORKDIR /repo

# Copy just the workspace manifests first so `pnpm install` is cached across
# builds that only change application code.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/ondi-db/package.json packages/ondi-db/package.json
COPY packages/ondi-shared-types/package.json packages/ondi-shared-types/package.json
COPY services/ondi-api/package.json services/ondi-api/package.json

RUN pnpm install --frozen-lockfile --filter @ondi/api... --filter @ondi/db --filter @ondi/shared-types

# Now bring in the actual source.
COPY packages/ondi-db packages/ondi-db
COPY packages/ondi-shared-types packages/ondi-shared-types
COPY services/ondi-api services/ondi-api
COPY tsconfig.base.json tsconfig.base.json

# Prisma client is generated, not committed (see packages/ondi-db/.gitignore
# equivalent rule at repo root) — must exist before the API can import it.
RUN pnpm --filter @ondi/db run generate

WORKDIR /repo/services/ondi-api

ENV NODE_ENV=production

# `prisma db push` syncs the schema against $DATABASE_URL on every boot —
# there's no migrations/ directory yet (schema has only ever been pushed,
# not migrated), so this is the equivalent of what local dev has been doing.
# Switch to `prisma migrate deploy` once real migrations exist.
# No --accept-data-loss: a push that would drop data fails closed instead of
# silently applying, since this runs unattended on every boot.
CMD ["sh", "-c", "pnpm --filter @ondi/db exec prisma db push --skip-generate && pnpm start"]
