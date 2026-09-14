/** A single-column equality filter carried by a table tab (from the relation viewer). */
export interface TabFilter {
  column: string
  value: string
  label: string
}

export type TableViewMode = 'table' | 'json' | 'structure'

export type Tab =
  | {
      kind: 'table'
      schema: string
      table: string
      id: string
      title: string
      filter?: TabFilter
      pinned?: boolean
      view?: TableViewMode
    }
  | { kind: 'console'; id: string; title: string; n: number; sql: string; pinned?: boolean }
  // Redis (key-value) tabs — same store, never mixed with SQL tabs (a connection
  // is a single provider).
  | { kind: 'rconsole'; id: string; title: string; n: number; cmd: string; pinned?: boolean }
  | { kind: 'rkey'; id: string; title: string; key: string; pinned?: boolean }

/** Which seed console a fresh/empty workspace opens. */
export type WorkspaceKind = 'relational' | 'keyvalue'

export class Workspace {
  readonly connId: string
  tabs = $state<Tab[]>([])
  activeId = $state<string | null>(null)
  nextN = $state(1)
  readonly kind: WorkspaceKind

  constructor(connId: string, kind: WorkspaceKind = 'relational') {
    this.connId = connId
    this.kind = kind
    if (import.meta.env.DEV) {
      console.debug(`[Workspace] initialized for connection "${connId}" (${kind})`)
    }
  }

  openTable(schema: string, table: string, filter?: TabFilter) {
    // A filtered view is a distinct tab so it can coexist with the full table.
    const id = filter
      ? `t:${schema}.${table}|${filter.column}=${filter.value}`
      : `t:${schema}.${table}`
    if (!this.tabs.some((t) => t.id === id)) {
      if (import.meta.env.DEV) {
        console.debug(`[Workspace] openTable: ${schema}.${table}`)
      }
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
    if (import.meta.env.DEV) {
      console.debug(`[Workspace] openConsole #${n}`)
    }
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
    if (import.meta.env.DEV) {
      console.debug(`[Workspace] openRedisConsole #${n}`)
    }
    this.tabs.push({ kind: 'rconsole', id, title: `Redis #${n}`, n, cmd: '' })
    this.activeId = id
  }

  /** Open (or focus) a tab showing a Redis key's value. */
  openKey(key: string) {
    const id = `k:${key}`
    if (!this.tabs.some((t) => t.id === id)) {
      if (import.meta.env.DEV) {
        console.debug(`[Workspace] openKey: ${key}`)
      }
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
    if (import.meta.env.DEV) {
      console.debug(`[Workspace] close tab: ${id}`)
    }
    const nextActiveId =
      this.activeId === id
        ? (this.tabs[idx + 1]?.id ?? this.tabs[idx - 1]?.id ?? null)
        : this.activeId
    this.tabs = this.tabs.filter((t) => t.id !== id)
    this.activeId = nextActiveId
  }

  /** Close every tab except `id` and any pinned tabs (VS Code "Close Others"). */
  closeOthers(id: string) {
    if (import.meta.env.DEV) {
      console.debug(`[Workspace] closeOthers except: ${id}`)
    }
    this.tabs = this.tabs.filter((t) => t.id === id || t.pinned)
    if (!this.tabs.some((t) => t.id === this.activeId)) {
      this.activeId = this.tabs.find((t) => t.id === id)?.id ?? this.tabs[0]?.id ?? null
    }
  }

  /** Close all tabs except pinned ones (pinning protects a tab from Close All). */
  closeAll() {
    if (import.meta.env.DEV) {
      console.debug('[Workspace] closeAll')
    }
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
    if (import.meta.env.DEV) {
      console.debug(`[Workspace] togglePin: ${id} -> ${tab.pinned ? 'pinned' : 'unpinned'}`)
    }
    // Stable partition: pinned keep their relative order, then unpinned.
    const pinned = this.tabs.filter((t) => t.pinned)
    const rest = this.tabs.filter((t) => !t.pinned)
    this.tabs = [...pinned, ...rest]
  }

  get active(): Tab | null {
    return this.tabs.find((t) => t.id === this.activeId) ?? null
  }

  setView(tabId: string, view: TableViewMode) {
    const tab = this.tabs.find((t) => t.id === tabId)
    if (tab?.kind === 'table') {
      tab.view = view
    }
  }

  reset() {
    if (import.meta.env.DEV) {
      console.debug(`[Workspace] reset connection: ${this.connId}`)
    }
    this.tabs = []
    this.activeId = null
    this.nextN = 1
  }
}

/** Global in-memory registry of workspaces by connection ID. */
const workspaceStores = new Map<string, Workspace>()

export function getWorkspace(connId: string, kind: WorkspaceKind = 'relational'): Workspace {
  let ws = workspaceStores.get(connId)
  if (!ws || ws.kind !== kind) {
    ws = new Workspace(connId, kind)
    workspaceStores.set(connId, ws)
  }
  return ws
}

export function removeWorkspace(connId: string) {
  workspaceStores.delete(connId)
}
