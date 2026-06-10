# Session & Multi-Tab SQL Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow multiple SQL console tabs (Query SQL #1, #2, …) and persist all open tabs + SQL text across page refreshes via `sessionStorage`.

**Architecture:** Extend the `Workspace` class to hold `n`/`sql` on console tabs, accept a `connId` constructor argument for the sessionStorage key, and sync state to `sessionStorage` via `$effect`. `sql-console.svelte` gets two new props (`initialSql`, `onSqlChange`) so each tab restores its own editor content. The workspace page adds a `+` tab-bar button and a `Ctrl+T` shortcut that both call `ws.openConsole()`.

**Tech Stack:** Svelte 5 runes (`$state`, `$effect`), `sessionStorage` (browser API), TypeScript, lucide-svelte icons.

---

## File map

| File | What changes |
|------|-------------|
| `apps/web/src/lib/stores/workspace.svelte.ts` | Extend tab types, multi-console, `updateSql`, constructor with sessionStorage |
| `apps/web/src/lib/components/workspace/sql-console.svelte` | Add `initialSql` + `onSqlChange` props |
| `apps/web/src/routes/c/[connId]/+page.svelte` | Pass `connId` to Workspace, `+` button, Ctrl+T, rename, pass props to SqlConsole |

---

## Task 1 — Extend Workspace: multi-console + `updateSql`

**Files:**
- Modify: `apps/web/src/lib/stores/workspace.svelte.ts`

No sessionStorage yet — just the multi-tab foundation.

- [ ] **Step 1: Replace the file content**

Replace the entire file with:

```ts
export type Tab =
  | { kind: 'table'; schema: string; table: string; id: string; title: string }
  | { kind: 'console'; id: string; title: string; n: number; sql: string }

export class Workspace {
  tabs = $state<Tab[]>([])
  activeId = $state<string | null>(null)
  nextN = $state(1)

  openTable(schema: string, table: string) {
    const id = `t:${schema}.${table}`
    if (!this.tabs.some((t) => t.id === id)) {
      this.tabs.push({ kind: 'table', schema, table, id, title: table })
    }
    this.activeId = id
  }

  openConsole() {
    const n = this.nextN++
    const id = crypto.randomUUID()
    this.tabs.push({ kind: 'console', id, title: `Query SQL #${n}`, n, sql: 'SELECT * FROM ' })
    this.activeId = id
  }

  updateSql(tabId: string, sql: string) {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (tab?.kind === 'console') tab.sql = sql
  }

  close(id: string) {
    const idx = this.tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    this.tabs.splice(idx, 1)
    if (this.activeId === id) {
      this.activeId = this.tabs[idx]?.id ?? this.tabs[idx - 1]?.id ?? null
    }
  }

  get active(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null
  }

  reset() {
    this.tabs = []
    this.activeId = null
    this.nextN = 1
  }
}
```

Key changes vs original:
- `ConsoleTab` gains `n: number` and `sql: string`.
- `openConsole()` no longer has a single-console guard (`if (!this.tabs.some(...))`). Each call creates a new unique tab with `crypto.randomUUID()`.
- `nextN` counter starts at 1; `n` is captured before incrementing so tab title is `Query SQL #1` etc.
- New `updateSql(tabId, sql)` method mutates `tab.sql` in-place.
- `reset()` also resets `nextN`.

- [ ] **Step 2: Run type-check**

```powershell
cd apps/web; bun run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/lib/stores/workspace.svelte.ts
git commit -m "feat: multi-console tabs + updateSql in Workspace"
```

---

## Task 2 — Add sessionStorage persistence to Workspace

**Files:**
- Modify: `apps/web/src/lib/stores/workspace.svelte.ts`

- [ ] **Step 1: Replace the file content**

Replace the entire file with the full version that adds a constructor, `restore()`, `$effect` sync, and updated `reset()`:

```ts
export type Tab =
  | { kind: 'table'; schema: string; table: string; id: string; title: string }
  | { kind: 'console'; id: string; title: string; n: number; sql: string }

type PersistedSession = {
  tabs: Tab[]
  activeId: string | null
  nextN: number
}

export class Workspace {
  tabs = $state<Tab[]>([])
  activeId = $state<string | null>(null)
  nextN = $state(1)
  private readonly storageKey: string

  constructor(connId: string) {
    this.storageKey = `geto:session:${connId}`
    this.restore()
    $effect(() => {
      const session: PersistedSession = {
        tabs: this.tabs,
        activeId: this.activeId,
        nextN: this.nextN,
      }
      sessionStorage.setItem(this.storageKey, JSON.stringify(session))
    })
  }

  private restore() {
    try {
      const raw = sessionStorage.getItem(this.storageKey)
      if (!raw) { this.openConsole(); return }
      const data = JSON.parse(raw) as Partial<PersistedSession>
      if (Array.isArray(data.tabs) && data.tabs.length > 0) {
        this.tabs = data.tabs
        this.activeId = data.activeId ?? null
        this.nextN = typeof data.nextN === 'number' ? data.nextN : 1
      } else {
        this.openConsole()
      }
    } catch {
      this.openConsole()
    }
  }

  openTable(schema: string, table: string) {
    const id = `t:${schema}.${table}`
    if (!this.tabs.some((t) => t.id === id)) {
      this.tabs.push({ kind: 'table', schema, table, id, title: table })
    }
    this.activeId = id
  }

  openConsole() {
    const n = this.nextN++
    const id = crypto.randomUUID()
    this.tabs.push({ kind: 'console', id, title: `Query SQL #${n}`, n, sql: 'SELECT * FROM ' })
    this.activeId = id
  }

  updateSql(tabId: string, sql: string) {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (tab?.kind === 'console') tab.sql = sql
  }

  close(id: string) {
    const idx = this.tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    this.tabs.splice(idx, 1)
    if (this.activeId === id) {
      this.activeId = this.tabs[idx]?.id ?? this.tabs[idx - 1]?.id ?? null
    }
  }

  get active(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null
  }

  reset() {
    sessionStorage.removeItem(this.storageKey)
    this.tabs = []
    this.activeId = null
    this.nextN = 1
  }
}
```

Key additions:
- `private readonly storageKey` — set in constructor, never changes.
- `constructor(connId)` — calls `restore()` first, then registers a `$effect` that writes to sessionStorage on every state change. The `$effect` must be registered during component setup (the `Workspace` is instantiated in a `.svelte` file's `<script>`, so this is valid).
- `restore()` — reads sessionStorage, parses JSON, restores tabs/activeId/nextN. Falls back to `openConsole()` on any error or empty state.
- `reset()` — adds `sessionStorage.removeItem(this.storageKey)` before clearing state.

- [ ] **Step 2: Run type-check**

```powershell
cd apps/web; bun run check
```

Expected: **one type error** — `+page.svelte` still calls `new Workspace()` without `connId`. This is expected; proceed to Task 3 and fix the call site in Task 4 before re-running the check cleanly.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/lib/stores/workspace.svelte.ts
git commit -m "feat: sessionStorage persistence in Workspace"
```

---

## Task 3 — Add `initialSql` / `onSqlChange` props to sql-console.svelte

**Files:**
- Modify: `apps/web/src/lib/components/workspace/sql-console.svelte` (lines 33–36)

- [ ] **Step 1: Update the props destructuring and sql state**

Find this block (lines 33–36):

```ts
  let { connId }: { connId: string } = $props()

  const qc = useQueryClient()
  let sql = $state('SELECT * FROM ')
```

Replace with:

```ts
  let {
    connId,
    initialSql,
    onSqlChange,
  }: {
    connId: string
    initialSql: string
    onSqlChange: (sql: string) => void
  } = $props()

  const qc = useQueryClient()
  let sql = $state(initialSql)

  $effect(() => {
    onSqlChange(sql)
  })
```

Explanation:
- `initialSql` replaces the hardcoded `'SELECT * FROM '` default — new tabs pass this from `Workspace.openConsole()` which sets `sql: 'SELECT * FROM '`.
- `onSqlChange` is called via `$effect` on every `sql` change. The first call (on mount) is idempotent — it writes back the same value the Workspace already has.
- No other changes to the file.

- [ ] **Step 2: Run type-check**

```powershell
cd apps/web; bun run check
```

Expected: errors about missing `initialSql`/`onSqlChange` props at the call site in `+page.svelte` — that's correct, fixed in Task 4.

- [ ] **Step 3: Commit**

```powershell
git add apps/web/src/lib/components/workspace/sql-console.svelte
git commit -m "feat: initialSql + onSqlChange props on sql-console"
```

---

## Task 4 — Wire +page.svelte: Workspace(connId), + button, Ctrl+T, rename, pass props

**Files:**
- Modify: `apps/web/src/routes/c/[connId]/+page.svelte`

This task touches four things in one file:
1. Pass `connId` to `Workspace` constructor.
2. Rename header button text.
3. Add `+` button in tab bar + Ctrl+T shortcut.
4. Pass `initialSql`/`onSqlChange` to `<SqlConsole>`.

- [ ] **Step 1: Update the script block**

Replace the `<script>` block's import of `ArrowLeft, Database, SquareTerminal, X, Table2, KeyRound` with (add `Plus`):

```ts
  import { ArrowLeft, Database, SquareTerminal, X, Table2, KeyRound, Plus } from 'lucide-svelte'
```

Replace `const ws = new Workspace()` with:

```ts
  const ws = new Workspace(page.params.connId!)
```

Add the Ctrl+T shortcut effect **after** the `ws` declaration:

```ts
  $effect(() => {
    function onKeydown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey) || e.key !== 't') return
      const t = e.target as Element | null
      if (t?.closest('input, textarea, .cm-editor')) return
      e.preventDefault()
      ws.openConsole()
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  })
```

- [ ] **Step 2: Rename the header button**

Find in the template:

```svelte
      <Button variant="outline" size="sm" onclick={() => ws.openConsole()}>
        <SquareTerminal class="size-4" /> SQL console
      </Button>
```

Replace with:

```svelte
      <Button variant="outline" size="sm" onclick={() => ws.openConsole()}>
        <SquareTerminal class="size-4" /> New SQL Console
      </Button>
```

- [ ] **Step 3: Add `+` button in the tab bar**

Find the closing `</div>` of the tab bar (after `{/each}` that renders tabs, line ~104):

```svelte
        </div>

        <!-- active content (keep tables mounted to preserve grid state) -->
```

Replace the tab bar `<div>` open + content + close to add the `+` button at the end:

```svelte
        <div class="flex items-center gap-1 overflow-x-auto border-b px-1">
          {#each ws.tabs as tab (tab.id)}
            <div
              class="group flex items-center gap-1 border-b-2 px-2 py-1.5 text-xs
                {ws.activeId === tab.id
                ? 'border-primary'
                : 'hover:bg-accent border-transparent'}"
            >
              <button class="flex items-center gap-1.5" onclick={() => (ws.activeId = tab.id)}>
                {#if tab.kind === 'console'}
                  <SquareTerminal class="size-3.5" />
                {:else}
                  <Table2 class="size-3.5" />
                {/if}
                {tab.title}
              </button>
              <button
                class="hover:bg-muted rounded p-0.5 opacity-50 group-hover:opacity-100"
                onclick={() => ws.close(tab.id)}
              >
                <X class="size-3" />
              </button>
            </div>
          {/each}
          <button
            class="hover:bg-accent text-muted-foreground rounded p-1"
            title="New SQL console (Ctrl+T)"
            onclick={() => ws.openConsole()}
          >
            <Plus class="size-3.5" />
          </button>
        </div>
```

- [ ] **Step 4: Pass props to SqlConsole**

Find in the active content block:

```svelte
              {:else if tab.kind === 'console'}
                <SqlConsole {connId} />
```

Replace with:

```svelte
              {:else if tab.kind === 'console'}
                <SqlConsole
                  {connId}
                  initialSql={tab.sql}
                  onSqlChange={(s) => ws.updateSql(tab.id, s)}
                />
```

TypeScript narrows `tab.kind === 'console'` so `tab.sql` is typed correctly here.

- [ ] **Step 5: Run type-check**

```powershell
cd apps/web; bun run check
```

Expected: 0 errors, 0 warnings.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/routes/c/[connId]/+page.svelte
git commit -m "feat: wire session persistence + multi-SQL tabs in workspace page"
```

---

## Verification (manual)

1. Open a connection → one `Query SQL #1` tab present by default.
2. Type SQL into the editor → refresh the page → tab restores with the same SQL text.
3. Click `+` in the tab bar → `Query SQL #2` opens with `SELECT * FROM ` pre-filled.
4. Press `Ctrl+T` → `Query SQL #3` opens. Press `Ctrl+T` inside the editor's text area — should NOT open a new tab (guard kicks in).
5. Close `#2` → remaining tabs are `#1` and `#3`; next new tab via `+` is `#4`.
6. Open a table from the schema tree → a table tab appears; refresh → all tabs (console + table) restore with correct active tab.
7. Close the browser tab entirely (not just refresh) → reopen the same URL → tabs do **not** restore (sessionStorage was cleared by browser).
8. Click **Databases** → switch database → `ws.reset()` fires → sessionStorage cleared → one fresh `Query SQL #1` appears.
9. Header button now reads **New SQL Console**.
