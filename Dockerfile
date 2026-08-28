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

# Log app directory sizes during build
RUN echo "=== App Size Breakdown ===" && du -sh ./apps/server/node_modules ./apps/web/build .

VOLUME ["/data"]
EXPOSE 7020
CMD ["bun", "apps/server/src/index.ts"]
