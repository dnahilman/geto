export type Tab =
  | { kind: 'table'; schema: string; table: string; id: string; title: string }
  | { kind: 'console'; id: string; title: string }

export class Workspace {
  tabs = $state<Tab[]>([])
  activeId = $state<string | null>(null)

  openTable(schema: string, table: string) {
    const id = `t:${schema}.${table}`
    if (!this.tabs.some((t) => t.id === id)) {
      this.tabs.push({ kind: 'table', schema, table, id, title: table })
    }
    this.activeId = id
  }

  openConsole() {
    const id = 'console'
    if (!this.tabs.some((t) => t.id === id)) {
      this.tabs.push({ kind: 'console', id, title: 'SQL console' })
    }
    this.activeId = id
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

  /** Close all tabs — e.g. when switching to a different database. */
  reset() {
    this.tabs = []
    this.activeId = null
  }
}
