# Result Export (CSV/JSON/Markdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add client-side file export (CSV, JSON, Markdown) of the grid's selected rows — or the active page when nothing is selected — to both the table browser and the SQL-console result.

**Architecture:** A pure serialization module (`$lib/export.ts`) plus one reusable `ExportMenu` dropdown component fed by the data-grid `api`. A single `collectRows(api)` helper resolves "selected-or-page" rows once and is shared by both export and the existing TSV copy, so they can never diverge.

**Tech Stack:** SvelteKit 5 (runes), TypeScript, bits-ui `DropdownMenu`, `lucide-svelte`, TanStack Table (`@tanstack/table-core`), Tailwind v4. Bun is the package manager/runner.

**Spec:** `docs/superpowers/specs/2026-06-09-result-export-design.md`

**Testing note:** Per the approved spec, there are **no unit tests**. The gate after each code task is `bun run check` (svelte-check, must be 0 errors / 0 warnings). Final verification is manual (Task 6).

---

## File Structure

- **Create** `apps/web/src/lib/export.ts` — pure functions: `collectRows`, `toCSV`, `toJSON`, `toMarkdown`, `downloadFile`, `timestamp`. No Svelte, no DOM state; only `document`/`Blob`/`URL` inside `downloadFile`. Type-only dependency on `DataGridApi`.
- **Create** `apps/web/src/lib/components/ui/data-grid/export-menu.svelte` — the Export dropdown button. Knows the grid `api` and a `baseName`; calls the pure module.
- **Modify** `apps/web/src/lib/components/ui/data-grid/index.ts` — export the new component from the barrel.
- **Modify** `apps/web/src/lib/components/workspace/data-grid.svelte` — drop `<ExportMenu>` into the always-present toolbar (table browser).
- **Modify** `apps/web/src/lib/components/workspace/result-table.svelte` — make the toolbar always render so export works for read-only results too; place `<ExportMenu>` in it.
- **Modify** `apps/web/src/lib/components/ui/data-grid/data-grid.svelte` — refactor `copyRows` to reuse `collectRows` (keeps TSV copy byte-identical).

---

## Task 1: Pure export module

**Files:**
- Create: `apps/web/src/lib/export.ts`

- [ ] **Step 1: Create the module**

Create `apps/web/src/lib/export.ts` with this exact content:

```ts
// Client-side export of grid data to CSV / JSON / Markdown. Pure functions only —
// `collectRows` reads the live grid api (selection + loaded page + pending edits);
// the serializers and `downloadFile` are side-effect-free except for the actual
// browser download. Shared with the grid's TSV copy via `collectRows`.
import type { DataGridApi } from '$lib/components/ui/data-grid/data-grid-context'

/**
 * Resolve the rows to export/copy: the selected rows (ascending) if any are
 * selected, otherwise every row currently loaded in the grid (the active page).
 * Cell values prefer a pending (unsaved) edit, falling back to the loaded value.
 * Draft rows never appear here — they are not in the table's row model and are
 * excluded from selection.
 */
export function collectRows(api: DataGridApi): { columns: string[]; rows: unknown[][] } {
  const cols = api.ctx.columns
  const columns = cols.map((c) => c.name)
  const model = api.table.getRowModel().rows
  const selected = Object.keys(api.ctx.selectedRows)
    .map(Number)
    .sort((a, b) => a - b)
  const picked = selected.length
    ? selected
        .map((idx) => model.find((r) => r.index === idx))
        .filter((r): r is NonNullable<typeof r> => !!r)
    : model
  const rows = picked.map((r) => {
    const orig = r.original as unknown[]
    return cols.map((_col, c) => api.ctx.cellPending(r.index, c) ?? orig[c])
  })
  return { columns, rows }
}

/** Stringify a raw cell value for text formats: null/undefined → '', object → JSON. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

/** RFC-4180-ish CSV with a header row and a UTF-8 BOM (so Excel reads UTF-8). */
export function toCSV(columns: string[], rows: unknown[][]): string {
  const esc = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const line = (cells: string[]) => cells.map(esc).join(',')
  const out = [line(columns), ...rows.map((r) => line(r.map(cellText)))]
  return '﻿' + out.join('\r\n')
}

/** Array of objects keyed by column name; values keep their type (null stays null). */
export function toJSON(columns: string[], rows: unknown[][]): string {
  const objs = rows.map((r) => {
    const o: Record<string, unknown> = {}
    columns.forEach((name, i) => {
      o[name] = r[i] ?? null
    })
    return o
  })
  return JSON.stringify(objs, null, 2)
}

/** GitHub-flavored Markdown table; escapes pipes and flattens newlines. */
export function toMarkdown(columns: string[], rows: unknown[][]): string {
  const cell = (v: unknown) => cellText(v).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const head = `| ${columns.map((c) => cell(c)).join(' | ')} |`
  const sep = `| ${columns.map(() => '---').join(' | ')} |`
  const body = rows.map((r) => `| ${r.map(cell).join(' | ')} |`)
  return [head, sep, ...body].join('\n')
}

/** Trigger a browser download of `content`. Works over plain HTTP (no secure context). */
export function downloadFile(filename: string, mime: string, content: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** `YYYYMMDD-HHmmss` stamp for unique filenames. */
export function timestamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/web && bun run check`
Expected: `0 ERRORS 0 WARNINGS`. (The `DataGridApi` type already exists and exposes `ctx.columns`, `ctx.selectedRows`, `ctx.cellPending`, and `table`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/export.ts
git commit -m "feat(web): add pure export module (CSV/JSON/Markdown + collectRows)"
```

---

## Task 2: ExportMenu component + barrel export

**Files:**
- Create: `apps/web/src/lib/components/ui/data-grid/export-menu.svelte`
- Modify: `apps/web/src/lib/components/ui/data-grid/index.ts`

- [ ] **Step 1: Create the component**

Create `apps/web/src/lib/components/ui/data-grid/export-menu.svelte` with this exact content:

```svelte
<script lang="ts">
  import { toast } from 'svelte-sonner'
  import { Download } from 'lucide-svelte'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu'
  import { Button } from '$lib/components/ui/button'
  import type { DataGridApi } from './data-grid-context'
  import { collectRows, toCSV, toJSON, toMarkdown, downloadFile, timestamp } from '$lib/export'

  let {
    api,
    baseName,
    class: className = '',
  }: { api: DataGridApi; baseName: string; class?: string } = $props()

  // Scope hint shown on each menu item so users know it's page-local, not the whole result set.
  const selectedCount = $derived(Object.keys(api.ctx.selectedRows).length)
  const scopeLabel = $derived(selectedCount ? `${selectedCount} selected rows` : 'current page')

  type Fmt = 'csv' | 'json' | 'md'
  const SERIALIZE: Record<
    Fmt,
    { mime: string; ext: string; run: (columns: string[], rows: unknown[][]) => string }
  > = {
    csv: { mime: 'text/csv', ext: 'csv', run: toCSV },
    json: { mime: 'application/json', ext: 'json', run: toJSON },
    md: { mime: 'text/markdown', ext: 'md', run: toMarkdown },
  }

  function exportAs(fmt: Fmt) {
    const { columns, rows } = collectRows(api)
    if (!rows.length) {
      toast.error('No rows to export')
      return
    }
    const { mime, ext, run } = SERIALIZE[fmt]
    downloadFile(`${baseName}-${timestamp(new Date())}.${ext}`, mime, run(columns, rows))
    toast.success(`Exported ${rows.length} row${rows.length === 1 ? '' : 's'}`)
  }
</script>

<DropdownMenu.Root>
  <DropdownMenu.Trigger>
    {#snippet child({ props })}
      <Button {...props} variant="outline" size="sm" class="h-7 {className}">
        <Download class="size-4" /> Export
      </Button>
    {/snippet}
  </DropdownMenu.Trigger>
  <DropdownMenu.Content align="end" class="w-auto">
    <DropdownMenu.Item onSelect={() => exportAs('csv')}>CSV · {scopeLabel}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => exportAs('json')}>JSON · {scopeLabel}</DropdownMenu.Item>
    <DropdownMenu.Item onSelect={() => exportAs('md')}>Markdown · {scopeLabel}</DropdownMenu.Item>
  </DropdownMenu.Content>
</DropdownMenu.Root>
```

- [ ] **Step 2: Export it from the data-grid barrel**

Read `apps/web/src/lib/components/ui/data-grid/index.ts`, then add this line immediately after the existing `export { default as EditableCell } from './editable-cell.svelte'` line:

```ts
export { default as ExportMenu } from './export-menu.svelte'
```

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/ui/data-grid/export-menu.svelte apps/web/src/lib/components/ui/data-grid/index.ts
git commit -m "feat(web): add ExportMenu dropdown component"
```

---

## Task 3: Wire ExportMenu into the table browser

**Files:**
- Modify: `apps/web/src/lib/components/workspace/data-grid.svelte`

- [ ] **Step 1: Import ExportMenu**

In `apps/web/src/lib/components/workspace/data-grid.svelte`, find the import block:

```svelte
  import {
    DataGrid,
    DataGridToolbar,
    PageSizeSelect,
    createDataGrid,
    variantFor,
    type GridColumn,
  } from '$lib/components/ui/data-grid'
```

Change it to add `ExportMenu`:

```svelte
  import {
    DataGrid,
    DataGridToolbar,
    PageSizeSelect,
    ExportMenu,
    createDataGrid,
    variantFor,
    type GridColumn,
  } from '$lib/components/ui/data-grid'
```

- [ ] **Step 2: Add the Export button to the toolbar**

In the same file, find the `DataGridToolbar` block:

```svelte
  <DataGridToolbar api={grid} editable={pk.length > 0}>
    <Button
      size="icon"
      variant="ghost"
      class="size-7"
      title="Refresh"
      disabled={grid.dirty}
      onclick={refresh}
    >
      <RefreshCw class="size-4" />
    </Button>
    {#if pk.length === 0}
      <span class="text-muted-foreground text-xs">no primary key — read-only grid</span>
    {:else if grid.dirty}
      <span class="text-muted-foreground ml-auto text-xs">unsaved changes — Apply or Cancel</span>
    {/if}
  </DataGridToolbar>
```

Add the `ExportMenu` as the last child (the `ml-auto` pushes it to the right edge regardless of the branches above):

```svelte
  <DataGridToolbar api={grid} editable={pk.length > 0}>
    <Button
      size="icon"
      variant="ghost"
      class="size-7"
      title="Refresh"
      disabled={grid.dirty}
      onclick={refresh}
    >
      <RefreshCw class="size-4" />
    </Button>
    {#if pk.length === 0}
      <span class="text-muted-foreground text-xs">no primary key — read-only grid</span>
    {:else if grid.dirty}
      <span class="text-muted-foreground ml-auto text-xs">unsaved changes — Apply or Cancel</span>
    {/if}
    <ExportMenu api={grid} baseName={`${schema}.${table}`} class="ml-auto" />
  </DataGridToolbar>
```

Note: when a left-aligned status span and the `ml-auto` Export button are both present, only the Export button needs `ml-auto`; the status span keeps its own placement. The `ml-auto` on the first such element consumes the free space, so the Export button sits on the right. This is acceptable — the status text stays left of it.

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/workspace/data-grid.svelte
git commit -m "feat(web): export button in table browser toolbar"
```

---

## Task 4: Wire ExportMenu into the SQL-console result

**Files:**
- Modify: `apps/web/src/lib/components/workspace/result-table.svelte`

- [ ] **Step 1: Import ExportMenu**

In `apps/web/src/lib/components/workspace/result-table.svelte`, find the import block:

```svelte
  import {
    DataGrid,
    DataGridToolbar,
    createDataGrid,
    variantFor,
    type GridColumn,
  } from '$lib/components/ui/data-grid'
```

Change it to add `ExportMenu`:

```svelte
  import {
    DataGrid,
    DataGridToolbar,
    ExportMenu,
    createDataGrid,
    variantFor,
    type GridColumn,
  } from '$lib/components/ui/data-grid'
```

- [ ] **Step 2: Make the toolbar always render, with Export in it**

In the same file, find the markup:

```svelte
<div class="flex h-full flex-col">
  {#if source}
    <DataGridToolbar api={grid} editable>
      {#if grid.dirty}
        <span class="text-muted-foreground ml-auto text-xs">unsaved changes — Apply or Cancel</span>
      {:else}
        <span class="text-muted-foreground ml-auto text-xs"
          >editable · {source.schema}.{source.table}</span
        >
      {/if}
    </DataGridToolbar>
  {/if}
  <div class="min-h-0 flex-1 overflow-auto">
    <DataGrid api={grid} offset={startIndex} emptyText="No rows returned" />
  </div>
</div>
```

Replace it with (adds an Export-only bar for the non-editable case so export is always available, without exposing the editable toolbar's Delete button for read-only results):

```svelte
<div class="flex h-full flex-col">
  {#if source}
    <DataGridToolbar api={grid} editable>
      {#if grid.dirty}
        <span class="text-muted-foreground ml-auto text-xs">unsaved changes — Apply or Cancel</span>
      {:else}
        <span class="text-muted-foreground ml-auto text-xs"
          >editable · {source.schema}.{source.table}</span
        >
      {/if}
      <ExportMenu api={grid} baseName={`${source.schema}.${source.table}`} />
    </DataGridToolbar>
  {:else}
    <div class="flex items-center justify-end border-b px-2 py-1">
      <ExportMenu api={grid} baseName="query-result" />
    </div>
  {/if}
  <div class="min-h-0 flex-1 overflow-auto">
    <DataGrid api={grid} offset={startIndex} emptyText="No rows returned" />
  </div>
</div>
```

(In the editable branch the status span already carries `ml-auto`, so it plus the Export button sit together on the right — no extra class needed here.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/workspace/result-table.svelte
git commit -m "feat(web): export button in SQL-console result (editable + read-only)"
```

---

## Task 5: Refactor copyRows to reuse collectRows

**Files:**
- Modify: `apps/web/src/lib/components/ui/data-grid/data-grid.svelte`

Goal: route the existing TSV copy through the shared `collectRows` so copy and export can never drift. Output stays byte-identical because copy still renders each value with `formatCell(...).text` (pending values are strings, which `formatCell` returns unchanged; `null` → `"NULL"`, same as before).

- [ ] **Step 1: Import collectRows**

In `apps/web/src/lib/components/ui/data-grid/data-grid.svelte`, find the import of the clipboard helper:

```svelte
  import { copyText } from '$lib/clipboard'
```

Add a second import directly below it:

```svelte
  import { copyText } from '$lib/clipboard'
  import { collectRows } from '$lib/export'
```

- [ ] **Step 2: Replace the copyRows body**

In the same file, find the current `copyRows` function:

```svelte
  // Copy the selected rows as TSV with a leading header row (pastes into spreadsheets).
  function copyRows() {
    const cols = api.ctx.columns
    const selected = Object.keys(api.ctx.selectedRows)
      .map(Number)
      .sort((a, b) => a - b)
    if (!selected.length) return
    const header = cols.map((col) => col.name).join('\t')
    const body = selected.map((idx) => {
      const row = rows.find((r) => r.index === idx)
      const orig = (row?.original ?? []) as unknown[]
      return cols
        .map((_col, c) => api.ctx.cellPending(idx, c) ?? formatCell(orig[c]).text)
        .join('\t')
    })
    copyText([header, ...body].join('\n'))
      .then(() => toast.success(`Copied ${selected.length} row${selected.length === 1 ? '' : 's'}`))
      .catch((e) => toast.error((e as Error).message))
  }
```

Replace it with:

```svelte
  // Copy the selected rows as TSV with a leading header row (pastes into spreadsheets).
  // Shares `collectRows` with file export so the two never diverge.
  function copyRows() {
    const { columns, rows: picked } = collectRows(api)
    if (!picked.length) return
    const header = columns.join('\t')
    const body = picked.map((r) => r.map((v) => formatCell(v).text).join('\t'))
    copyText([header, ...body].join('\n'))
      .then(() => toast.success(`Copied ${picked.length} row${picked.length === 1 ? '' : 's'}`))
      .catch((e) => toast.error((e as Error).message))
  }
```

(`formatCell` is already imported in this file; `rows` is still used elsewhere in the component, so its `$derived` stays.)

- [ ] **Step 3: Typecheck**

Run: `cd apps/web && bun run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/lib/components/ui/data-grid/data-grid.svelte
git commit -m "refactor(web): route grid TSV copy through shared collectRows"
```

---

## Task 6: Manual verification

No automated tests (per spec). Start the app and verify by hand.

**Files:** none (verification only).

- [ ] **Step 1: Build check**

Run: `cd apps/web && bun run check`
Expected: `0 ERRORS 0 WARNINGS`.

- [ ] **Step 2: Start the app**

Start the server and web dev processes (local PostgreSQL on `:5432` per project setup). Do **not** kill the user's browser. Open a connection in the app.

- [ ] **Step 3: Table browser export**

Open a table with mixed types (ideally a `jsonb` column and a row containing a comma, a double-quote, and a newline).
- Click **Export → CSV** in the toolbar. Open the downloaded `<schema>.<table>-<timestamp>.csv` in Excel or Google Sheets.
  Expected: header row present; the tricky row's fields are correctly quoted/escaped; UTF-8 characters render correctly (BOM); `jsonb` cell contains the JSON string; `NULL` cells are empty.
- Click **Export → JSON**.
  Expected: a valid JSON array of objects; numbers/booleans are typed; `null` stays `null`; `jsonb` columns are nested objects (not strings).
- Click **Export → Markdown**, paste into any Markdown preview.
  Expected: a clean table; cells containing `|` are escaped; no broken rows from newlines.

- [ ] **Step 4: Selection scope**

Select 2–3 rows via the `#` column (Ctrl/Cmd+click to multi-select).
Expected: the Export menu items read `… · N selected rows`; exporting yields a file with only those rows (in top-to-bottom order). Clear the selection (click a data cell) → items read `… · current page` and export contains the whole loaded page.

- [ ] **Step 5: SQL-console export (editable + read-only)**

Open the SQL console.
- Run `SELECT * FROM <some_table>;` (single-table, has a PK). Expected: Export appears in the editable toolbar; `baseName` is `<schema>.<table>`; no Delete affordance issues.
- Run a non-editable query, e.g. `SELECT now() AS ts, 1 AS n;` or a join. Expected: a thin bar with **only** the Export button appears (no Add row / Delete); exported filename starts with `query-result-`.

- [ ] **Step 6: Empty + copy regression**

- Run a query that returns 0 rows (e.g. `SELECT 1 WHERE false;`) → click any Export format. Expected: toast "No rows to export", no file downloaded.
- Select a couple of rows and press **Ctrl/Cmd+C** → paste into a text editor. Expected: header line + TSV rows, exactly as before this change (copy still works). With no rows selected but a cell focused, Ctrl/Cmd+C still copies just that cell.

- [ ] **Step 7: Final confirmation**

Confirm all six prior tasks are committed (`git log --oneline -6`). No code commit in this task.

---

## Self-Review (completed during planning)

- **Spec coverage:** CSV/JSON/Markdown serializers (Task 1) ✓; download delivery (Task 1 `downloadFile`) ✓; selected-or-page scope + drafts excluded + pending edits (Task 1 `collectRows`) ✓; values raw not display-truncated, null→empty in CSV/MD, null preserved in JSON, UTF-8 BOM (Task 1) ✓; ExportMenu with per-item scope label (Task 2) ✓; table-browser placement (Task 3) ✓; result-table always-on toolbar without bogus Delete for read-only (Task 4) ✓; copy/export unification (Task 5) ✓; manual verification (Task 6) ✓. No unit tests, per spec ✓.
- **Placeholder scan:** none — every code step is complete.
- **Type/name consistency:** `collectRows`, `toCSV`, `toJSON`, `toMarkdown`, `downloadFile`, `timestamp` defined in Task 1 and used with identical signatures in Tasks 2 and 5. `ExportMenu` props (`api`, `baseName`, `class`) match all three call sites. Import paths match the repo (`$lib/export`, `$lib/components/ui/data-grid`, `$lib/components/ui/dropdown-menu`).
```
