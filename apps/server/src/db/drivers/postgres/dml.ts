import { quoteIdent } from '$src/db/shared/ident'

export interface Built {
  text: string
  params: unknown[]
}

function rel(schema: string, table: string): string {
  return `${quoteIdent(schema)}.${quoteIdent(table)}`
}

function formatLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

/** Inline `$N` params into the SQL text — for human-readable history only. */
export function inlineParams(text: string, params: unknown[]): string {
  return text.replace(/\$(\d+)/g, (_, n) => formatLiteral(params[Number(n) - 1]))
}

export function buildInsert(schema: string, table: string, values: Record<string, unknown>): Built {
  const cols = Object.keys(values)
  if (cols.length === 0) {
    return { text: `INSERT INTO ${rel(schema, table)} DEFAULT VALUES RETURNING *`, params: [] }
  }
  const placeholders = cols.map((_, i) => `$${i + 1}`)
  const text = `INSERT INTO ${rel(schema, table)} (${cols.map(quoteIdent).join(', ')})
    VALUES (${placeholders.join(', ')}) RETURNING *`
  return { text, params: cols.map((c) => values[c]) }
}

export function buildUpdate(
  schema: string,
  table: string,
  pk: Record<string, unknown>,
  values: Record<string, unknown>,
): Built {
  const setCols = Object.keys(values)
  const whereCols = Object.keys(pk)
  if (setCols.length === 0) throw new Error('No columns to update')
  if (whereCols.length === 0) throw new Error('Refusing to update without a primary key')

  const params: unknown[] = []
  const setClause = setCols
    .map((c) => {
      params.push(values[c])
      return `${quoteIdent(c)} = $${params.length}`
    })
    .join(', ')
  const whereClause = whereCols
    .map((c) => {
      params.push(pk[c])
      return `${quoteIdent(c)} = $${params.length}`
    })
    .join(' AND ')
  return {
    text: `UPDATE ${rel(schema, table)} SET ${setClause} WHERE ${whereClause} RETURNING *`,
    params,
  }
}

export function buildDelete(schema: string, table: string, pk: Record<string, unknown>): Built {
  const whereCols = Object.keys(pk)
  if (whereCols.length === 0) throw new Error('Refusing to delete without a primary key')
  const params: unknown[] = []
  const whereClause = whereCols
    .map((c) => {
      params.push(pk[c])
      return `${quoteIdent(c)} = $${params.length}`
    })
    .join(' AND ')
  return { text: `DELETE FROM ${rel(schema, table)} WHERE ${whereClause} RETURNING *`, params }
}

export interface ColumnSpec {
  name: string
  type: string
  notNull?: boolean
  default?: string | null
  primaryKey?: boolean
}

/** Build a CREATE TABLE from column specs. Types are validated against an allow-list. */
export function buildCreateTable(schema: string, table: string, columns: ColumnSpec[]): string {
  if (columns.length === 0) throw new Error('A table needs at least one column')
  const defs = columns.map((c) => {
    if (!/^[A-Za-z][A-Za-z0-9 _().,\[\]]*$/.test(c.type)) {
      throw new Error(`Invalid column type: ${c.type}`)
    }
    let def = `${quoteIdent(c.name)} ${c.type}`
    if (c.notNull) def += ' NOT NULL'
    if (c.default != null && c.default !== '') def += ` DEFAULT ${c.default}`
    return def
  })
  const pks = columns.filter((c) => c.primaryKey).map((c) => quoteIdent(c.name))
  if (pks.length) defs.push(`PRIMARY KEY (${pks.join(', ')})`)
  return `CREATE TABLE ${quoteIdent(schema)}.${quoteIdent(table)} (\n  ${defs.join(',\n  ')}\n)`
}
