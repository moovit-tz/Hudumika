FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/types ./packages/types
COPY apps/api ./apps/api

# Install dependencies and build
RUN npm ci --include=dev
RUN npm run build --workspace=apps/api

FROM node:20-alpine AS production

WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/packages/types ./packages/types
COPY --from=builder /app/apps/api/package*.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

RUN npm ci --omit=dev --workspace=apps/api

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["npm", "start"]
