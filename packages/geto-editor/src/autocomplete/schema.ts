import type { SQLNamespace } from '@codemirror/lang-sql'
import type { Completion } from '@codemirror/autocomplete'
import { withTrailingSpace } from './apply'
import type {
  SQLMetadata,
  SQLMetadataTable,
  SQLMetadataColumn,
  SQLMetadataForeignKey,
} from '../core/types'

export interface CompletionIndex {
  metadata: SQLMetadata
  /** Lowercased bare table name -> matching relations */
  tablesByName: Map<string, SQLMetadataTable[]>
  /** Lowercased `schema.table` AND bare `table` -> its columns */
  columnsByTable: Map<string, SQLMetadataColumn[]>
  /** Lowercased bare table name -> foreign keys declared on it */
  fkByTable: Map<string, SQLMetadataForeignKey[]>
}

// WeakMap cache: guarantees schema is never recalculated on every keystroke!
// Re-indexed only when the metadata object reference changes (e.g. on schema refresh/reconnect).
const indexCache = new WeakMap<SQLMetadata, CompletionIndex>()

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const arr = map.get(key)
  if (arr) arr.push(value)
  else map.set(key, [value])
}

/**
 * Build (and memoize in WeakMap) the derived lookup index from SQLMetadata.
 */
export function buildCompletionIndex(metadata: SQLMetadata = {}): CompletionIndex {
  const cached = indexCache.get(metadata)
  if (cached) return cached

  const tablesByName = new Map<string, SQLMetadataTable[]>()
  for (const t of metadata.tables ?? []) {
    push(tablesByName, t.name.toLowerCase(), t)
  }

  const columnsByTable = new Map<string, SQLMetadataColumn[]>()
  for (const c of metadata.columns ?? []) {
    if (c.schema) {
      push(columnsByTable, `${c.schema}.${c.table}`.toLowerCase(), c)
    }
    push(columnsByTable, c.table.toLowerCase(), c)
  }

  const fkByTable = new Map<string, SQLMetadataForeignKey[]>()
  for (const fk of metadata.foreignKeys ?? []) {
    push(fkByTable, fk.table.toLowerCase(), fk)
  }

  const index: CompletionIndex = {
    metadata,
    tablesByName,
    columnsByTable,
    fkByTable,
  }

  indexCache.set(metadata, index)
  return index
}

/**
 * Build lang-sql's nested namespace (schema -> table -> columns) from the index.
 * Attaches DataGrip-style auto trailing space behavior on table and column completion.
 */
export function buildSqlNamespace(
  index: CompletionIndex,
  needsQuoting: (name: string) => boolean,
): SQLNamespace {
  const root: Record<string, Record<string, SQLNamespace>> = {}

  for (const tbl of index.metadata.tables ?? []) {
    const tableKey = tbl.schema ? `${tbl.schema}.${tbl.name}`.toLowerCase() : tbl.name.toLowerCase()
    const cols: Completion[] = (index.columnsByTable.get(tableKey) ?? []).map((c) =>
      withTrailingSpace({
        label: c.name,
        type: 'property',
        detail: c.type,
      }),
    )

    const schemaName = tbl.schema || 'public'
    const schemaObj = (root[schemaName] ??= {})
    const insertName = needsQuoting(tbl.name) ? `"${tbl.name}"` : tbl.name

    schemaObj[tbl.name] = {
      self: withTrailingSpace(
        { label: tbl.name, type: 'type', detail: tbl.type },
        insertName,
      ),
      children: cols,
    }
  }

  return root as SQLNamespace
}
