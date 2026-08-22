# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
COPY apps/worker apps/worker
RUN npm run build -w @aivoice/contracts \
  && npm run build -w @aivoice/api \
  && npm run build -w @aivoice/worker

FROM node:20-bookworm-slim AS production-dependencies

WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --omit=dev

FROM postgres:17-bookworm AS runtime

WORKDIR /app

COPY --from=node:20-bookworm-slim /usr/local /usr/local

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=80

COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=build /app/packages/contracts/dist packages/contracts/dist
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/worker/dist apps/worker/dist
COPY apps/api/drizzle apps/api/drizzle
COPY scripts/runtime/start-combined.mjs scripts/runtime/start-combined.mjs

RUN mkdir -p /app/.runtime/media /app/.runtime/postgres

EXPOSE 80

CMD ["node", "scripts/runtime/start-combined.mjs"]
