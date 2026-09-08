// Pure relation resolver. Turns a table's foreign keys (from table-detail)
// plus (schema, table, columns, primaryKey) into a per-column relation
// descriptor used by the grid's relation viewer.
//
// Two directions:
//  - forward: a column points AT another table (a real single-column FK). One target.
//  - reverse: a PK column is pointed at BY other tables (children). 0..n targets.
//
// Single-column equality only; composite-key relations are skipped (the SQL console covers those).
import type { CompletionForeignKey } from '$lib/types/server'

export type RelationTarget =
  | {
      dir: 'forward'
      schema: string
      table: string
      /** The referenced column on the target table (the equality key). */
      column: string
      /** The source column whose value we filter by. */
      fromColumn: string
      virtual?: boolean
    }
  | {
      dir: 'reverse'
      schema: string
      table: string
      /** The child column that references our PK (the equality key). */
      column: string
      virtual?: boolean
    }

export type ForwardTarget = Extract<RelationTarget, { dir: 'forward' }>
export type ReverseTarget = Extract<RelationTarget, { dir: 'reverse' }>

export type RelationDescriptor =
  | { dir: 'forward'; target: ForwardTarget }
  | { dir: 'reverse'; targets: ReverseTarget[] }

const lc = (s: string) => s.toLowerCase()

export function buildRelationMap(
  foreignKeys: CompletionForeignKey[],
  schema: string,
  table: string,
  columns: { name: string }[],
  _primaryKey: string[] = [],
): (RelationDescriptor | null)[] {
  // Single-column FKs declared on (schema, table), keyed by lowercased source column.
  const forwardFk = new Map<string, { schema: string; table: string; column: string }>()
  for (const fk of foreignKeys) {
    if (lc(fk.schema) !== lc(schema) || lc(fk.table) !== lc(table)) continue
    if (fk.columns.length !== 1 || fk.refColumns.length !== 1) continue
    forwardFk.set(lc(fk.columns[0]), {
      schema: fk.refSchema,
      table: fk.refTable,
      column: fk.refColumns[0],
    })
  }

  function forwardFor(name: string): ForwardTarget | null {
    const real = forwardFk.get(lc(name))
    if (!real) return null
    return {
      dir: 'forward',
      schema: real.schema,
      table: real.table,
      column: real.column,
      fromColumn: name,
      virtual: false,
    }
  }

  return columns.map((c): RelationDescriptor | null => {
    const fwd = forwardFor(c.name)
    if (fwd) return { dir: 'forward', target: fwd }
    return null
  })
}
