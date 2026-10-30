FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/types/package.json packages/types/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/api-client/package.json packages/api-client/package.json
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM build AS production-dependencies
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund && mkdir -p apps/api/node_modules

FROM node:24-bookworm-slim AS api
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libfontconfig1 fonts-dejavu-core && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=production-dependencies /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/packages/types/package.json ./packages/types/package.json
COPY --from=build /app/packages/types/dist ./packages/types/dist
COPY --from=build /app/deploy/contabo ./deploy/contabo
RUN mkdir -p /app/apps/api/uploads && chown -R node:node /app/apps/api/uploads
USER node
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "--conditions=production", "dist/index.js"]

FROM caddy:2-alpine AS web
COPY --from=build /app/apps/web/dist /srv/web
COPY deploy/contabo/Caddyfile /etc/caddy/Caddyfile

FROM postgres:16-bookworm AS backup
RUN apt-get update && apt-get install -y --no-install-recommends restic ca-certificates && rm -rf /var/lib/apt/lists/*
COPY deploy/contabo/backup-container.sh /usr/local/bin/hudumika-backup
COPY deploy/contabo/restore-check.sh /usr/local/bin/hudumika-restore-check
ENTRYPOINT ["bash", "/usr/local/bin/hudumika-backup"]
