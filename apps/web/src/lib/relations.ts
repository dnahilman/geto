// Pure relation resolver. Turns the connection's completion metadata (tables,
// columns, foreign keys) plus a result's (schema, table, columns, primaryKey)
// into a per-column relation descriptor used by the grid's relation viewer.
//
// Two directions:
//  - forward: a column points AT another table (a real single-column FK, or a
//    `*_id` / `*Id` name heuristic when no constraint exists). One target.
//  - reverse: a PK column is pointed at BY other tables (children). 0..n targets.
//
// No I/O, no Svelte — trivially unit-testable. Single-column equality only;
// composite-key relations are skipped (the SQL console covers those).
import type { CompletionData } from '$lib/api/query'

export type RelationTarget =
  | {
      dir: 'forward'
      schema: string
      table: string
      /** The referenced column on the target table (the equality key). */
      column: string
      /** The source column whose value we filter by. */
      fromColumn: string
      /** True when inferred from a name, not a real FK constraint. */
      virtual: boolean
    }
  | {
      dir: 'reverse'
      schema: string
      table: string
      /** The child column that references our PK (the equality key). */
      column: string
      virtual: boolean
    }

export type ForwardTarget = Extract<RelationTarget, { dir: 'forward' }>
export type ReverseTarget = Extract<RelationTarget, { dir: 'reverse' }>

export type RelationDescriptor =
  | { dir: 'forward'; target: ForwardTarget }
  | { dir: 'reverse'; targets: ReverseTarget[] }

const lc = (s: string) => s.toLowerCase()

/** Crude English singularizer — good enough for table-name matching. */
function singular(s: string): string {
  if (/ies$/i.test(s)) return s.slice(0, -3) + 'y'
  if (/s$/i.test(s) && !/ss$/i.test(s)) return s.slice(0, -1)
  return s
}

/** Lowercased candidate table names for a base noun (`user` → user, users, …). */
function nameVariants(base: string): string[] {
  const b = lc(base)
  const out = new Set<string>([b, b + 's', b + 'es', singular(b)])
  if (/y$/.test(b)) out.add(b.slice(0, -1) + 'ies')
  return [...out]
}

/** Match `<col>` against `<base>_id` or `<base>Id`; returns the base or null. */
function fkBaseOf(col: string): string | null {
  const m = /^(.+?)_?id$/i.exec(col)
  return m && m[1] ? m[1] : null
}

export function buildRelationMap(
  comp: CompletionData,
  schema: string,
  table: string,
  columns: { name: string }[],
  primaryKey: string[],
): (RelationDescriptor | null)[] {
  // ---- lookups ----
  const tablesByName = new Map<string, { schema: string; name: string }[]>()
  for (const t of comp.tables) {
    const k = lc(t.name)
    ;(tablesByName.get(k) ?? tablesByName.set(k, []).get(k)!).push(t)
  }
  const colsByTable = new Map<string, Set<string>>()
  for (const c of comp.columns) {
    const k = `${lc(c.schema)}.${lc(c.table)}`
    ;(colsByTable.get(k) ?? colsByTable.set(k, new Set()).get(k)!).add(lc(c.name))
  }
  // Single-column FKs declared on (schema, table), keyed by lowercased source column.
  const forwardFk = new Map<string, { schema: string; table: string; column: string }>()
  for (const fk of comp.foreignKeys) {
    if (lc(fk.schema) !== lc(schema) || lc(fk.table) !== lc(table)) continue
    if (fk.columns.length !== 1 || fk.refColumns.length !== 1) continue
    forwardFk.set(lc(fk.columns[0]), {
      schema: fk.refSchema,
      table: fk.refTable,
      column: fk.refColumns[0],
    })
  }

  const pkSet = new Set(primaryKey.map(lc))

  /** Resolve where the target lives, preferring the same schema. */
  function findTable(base: string): { schema: string; name: string } | null {
    const variants = nameVariants(base)
    let fallback: { schema: string; name: string } | null = null
    for (const v of variants) {
      const matches = tablesByName.get(v)
      if (!matches?.length) continue
      const same = matches.find((m) => lc(m.schema) === lc(schema))
      if (same) return same
      fallback ??= matches[0]
    }
    return fallback
  }

  function forwardFor(name: string): ForwardTarget | null {
    const real = forwardFk.get(lc(name))
    if (real) {
      return {
        dir: 'forward',
        schema: real.schema,
        table: real.table,
        column: real.column,
        fromColumn: name,
        virtual: false,
      }
    }
    const base = fkBaseOf(name)
    if (!base) return null
    const target = findTable(base)
    if (!target) return null
    // Only infer when the target has an `id` column to equality-match against.
    if (!colsByTable.get(`${lc(target.schema)}.${lc(target.name)}`)?.has('id')) return null
    return {
      dir: 'forward',
      schema: target.schema,
      table: target.name,
      column: 'id',
      fromColumn: name,
      virtual: true,
    }
  }

  function reverseFor(name: string): ReverseTarget[] {
    const seen = new Set<string>()
    const out: ReverseTarget[] = []
    const add = (t: ReverseTarget) => {
      const k = `${lc(t.schema)}.${lc(t.table)}.${lc(t.column)}`
      if (seen.has(k)) return
      seen.add(k)
      out.push(t)
    }
    // Real children: single-column FKs whose ref is our (schema, table) + this PK col.
    for (const fk of comp.foreignKeys) {
      if (fk.columns.length !== 1 || fk.refColumns.length !== 1) continue
      if (lc(fk.refSchema) !== lc(schema) || lc(fk.refTable) !== lc(table)) continue
      if (lc(fk.refColumns[0]) !== lc(name)) continue
      add({
        dir: 'reverse',
        schema: fk.schema,
        table: fk.table,
        column: fk.columns[0],
        virtual: false,
      })
    }
    // Virtual children: tables with a `<singular(table)>_id` / `<singular>Id` column,
    // but only meaningful when `name` is the conventional `id` PK.
    if (lc(name) === 'id') {
      const base = lc(singular(table))
      const wanted = new Set([`${base}_id`, `${base}id`])
      for (const [key, cols] of colsByTable) {
        const [tSchema, tName] = key.split('.')
        if (tName === lc(table) && tSchema === lc(schema)) continue
        for (const want of wanted) {
          if (!cols.has(want)) continue
          const real = comp.columns.find((c) => lc(c.schema) === tSchema && lc(c.table) === tName)
          if (real)
            add({
              dir: 'reverse',
              schema: real.schema,
              table: real.table,
              column: want,
              virtual: true,
            })
        }
      }
    }
    return out
  }

  return columns.map((c): RelationDescriptor | null => {
    const fwd = forwardFor(c.name)
    if (fwd) return { dir: 'forward', target: fwd }
    if (pkSet.has(lc(c.name))) {
      const targets = reverseFor(c.name)
      if (targets.length) return { dir: 'reverse', targets }
    }
    return null
  })
}
