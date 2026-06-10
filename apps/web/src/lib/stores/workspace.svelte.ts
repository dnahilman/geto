export type Tab =
  | { kind: 'table'; schema: string; table: string; id: string; title: string }
  | { kind: 'console'; id: string; title: string; n: number; sql: string }

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
        this.activeId = data.tabs.some((t) => t.id === data.activeId)
          ? (data.activeId ?? null)
          : (data.tabs[0]?.id ?? null)
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
      // After splice, tabs[idx] is the right neighbor; tabs[idx-1] is the left.
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
