# syntax=docker/dockerfile:1
#
# geto single image (multi-stage): the SPA is built in-container, then only the
# built assets + the server's lean runtime deps land in the final image.
#
#   podman build -t geto .
#   podman compose up --build
#
# ⚠️ diosone note: its Docker bridge has no IPv6 egress, which can hang
# `bun install`. Build elsewhere or force IPv4 DNS there.

FROM oven/bun:1 AS base
WORKDIR /app

# ---- stage 1: build the SvelteKit SPA (heavy toolchain, discarded) ----
FROM base AS build
COPY package.json bunfig.toml bun.lock* ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY . .
RUN bun run --filter web build

# ---- stage 2: server runtime deps only (standalone, no web toolchain) ----
FROM base AS server-deps
COPY apps/server/package.json ./
RUN bun install --production

# ---- stage 3: minimal runtime ----
FROM base AS runtime
ENV NODE_ENV=production
ENV GETO_DATA_DIR=/data
ENV GETO_WEB_DIR=../web/build
ENV PORT=7020

COPY --from=server-deps /app/node_modules ./apps/server/node_modules
COPY apps/server ./apps/server
COPY --from=build /app/apps/web/build ./apps/web/build

VOLUME ["/data"]
EXPOSE 7020
CMD ["bun", "apps/server/src/index.ts"]
