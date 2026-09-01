import type { BuiltStatement, ColumnSpec } from '$src/db/types'

export function quoteIdent(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`'
}

function rel(schema: string | null, table: string): string {
  return schema ? `${quoteIdent(schema)}.${quoteIdent(table)}` : quoteIdent(table)
}

function formatLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return `'${String(v).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`
}

/** Inline `?` positional params into the SQL text — for human-readable history only. */
export function inlineParams(text: string, params: unknown[]): string {
  let i = 0
  return text.replace(/\?/g, () => (i < params.length ? formatLiteral(params[i++]) : '?'))
}

export function buildInsert(
  schema: string | null,
  table: string,
  values: Record<string, unknown>,
): BuiltStatement {
  const cols = Object.keys(values)
  if (cols.length === 0) {
    return { text: `INSERT INTO ${rel(schema, table)} () VALUES ()`, params: [] }
  }
  const placeholders = cols.map(() => '?')
  const text = `INSERT INTO ${rel(schema, table)} (${cols.map(quoteIdent).join(', ')})
    VALUES (${placeholders.join(', ')})`
  return { text, params: cols.map((c) => values[c]) }
}

export function buildUpdate(
  schema: string | null,
  table: string,
  pk: Record<string, unknown>,
  values: Record<string, unknown>,
): BuiltStatement {
  const setCols = Object.keys(values)
  const whereCols = Object.keys(pk)
  if (setCols.length === 0) throw new Error('No columns to update')
  if (whereCols.length === 0) throw new Error('Refusing to update without a primary key')

  const params: unknown[] = []
  const setClause = setCols
    .map((c) => {
      params.push(values[c])
      return `${quoteIdent(c)} = ?`
    })
    .join(', ')
  const whereClause = whereCols
    .map((c) => {
      params.push(pk[c])
      return `${quoteIdent(c)} = ?`
    })
    .join(' AND ')
  return {
    text: `UPDATE ${rel(schema, table)} SET ${setClause} WHERE ${whereClause}`,
    params,
  }
}

export function buildDelete(
  schema: string | null,
  table: string,
  pk: Record<string, unknown>,
): BuiltStatement {
  const whereCols = Object.keys(pk)
  if (whereCols.length === 0) throw new Error('Refusing to delete without a primary key')
  const params: unknown[] = []
  const whereClause = whereCols
    .map((c) => {
      params.push(pk[c])
      return `${quoteIdent(c)} = ?`
    })
    .join(' AND ')
  return { text: `DELETE FROM ${rel(schema, table)} WHERE ${whereClause}`, params }
}

/** Build a CREATE TABLE from column specs for MySQL. */
export function buildCreateTable(
  schema: string | null,
  table: string,
  columns: ColumnSpec[],
): string {
  if (columns.length === 0) throw new Error('A table needs at least one column')
  const defs = columns.map((c) => {
    let def = `${quoteIdent(c.name)} ${c.type}`
    if (c.notNull) def += ' NOT NULL'
    if (c.default != null && c.default !== '') def += ` DEFAULT ${c.default}`
    return def
  })
  const pks = columns.filter((c) => c.primaryKey).map((c) => quoteIdent(c.name))
  if (pks.length) defs.push(`PRIMARY KEY (${pks.join(', ')})`)
  return `CREATE TABLE ${rel(schema, table)} (\n  ${defs.join(',\n  ')}\n)`
}
