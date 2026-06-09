# geto — Result Export (CSV / JSON / Markdown)

**Date:** 2026-06-09
**Status:** Approved design — ready for implementation plan

## Context

`geto` is a self-hosted database client (Elysia/Bun server + SvelteKit 5 SPA). Query
results and table data render in a shared, non-virtualized data grid
(`apps/web/src/lib/components/ui/data-grid/`). Today the only way to get data out of
the grid is **clipboard copy** — a single focused cell, or selected rows as TSV
(implemented in `data-grid.svelte` `copyRows`). There is **no file export**.

This feature adds **client-side file export** of grid data in three formats — **CSV,
JSON, and Markdown table** — covering the rows currently loaded in the grid (selected
rows if any, otherwise the active page). It is a natural extension of the existing
TSV-copy work and a common database-client need.

### Decisions (locked with user)

- **Scope:** purely client-side. Export the **selected rows** if any are selected,
  otherwise **all rows currently loaded in the grid (active page only)** — not the
  entire server-side result set. No new server endpoint.
- **Formats:** CSV, JSON, Markdown table. (No SQL `INSERT` — avoids the target-table
  ambiguity for arbitrary console results.)
- **Delivery:** **download a file** (`.csv`, `.json`, `.md`). No clipboard variant
  (TSV clipboard copy already exists separately).
- **Values:** use the real marshaled row values loaded in the grid (JSON columns stay
  objects, dates are ISO strings, bigint is a string), **not** the truncated on-screen
  display text. Consistent with copy: unsaved staged edits are reflected
  (`cellPending(r,c) ?? original[c]`).
- **No unit tests** — manual verification only.

### Key facts from exploration

- Core grid: `apps/web/src/lib/components/ui/data-grid/data-grid.svelte`. Selection
  state (`selectedRows`, `selectRow`, `isRowSelected`) and `cellPending` live on
  `DataGridContext` (`data-grid-context.ts`), produced by `createDataGrid`
  (`create-data-grid.svelte.ts`). `api.table.getRowModel().rows` gives the loaded
  page; each `row.index` is page-local; `row.original` is the raw value array. Draft
  (new) rows use negative indices and are excluded from selection.
- Column display names come from `api.ctx.columns[i].name` (index-aligned with
  `row.original`).
- Two consumers wrap the grid:
  - `apps/web/src/lib/components/workspace/data-grid.svelte` (table browser) — always
    renders `DataGridToolbar` (with a Refresh child) + a bottom pagination footer.
  - `apps/web/src/lib/components/workspace/result-table.svelte` (SQL-console result) —
    renders `DataGridToolbar` **only `{#if source}`** (editable single-table SELECT);
    a plain read-only SELECT currently has **no toolbar**.
- `DataGridToolbar` shows a **Delete** button whenever `api.ctx.focusedCell` is set
  (independent of editability) — so it must NOT be force-rendered for read-only
  results, or it would offer a bogus delete affordance.
- Clipboard copy uses `$lib/clipboard.ts` (HTTP-safe). **File download does not need a
  secure context**, so no such fallback is required here.
- bits-ui `DropdownMenu` is already used in the app (e.g. connection-card); `Download`
  icon is available from `lucide-svelte`.

## Architecture (Approach A)

A pure serialization module + one reusable `ExportMenu` component fed by the grid
`api`. Single source of truth for "which rows get exported," shared with copy.

### 1. `apps/web/src/lib/export.ts` — pure module (new)

- `collectRows(api): { columns: string[]; rows: unknown[][] }`
  - Resolve **selected-or-page**: if `Object.keys(api.ctx.selectedRows).length` →
    those indices (ascending); else all rows from `api.table.getRowModel().rows`.
  - Skip draft rows (negative index).
  - Each cell value = `api.ctx.cellPending(idx, c) ?? (original[c])`, iterating
    columns by `api.ctx.columns` order. `columns` = `api.ctx.columns.map(c => c.name)`.
  - This same helper is reused by the grid's existing `copyRows` so copy and export
    never diverge.
- `toCSV(columns, rows): string`
  - RFC-4180-ish: header row, comma delimiter, rows joined by `\r\n`.
  - Quote a field if it contains `,` `"` `\n` or `\r`; escape `"` → `""`.
  - `null`/`undefined` → empty field; objects/arrays → `JSON.stringify`; everything
    else → `String(value)`.
  - Prepend a **UTF-8 BOM** (`﻿`) so Excel opens it without mojibake.
- `toJSON(columns, rows): string`
  - Array of objects keyed by column name, values kept typed (`null` stays `null`,
    objects stay objects). `JSON.stringify(arr, null, 2)`.
- `toMarkdown(columns, rows): string`
  - Pipe table with a `| --- |` separator row. Escape `|` → `\|`; collapse newlines to
    a space. `null`/`undefined` → empty cell; objects → `JSON.stringify`.
- `downloadFile(filename, mime, content): void`
  - `Blob` → `URL.createObjectURL` → temporary `<a download>` click → `revokeObjectURL`.

### 2. `apps/web/src/lib/components/ui/data-grid/export-menu.svelte` — component (new)

- Props: `api: DataGridApi`, `baseName: string`.
- A bits-ui `DropdownMenu`: trigger is a small **Export** button (`Download` icon);
  items are **CSV**, **JSON**, **Markdown**.
- Each item label notes the scope so the user knows it is page-local, e.g.
  `CSV — 12 selected rows` when a selection exists, otherwise `CSV — current page`.
- On click: `const { columns, rows } = collectRows(api)`. If `rows.length === 0` →
  `toast` "No rows to export" and return. Otherwise serialize for the chosen format,
  then `downloadFile(\`${baseName}-${ts}.${ext}\`, mime, content)` where `ts` is a
  `YYYYMMDD-HHmmss` stamp (runtime `new Date()` is fine in app code), and `toast`
  `Exported ${rows.length} rows`.
- MIME/extension map: CSV → `text/csv` / `.csv`; JSON → `application/json` / `.json`;
  Markdown → `text/markdown` / `.md`.
- Export it from the data-grid barrel `index.ts`.

### 3. Wire into both consumers

- **`workspace/data-grid.svelte` (table browser):** add
  `<ExportMenu api={grid} baseName={\`${schema}.${table}\`} />` as a child of the
  existing always-rendered `DataGridToolbar`.
- **`result-table.svelte` (SQL-console result):** make the toolbar always present so
  export works for read-only results too, without exposing a bogus Delete button:
  - `{#if source}` → keep `DataGridToolbar` and place `<ExportMenu>` inside it (as a
    child, pushed right alongside the existing status text). `baseName =
    \`${source.schema}.${source.table}\``.
  - `{:else}` → render a thin `flex items-center justify-end border-b px-2 py-1` bar
    containing only `<ExportMenu>`. `baseName = 'query-result'`.

### 4. Small refactor

Update `copyRows` in `data-grid.svelte` to build its TSV from `collectRows(api)`
instead of re-deriving rows inline, so copy and export share one resolution path.

## Behavior & edge cases

- **Selection wins:** rows selected → export only those (ascending order); none
  selected → export every row on the active page. Identical rule to Ctrl/Cmd+C.
- **Active page only** (not the whole server result set) — per the locked scope. The
  per-item label ("current page" / "N selected rows") makes this explicit so users
  don't assume all matching rows are included.
- **Empty export** (0 rows) → toast and no file.
- **Filenames** carry a timestamp to avoid silent overwrites.
- **Drafts excluded**; staged edits reflected (matches copy).

## Files touched

- New: `apps/web/src/lib/export.ts`
- New: `apps/web/src/lib/components/ui/data-grid/export-menu.svelte`
- Edit: `apps/web/src/lib/components/ui/data-grid/index.ts` (export the new component)
- Edit: `apps/web/src/lib/components/ui/data-grid/data-grid.svelte` (`copyRows` reuses `collectRows`)
- Edit: `apps/web/src/lib/components/workspace/data-grid.svelte` (toolbar child)
- Edit: `apps/web/src/lib/components/workspace/result-table.svelte` (always-on toolbar + menu)

## Verification (manual only)

1. `cd apps/web; bun run check` → 0 errors / 0 warnings.
2. **Table browser:** open a table → **Export** in the toolbar.
   - CSV → opens in Excel/Sheets with correct UTF-8 and quoted fields (try a row with
     commas/quotes/newlines and a `jsonb` column).
   - JSON → valid `array` of objects, typed values, `null` preserved.
   - Markdown → renders as a clean table when pasted into a Markdown preview.
3. **SQL console result:**
   - Editable single-table SELECT (`SELECT * FROM …`) → Export sits in the editable
     toolbar; `baseName` is `schema.table`.
   - Read-only / multi-table SELECT (e.g. a join or `SELECT now()`) → Export still
     appears (thin bar), **no Delete button**; `baseName` is `query-result`.
4. **Selection:** select a few rows via the `#` column → Export menu says "N selected
   rows" and the file contains only those; clear selection → it exports the whole page.
5. **Empty:** a query returning 0 rows → Export → "No rows to export" toast, no file.

## Out of scope

- Full server-side / streaming export of the entire result set (only the active page
  is exported). Could later add a server export endpoint if large-dataset export is
  needed.
- SQL `INSERT` export, Excel `.xlsx`, and clipboard variants of these formats.
- Column selection/reordering for export (exports all visible columns in grid order).
