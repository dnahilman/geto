# geto

[![ci](https://github.com/dnahilman/geto/actions/workflows/ci.yml/badge.svg)](https://github.com/dnahilman/geto/actions/workflows/ci.yml)
[![release](https://github.com/dnahilman/geto/actions/workflows/release.yml/badge.svg)](https://github.com/dnahilman/geto/actions/workflows/release.yml)
[![ghcr](https://img.shields.io/badge/ghcr.io-dnahilman%2Fgeto-blue?logo=docker)](https://github.com/dnahilman/geto/pkgs/container/geto)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)

A lightweight, self-hostable **web UI database client for PostgreSQL**.

Browse schemas, edit table data, run SQL with an intelligent editor, and manage
databases — all from the browser. Ships as a **single Docker image**: an Elysia
(Bun) server that serves the pre-built SvelteKit SPA and exposes the API.

## Features

- **Connections** — save multiple PostgreSQL connections (passwords encrypted at
  rest with AES-256-GCM), test connectivity, copy connection strings (with or
  without the password). Optional per-connection **read-only "safe mode"**
  (enforced at the PostgreSQL level).
- **Schema browser** — tree of schemas → tables/views; structure view with
  columns, types, primary keys, indexes, and constraints.
- **Data grid** — paginated, sortable; inline cell editing, insert and delete
  rows (by primary key).
- **SQL console** (Monaco) — PostgreSQL syntax highlighting, **context/order-aware
  autocomplete** (typing `s` suggests `SELECT`/`SET`/… per grammar position),
  **schema-aware** table/column completion, **auto-uppercase keywords**, and a
  one-click **Format**. Query history is kept per connection.
- **Dangerous-SQL guard** — every statement is parsed with the real PostgreSQL
  parser (`pgsql-parser`). `UPDATE`/`DELETE` without a `WHERE`, `TRUNCATE`,
  `DROP TABLE/DATABASE`, and `ALTER … DROP COLUMN` require explicit confirmation.
- **DDL** — create/drop/truncate tables, and create/drop databases.
- **Type marshalling** — `bigint`/`numeric` returned as strings (no precision
  loss), `jsonb`/`json` as objects, `bytea` as hex, timestamps as ISO.
- **Auth** — a single password gate (httpOnly signed session cookie).

## Stack

SvelteKit 5 (static SPA) · shadcn-svelte · Tailwind v4 · Monaco +
monaco-sql-languages · Eden Treaty · @tanstack/svelte-query · Elysia on Bun ·
porsager `postgres` · `bun:sqlite` (saved connections + history).

> **Note:** `monaco-editor` is pinned to `0.52.2` for monaco-sql-languages
> compatibility (see `overrides` in the root `package.json`).

## Development

Requires [Bun](https://bun.com/) and a reachable PostgreSQL.

```sh
bun install
cp .env.example .env        # set GETO_AUTH_PASSWORD
bun run dev:server          # API on :7020 (or PORT)
bun run dev:web             # SPA on :5174, proxies /api to the server
```

Open the web dev server and sign in with `GETO_AUTH_PASSWORD`.

## Production build

```sh
bun run build               # builds the SPA → apps/web/build
bun run start               # Elysia serves the SPA + API on :PORT
```

## Container (single image)

The image is a multi-stage build — the SPA is compiled **inside the container**,
then only the built assets and the server's lean runtime deps land in the final
~240 MB image. No host pre-build needed.

```sh
cp .env.example .env          # optional — defaults are baked into compose
podman compose up --build     # or: docker compose up --build
```

- geto is published on the host at **`http://localhost:${PORT}`** (the container
  listens on 7020 internally; `PORT` only sets the host mapping). If host 7020 is
  taken, set e.g. `PORT=3100` in `.env` and open `http://localhost:3100`.
- To connect to a Postgres running on the **host** from inside the container, use
  host **`host.docker.internal`** (not `localhost`).
- Saved connections and history persist in the `geto-data` volume.

### Install as an app
geto ships a web manifest, so you can install it as a standalone-window app via
your browser's **Install / "Create shortcut → Open as window"**. This works over
plain HTTP too (the manifest needs no HTTPS). Full PWA features (offline service
worker) would require HTTPS and are intentionally not enabled — a DB client needs
a live connection anyway.

> Monaco is aliased to its slim `editor.api` (drops unused TS/HTML/CSS/JSON
> workers) so the in-container build fits within small VM memory (e.g. a 2 GB
> podman machine) and the image stays small.

## Deploy from GHCR (production)

Pre-built images are published to the GitHub Container Registry on every release.
No local build — pull the image and run the production compose:

```sh
# uses docker-compose.yaml (image: ghcr.io/dnahilman/geto:latest)
GETO_AUTH_PASSWORD='a-strong-password' \
GETO_MASTER_KEY='a-stable-secret-key' \
docker compose up -d
```

Or pull a pinned version directly:

```sh
docker pull ghcr.io/dnahilman/geto:0.1.0
docker run -d -p 7020:7020 -v geto-data:/data \
  -e GETO_AUTH_PASSWORD='a-strong-password' \
  -e GETO_MASTER_KEY='a-stable-secret-key' \
  ghcr.io/dnahilman/geto:0.1.0
```

Unlike the dev compose, `docker-compose.yaml` runs with `NODE_ENV=production` and
**requires** `GETO_AUTH_PASSWORD` and `GETO_MASTER_KEY` — it refuses to start if
either is unset. Open `http://localhost:7020` (or your `PORT` override).

> If the GHCR package is private, `docker pull` needs a login first:
> `echo $CR_PAT | docker login ghcr.io -u dnahilman --password-stdin`. To make it
> public, set the package visibility under the repo's **Packages** settings.

## Releases

Versioning is semver; the current version lives in the root `package.json`.

```sh
git tag v0.1.0
git push origin v0.1.0      # triggers the release workflow
```

Pushing a `v*.*.*` tag runs `.github/workflows/release.yml`, which builds and
pushes `ghcr.io/dnahilman/geto` tagged `0.1.0`, `0.1`, and `latest`. You can also
run the **release** workflow manually from the Actions tab (`workflow_dispatch`),
which publishes `latest` + a `sha-<commit>` tag.

## Environment

All optional — `docker-compose.dev.yml` sets sensible defaults you can override
via a `.env` file or shell env. The production `docker-compose.yaml` instead
**requires** `GETO_AUTH_PASSWORD` and `GETO_MASTER_KEY`.

| Var | Default | Purpose |
|-----|---------|---------|
| `GETO_AUTH_PASSWORD` | `dev` | Login password |
| `GETO_MASTER_KEY` | baked-in | Optional. Derives the at-rest encryption key + signs the session cookie. Set your own for real security; keep it stable |
| `PORT` | `7020` | Host port geto is published on (container listens on 7020) |
| `NODE_ENV` | `development` | `development` for plain-HTTP self-hosting |
| `GETO_DATA_DIR` | `/data` (container) | Where the SQLite store lives |

## Security notes

- The dangerous-SQL guard is a **UX safety net, not a security boundary** — a DB
  client executes arbitrary SQL by design. Use read-only mode and least-privilege
  database roles where appropriate.
- `GETO_MASTER_KEY` derives the key that encrypts stored connection passwords.
  It has a stable baked-in default so geto works out of the box — set your own
  for real at-rest security. Changing it makes previously-saved passwords
  undecryptable (you'll just re-enter them).
- The session cookie is httpOnly + SameSite=Lax but **not** `Secure` (so geto
  works over plain HTTP on a LAN/Tailscale). Put a TLS proxy in front for public
  deployments.

## Tests

```sh
cd apps/server
bun test                                   # unit tests (no database needed)

# unit + integration (against a real PostgreSQL):
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bun test
```

Or run the whole suite in a throwaway container against a fresh Postgres:

```sh
podman compose --profile test up --build test
```

## License

[MIT](./LICENSE) © 2026 dnahilman
