# syntax=docker/dockerfile:1
#
# geto single image — multi-stage, Alpine base for every stage.
#
#   stage 1 (build)       compile the SvelteKit SPA with the full toolchain
#   stage 2 (server-deps) install ONLY the server's production deps (no dev deps)
#   stage 3 (runtime)     copy just the SPA build + server prod deps + server src
#                         + tsconfig files (so bun resolves the server's `$src/*`
#                         path aliases at runtime) — no test files, no dev
#                         sqlite: minimal surface
#
#   docker build -t geto .
#   docker compose up --build
#
# ⚠️ diosone note: its Docker bridge has no IPv6 egress, which can hang
# `bun install`. Build elsewhere or force IPv4 DNS there.

FROM oven/bun:alpine AS base
WORKDIR /app

# ---- stage 1: build the SvelteKit SPA (heavy toolchain, discarded) ----
FROM base AS build
COPY package.json bunfig.toml bun.lock* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run --filter @geto/web build

# ---- stage 2: server production deps only (no web toolchain, no dev deps) ----
FROM base AS server-deps
COPY apps/server/package.json ./
RUN bun install --production

# ---- stage 3: minimal runtime ----
FROM base AS runtime
ENV NODE_ENV=production \
    GETO_DATA_DIR=/data \
    GETO_WEB_DIR=../web/build \
    PORT=7020

COPY --from=server-deps /app/node_modules ./apps/server/node_modules
COPY apps/server/package.json ./apps/server/package.json
COPY apps/server/src ./apps/server/src
# tsconfigs carry the `$src/*` -> ./src/* path map bun needs to resolve imports.
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/server/tsconfig.json ./apps/server/tsconfig.json
COPY --from=build /app/apps/web/build ./apps/web/build

VOLUME ["/data"]
EXPOSE 7020
CMD ["bun", "apps/server/src/index.ts"]
