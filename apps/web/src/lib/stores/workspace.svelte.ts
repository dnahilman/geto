/** A single-column equality filter carried by a table tab (from the relation viewer). */
export interface TabFilter {
  column: string
  value: string
  label: string
}

export type Tab =
  | {
      kind: 'table'
      schema: string
      table: string
      id: string
      title: string
      filter?: TabFilter
      pinned?: boolean
    }
  | { kind: 'console'; id: string; title: string; n: number; sql: string; pinned?: boolean }
  // Redis (key-value) tabs — same store, never mixed with SQL tabs (a connection
  // is a single provider).
  | { kind: 'rconsole'; id: string; title: string; n: number; cmd: string; pinned?: boolean }
  | { kind: 'rkey'; id: string; title: string; key: string; pinned?: boolean }

/** Which seed console a fresh/empty workspace opens. */
export type WorkspaceKind = 'relational' | 'keyvalue'

type PersistedSession = {
  tabs: Tab[]
  activeId: string | null
  nextN: number
}

/**
 * Must be instantiated inside a Svelte component's <script> block —
 * the constructor calls $effect, which requires a component reactive context.
 */
export class Workspace {
  tabs = $state<Tab[]>([])
  activeId = $state<string | null>(null)
  // $state so the sessionStorage $effect in the constructor tracks counter changes.
  nextN = $state(1)
  private readonly storageKey: string
  private readonly kind: WorkspaceKind

  constructor(connId: string, kind: WorkspaceKind = 'relational') {
    this.storageKey = `geto:session:${connId}`
    this.kind = kind
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

  /** Seed a fresh console appropriate to the provider. */
  private seedConsole() {
    if (this.kind === 'keyvalue') this.openRedisConsole()
    else this.openConsole()
  }

  private restore() {
    try {
      const raw = sessionStorage.getItem(this.storageKey)
      if (!raw) {
        this.seedConsole()
        return
      }
      const data = JSON.parse(raw) as Partial<PersistedSession>
      if (Array.isArray(data.tabs) && data.tabs.length > 0) {
        this.tabs = data.tabs
        this.activeId = data.tabs.some((t) => t.id === data.activeId)
          ? (data.activeId ?? null)
          : (data.tabs[0]?.id ?? null)
        this.nextN = typeof data.nextN === 'number' ? data.nextN : 1
      } else {
        this.seedConsole()
      }
    } catch {
      this.seedConsole()
    }
  }

  openTable(schema: string, table: string, filter?: TabFilter) {
    // A filtered view is a distinct tab so it can coexist with the full table.
    const id = filter
      ? `t:${schema}.${table}|${filter.column}=${filter.value}`
      : `t:${schema}.${table}`
    if (!this.tabs.some((t) => t.id === id)) {
      this.tabs.push({
        kind: 'table',
        schema,
        table,
        id,
        title: filter ? `${table} · ${filter.label}` : table,
        filter,
      })
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

  // ── Redis (key-value) ──
  openRedisConsole() {
    const n = this.nextN++
    const id = crypto.randomUUID()
    this.tabs.push({ kind: 'rconsole', id, title: `Redis #${n}`, n, cmd: '' })
    this.activeId = id
  }

  /** Open (or focus) a tab showing a Redis key's value. */
  openKey(key: string) {
    const id = `k:${key}`
    if (!this.tabs.some((t) => t.id === id)) {
      this.tabs.push({ kind: 'rkey', id, title: key, key })
    }
    this.activeId = id
  }

  updateCmd(tabId: string, cmd: string) {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (tab?.kind === 'rconsole') tab.cmd = cmd
  }

  close(id: string) {
    const idx = this.tabs.findIndex((t) => t.id === id)
    if (idx === -1) return
    this.tabs.splice(idx, 1)
    if (this.activeId === id) {
      // After splice, tabs[idx] is the right neighbor; tabs[idx-1] is the left.
      this.activeId = this.tabs[idx]?.id ?? this.tabs[idx - 1]?.id ?? null
    }
  }

  /** Close every tab except `id` and any pinned tabs (VS Code "Close Others"). */
  closeOthers(id: string) {
    this.tabs = this.tabs.filter((t) => t.id === id || t.pinned)
    if (!this.tabs.some((t) => t.id === this.activeId)) {
      this.activeId = this.tabs.find((t) => t.id === id)?.id ?? this.tabs[0]?.id ?? null
    }
  }

  /** Close all tabs except pinned ones (pinning protects a tab from Close All). */
  closeAll() {
    this.tabs = this.tabs.filter((t) => t.pinned)
    if (!this.tabs.some((t) => t.id === this.activeId)) {
      this.activeId = this.tabs[0]?.id ?? null
    }
  }

  /** Pin/unpin a tab. Pinned tabs sort to the front (stable) like VS Code. */
  togglePin(id: string) {
    const tab = this.tabs.find((t) => t.id === id)
    if (!tab) return
    tab.pinned = !tab.pinned
    // Stable partition: pinned keep their relative order, then unpinned.
    const pinned = this.tabs.filter((t) => t.pinned)
    const rest = this.tabs.filter((t) => !t.pinned)
    this.tabs = [...pinned, ...rest]
  }

  get active(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null
  }

  reset() {
    sessionStorage.removeItem(this.storageKey)
    this.tabs = []
    this.activeId = null
    this.nextN = 1
    this.seedConsole()
  }
}
