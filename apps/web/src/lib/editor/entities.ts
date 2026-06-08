// Lightweight (no monaco import) shared store of schema entities for completion.
// The console writes them; the monaco completion service reads them. A derived
// index (built lazily, memoised per entities object) gives the completion
// service fast lookups: columns by table, relations by bare name, FKs by table.
export interface CompletionTable {
  schema: string
  name: string
  type: 'table' | 'view' | 'matview'
}
export interface CompletionColumn {
  schema: string
  table: string
  name: string
  type: string
}
export interface CompletionFunction {
  schema: string
  name: string
  args: string
  returns: string
  kind: 'function' | 'procedure' | 'aggregate' | 'window'
}
export interface CompletionForeignKey {
  schema: string
  table: string
  columns: string[]
  refSchema: string
  refTable: string
  refColumns: string[]
}

export interface CompletionEntities {
  tables: CompletionTable[]
  columns: CompletionColumn[]
  functions: CompletionFunction[]
  foreignKeys: CompletionForeignKey[]
}

export interface CompletionIndex {
  entities: CompletionEntities
  /** Lowercased bare table name → matching relations (to detect ambiguity). */
  tablesByName: Map<string, CompletionTable[]>
  /** Lowercased `schema.table` AND bare `table` → its columns. */
  columnsByTable: Map<string, CompletionColumn[]>
  /** Lowercased bare table name → foreign keys declared on it. */
  fkByTable: Map<string, CompletionForeignKey[]>
}

let entities: CompletionEntities = { tables: [], columns: [], functions: [], foreignKeys: [] }
let index: CompletionIndex | null = null

export function setCompletionEntities(e: Partial<CompletionEntities>) {
  entities = {
    tables: e.tables ?? [],
    columns: e.columns ?? [],
    functions: e.functions ?? [],
    foreignKeys: e.foreignKeys ?? [],
  }
  index = null // invalidate derived index; rebuilt lazily on next read
}

export function getCompletionEntities(): CompletionEntities {
  return entities
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

/** Build (and memoise) the derived lookup index from the current entities. */
export function getCompletionIndex(): CompletionIndex {
  if (index && index.entities === entities) return index

  const tablesByName = new Map<string, CompletionTable[]>()
  for (const t of entities.tables) push(tablesByName, t.name.toLowerCase(), t)

  const columnsByTable = new Map<string, CompletionColumn[]>()
  for (const c of entities.columns) {
    push(columnsByTable, `${c.schema}.${c.table}`.toLowerCase(), c)
    push(columnsByTable, c.table.toLowerCase(), c)
  }

  const fkByTable = new Map<string, CompletionForeignKey[]>()
  for (const fk of entities.foreignKeys) push(fkByTable, fk.table.toLowerCase(), fk)

  index = { entities, tablesByName, columnsByTable, fkByTable }
  return index
}
