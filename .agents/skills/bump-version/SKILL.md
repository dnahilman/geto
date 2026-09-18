---
name: bump-version
description: >-
  Explains how to bump project version across Bun workspace (package.json, apps/desktop/package.json)
  and Rust Cargo workspace (Cargo.toml, Cargo.lock) using bumpp. Use when releasing a new version,
  creating release tags, or triggering CI/CD release pipelines.
---

# Bump Version Skill (Geto Monorepo)

This skill documents how versioning works in the Geto monorepo and how to release new versions safely using `bumpp`.

## Architecture & Configuration

The Geto monorepo contains both JavaScript/TypeScript (Bun workspaces) and Rust (Cargo workspaces). Versioning is synchronized across both ecosystems via [`bump.config.ts`](file:///home/aprilia/projects/geto/bump.config.ts).

### Synchronized Version Files
1. **Frontend / Monorepo Root**: [`package.json`](file:///home/aprilia/projects/geto/package.json) (`version`)
2. **Desktop App**: [`apps/desktop/package.json`](file:///home/aprilia/projects/geto/apps/desktop/package.json) (`version`)
3. **Rust Workspace**: [`Cargo.toml`](file:///home/aprilia/projects/geto/Cargo.toml) (`[workspace.package].version`)
   - All crates (`crates/geto-core`, `apps/server`, `apps/desktop/src-tauri`) inherit `version.workspace = true`.
4. **Rust Lockfile**: [`Cargo.lock`](file:///home/aprilia/projects/geto/Cargo.lock) (updated via `cargo check --workspace`).

---

## How to Bump Versions

We use `bumpp` (configured in `bump.config.ts` and `package.json`).

### Standard Commands

```bash
# Interactive prompt (select patch, minor, major, or custom version)
bun run bump

# Direct semver increments
bun run bump:patch
bun run bump:minor
bun run bump:major

# Explicit version bump without interactive confirmation
bunx bumpp <version> --yes
# Example:
bunx bumpp 0.6.0 --yes
```

---

## What Happens During a Bump

When `bumpp` executes:
1. Updates versions in `package.json` and `apps/desktop/package.json`.
2. Runs the `execute` hook in `bump.config.ts`:
   - Modifies `[workspace.package].version` in `Cargo.toml`.
   - Runs `cargo check --workspace` to update `Cargo.lock`.
   - Stages `Cargo.toml` and `Cargo.lock` with `git add`.
3. Creates a git commit: `chore: release v{version}`.
4. Creates an annotated/lightweight git tag: `v{version}`.

---

## Publishing the Release & CI/CD Trigger

Because `push: false` is configured in `bump.config.ts` to allow local inspection:
1. Push the commit and the new tag to GitHub:
   ```bash
   git push origin main --tags
   ```
2. Pushing tag `v*` will automatically trigger:
   - **Docker Release Workflow** (`.github/workflows/release.yml`): Builds and pushes image to GHCR (`ghcr.io/dnahilman/geto`).
   - **Windows Desktop Build Workflow** (`.github/workflows/build-windows.yml`): Builds MSI/EXE installer with Tauri v2 and creates a GitHub Release.

---

## Monitoring CI/CD via GitHub CLI (`gh`)

To check and monitor running workflows in real-time without leaving the terminal:

```bash
# List recent workflow runs
gh run list -L 5

# View details of a specific workflow run
gh run view <run-id>

# Watch a workflow run live until completion
gh run watch <run-id>

# Check logs if a run fails
gh run view <run-id> --log-failed
```
