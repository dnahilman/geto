# geto — Session & Multi-Tab SQL Persistence

**Date:** 2026-06-10
**Status:** Approved design — ready for implementation plan

## Context

`geto` is a self-hosted database client (Elysia/Bun server + SvelteKit 5 SPA). The workspace at `/c/[connId]` renders a tab strip backed by the `Workspace` class (`apps/web/src/lib/stores/workspace.svelte.ts`). Two tab types exist today: `'table'` (table browser) and `'console'` (SQL console). Currently:

- Only **one** SQL console tab can be open at a time.
- All tab state is **in-memory only** — lost on page refresh.
- SQL editor content is local state inside `sql-console.svelte` — never written anywhere persistent.
- Query execution history is already persisted server-side (separate feature, out of scope).

This feature adds two things:
1. **Multiple SQL console tabs** — open `Query SQL #1`, `Query SQL #2`, etc. independently.
2. **Session persistence via `sessionStorage`** — tab list, active tab, and SQL content survive a page refresh; cleared when the browser tab is closed.

### Decisions (locked with user)

- **Scope B:** persist the tab list + SQL text in each console tab. No query result rows.
- **Storage:** `sessionStorage` (refresh-safe; gone on browser-tab close).
- **Multiple consoles:** unlimited; numbered sequentially with a non-reused counter.
- **New tab UX:** `+` button at the end of the tab strip **plus** `Ctrl/Cmd+T` shortcut; existing "SQL Console" action renamed to "New SQL Console".
- **No unit tests** — manual verification only.

---

## Architecture

### 1. Tab type changes — `workspace.svelte.ts`

```ts
type ConsoleTab = { id: string; type: 'console'; sql: string; n: number }
type TableTab   = { id: string; type: 'table'; schema: string; table: string }
type Tab = ConsoleTab | TableTab
```

`n` is the display number (shown in the tab label as `Query SQL #n`). It is assigned from a `nextN` counter that increments on every `openConsole()` call and is never reused (so closing tab #2 and opening a new one yields #3, not #2 again).

### 2. `Workspace` class changes

**sessionStorage key:** `geto:session:{connId}`

**Serialized shape:**
```json
{
  "tabs": [ ...Tab[] ],
  "activeId": "string | null",
  "nextN": 3
}
```

**Construction:**
- Read `sessionStorage.getItem('geto:session:' + connId)`.
- If valid JSON, restore `tabs`, `activeId`, and `nextN`.
- Otherwise initialize with one default console tab `{ type: 'console', sql: '', n: 1 }` and `nextN = 2`.

**`openConsole()`:**
- Creates `{ id: crypto.randomUUID(), type: 'console', sql: '', n: nextN }`.
- Increments `nextN`.
- Pushes tab, sets as active.
- Remove any existing guard that prevented more than one console tab.

**`updateSql(tabId: string, sql: string)`:**
- Finds the console tab by id, sets `tab.sql = sql`.

**`reset()`:**
- Clears `sessionStorage.removeItem('geto:session:' + connId)`.
- Resets tabs and counter (called when switching connections — existing behaviour).

**`$effect` sync:**
- A reactive effect serializes `{ tabs, activeId, nextN }` to `sessionStorage` on every state mutation.

### 3. Tab bar UI — `+page.svelte`

- **Tab labels:** console tab → `Query SQL #${tab.n}`; table tab → `${tab.schema}.${tab.table}` (unchanged).
- **"+" button:** small `+` icon button at the right end of the tab strip; calls `ws.openConsole()`; ghost variant, same height as existing tab buttons.
- **Ctrl/Cmd+T shortcut:** `keydown` listener on `window` inside a `$effect`. Condition: `(e.ctrlKey || e.metaKey) && e.key === 't'`. Calls `e.preventDefault()` (suppresses browser "new tab") then `ws.openConsole()`. Cleaned up on destroy.
- **Rename:** any button/label currently reading "SQL Console" is updated to "New SQL Console".

### 4. `sql-console.svelte` changes

Two new props:

| Prop | Type | Purpose |
|------|------|---------|
| `initialSql` | `string` | Editor initializes with this value when the tab mounts |
| `onSqlChange` | `(sql: string) => void` | Called on every editor content change |

The workspace page passes both when rendering a console tab:
```svelte
<SqlConsole
  initialSql={tab.sql}
  onSqlChange={(s) => ws.updateSql(tab.id, s)}
/>
```

No debounce — `sessionStorage` writes are synchronous and fast; firing on every keystroke is acceptable.

Result state, history, pagination, and everything else in `sql-console.svelte` remain local and are not persisted.

---

## Files touched

| File | Change |
|------|--------|
| `apps/web/src/lib/stores/workspace.svelte.ts` | Extend tab types, add `n`/`nextN`, sessionStorage restore + sync + clear, `updateSql`, remove single-console guard |
| `apps/web/src/routes/c/[connId]/+page.svelte` | Tab labels, `+` button, Ctrl+T shortcut, "New SQL Console" rename, pass `initialSql`/`onSqlChange` |
| `apps/web/src/lib/components/workspace/sql-console.svelte` | Add `initialSql` + `onSqlChange` props, wire to CodeMirror |

---

## Behavior & edge cases

- **Corrupt sessionStorage:** wrap restore in `try/catch`; fall back to the default single-console state silently.
- **Tab close:** `ws.close(id)` already works; no extra cleanup needed — the `$effect` re-serializes minus the closed tab automatically.
- **Counter never reuses:** closing `Query SQL #2` and opening a new console yields `Query SQL #3`, matching spreadsheet/IDE conventions.
- **Ctrl+T inside an input/editor:** the shortcut fires on `window`; check `e.target` is not an `<input>`, `<textarea>`, or CodeMirror editor (has `cm-editor` ancestor) before acting, to avoid hijacking typing shortcuts.
- **reset() on connection switch:** clears sessionStorage so switching from connection A to B does not bleed A's tabs back in.
- **Multiple browser tabs:** each browser tab has its own `sessionStorage`, so two tabs open to the same connection do not interfere.

## Verification (manual only)

1. `cd apps/web; bun run check` → 0 errors / 0 warnings.
2. Open a connection → one `Query SQL #1` tab present by default.
3. Type SQL into the editor, refresh → tab restores with the SQL text intact.
4. Click `+` in tab bar → `Query SQL #2` opens; Ctrl+T → `Query SQL #3` opens.
5. Close `#2` → remaining tabs are `#1` and `#3`; next new tab is `#4`.
6. Refresh with multiple tabs open → all tabs (console + table) restore; active tab is correct.
7. Close the browser tab entirely, reopen → tabs do **not** restore (sessionStorage cleared).
8. Switch connection → tabs clear; opening new connection starts fresh.
9. Open a table from schema tree → table tab still works as before.
10. Ctrl+T inside the SQL editor text area → does NOT hijack (check `e.target` guard).

## Out of scope

- Table view state (page, sort) persistence — not requested.
- Named/saved sessions — not requested.
- Cross-browser-tab sync (localStorage) — not requested.
- Drag-to-reorder tabs — not requested.
