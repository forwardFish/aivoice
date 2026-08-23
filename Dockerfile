# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/cloudbase-runtime/package.json packages/cloudbase-runtime/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY packages/cloudbase-runtime packages/cloudbase-runtime
COPY apps/api apps/api
RUN npm run build -w @aivoice/contracts \
  && npm run build -w @aivoice/cloudbase-runtime \
  && npm run build -w @aivoice/api

FROM node:20-bookworm-slim AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/cloudbase-runtime/package.json packages/cloudbase-runtime/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev --workspace @aivoice/api --include-workspace-root

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=80

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/cloudbase-runtime/package.json packages/cloudbase-runtime/package.json
COPY apps/api/package.json apps/api/package.json
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/packages/cloudbase-runtime/dist packages/cloudbase-runtime/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY scripts/runtime/start-combined.mjs scripts/runtime/start-combined.mjs

EXPOSE 80

CMD ["node", "scripts/runtime/start-combined.mjs"]
