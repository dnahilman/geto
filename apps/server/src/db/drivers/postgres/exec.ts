import type { Sql } from './pool'
import { marshalValue, typeName, type ColumnMeta, type QueryResult } from '../../shared/marshal'

interface RawResult extends Array<unknown[]> {
  // porsager exposes `table` (source table OID) and `number` (source attnum) per column.
  columns?: { name: string; type: number; table?: number; number?: number }[]
  command?: string
  count?: number
}

/** Execute arbitrary SQL and return a marshalled, grid-ready result. */
export async function executeSql(
  sql: Sql,
  text: string,
  params: unknown[] = [],
): Promise<QueryResult> {
  const raw = (await sql.unsafe(text, params as never[]).values()) as RawResult
  const columns: ColumnMeta[] = (raw.columns ?? []).map((c) => ({
    name: c.name,
    dataTypeID: c.type,
    typeName: typeName(c.type),
    sourceTable: c.table,
    sourceColumn: c.number,
  }))
  const rows = raw.map((row) => row.map(marshalValue))
  return {
    columns,
    rows,
    rowCount: raw.count ?? rows.length,
    command: raw.command ?? null,
  }
}
