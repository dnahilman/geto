# ---- stage 1: build the SvelteKit SPA ----
FROM oven/bun:alpine AS web-build
WORKDIR /app
COPY package.json bunfig.toml bun.lock* ./
COPY apps/web/package.json apps/web/
RUN bun install --frozen-lockfile
COPY apps/web apps/web
RUN bun run --filter @geto/web build

# ---- stage 2: build the Rust server binary ----
FROM rust:slim-bookworm AS server-build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config && rm -rf /var/lib/apt/lists/*
COPY Cargo.toml Cargo.lock* ./
COPY crates/geto-core ./crates/geto-core
COPY apps/server ./apps/server
RUN cargo build --release --package geto-server

# ---- stage 3: minimal runtime (Google Distroless) ----
FROM gcr.io/distroless/cc-debian12:latest AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    GETO_DATA_DIR=/data \
    GETO_WEB_DIR=/app/web \
    PORT=7020

COPY --from=server-build /app/target/release/geto-server /usr/local/bin/geto-server
COPY --from=web-build /app/apps/web/build /app/web


VOLUME ["/data"]
EXPOSE 7020
ENTRYPOINT ["/usr/local/bin/geto-server"]
