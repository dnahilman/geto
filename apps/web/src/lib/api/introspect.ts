import { client, unwrap } from '$lib/api/eden'
import type {
  DatabaseInfo,
  SchemaTree,
  ColumnInfo,
  IndexInfo,
  ConstraintInfo,
  QueryResult,
} from '@geto/server'

export type { DatabaseInfo, SchemaTree, ColumnInfo, IndexInfo, ConstraintInfo, QueryResult }

export interface TableDetail {
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  constraints: ConstraintInfo[]
  primaryKey: string[]
}

export interface TableData {
  result: QueryResult
  estimatedRows: number
  durationMs: number
}

const conn = (id: string) => client.api.connections({ id })

export const treeKey = (id: string) => ['tree', id] as const
export const getTree = (id: string, search?: string): Promise<SchemaTree[]> =>
  unwrap(conn(id).tree.get(search ? { query: { search } } : undefined)) as Promise<SchemaTree[]>

export const databasesKey = (id: string) => ['databases', id] as const
export const getDatabases = (id: string): Promise<DatabaseInfo[]> =>
  unwrap(conn(id).databases.get()) as Promise<DatabaseInfo[]>

export const tableDetailKey = (id: string, schema: string, table: string) =>
  ['table-detail', id, schema, table] as const
export const getTableDetail = (id: string, schema: string, table: string): Promise<TableDetail> =>
  unwrap(conn(id).tables({ schema })({ table }).get()) as Promise<TableDetail>

/** Optional single-column equality filter applied server-side. */
export interface RowFilter {
  column: string
  value: string
}

export const tableRowsKey = (
  id: string,
  schema: string,
  table: string,
  page: number,
  orderBy: string | undefined,
  orderDir: 'ASC' | 'DESC',
  filter?: RowFilter,
) => ['table-rows', id, schema, table, page, orderBy, orderDir, filter ?? null] as const

export const getTableRows = (
  id: string,
  schema: string,
  table: string,
  opts: {
    limit: number
    offset: number
    orderBy?: string
    orderDir?: 'ASC' | 'DESC'
    filter?: RowFilter
  },
): Promise<TableData> =>
  unwrap(
    conn(id)
      .tables({ schema })({ table })
      .rows.get({
        query: {
          limit: opts.limit,
          offset: opts.offset,
          ...(opts.orderBy ? { orderBy: opts.orderBy, orderDir: opts.orderDir ?? 'ASC' } : {}),
          ...(opts.filter
            ? { filterColumn: opts.filter.column, filterValue: opts.filter.value }
            : {}),
        },
      }),
  ) as Promise<TableData>

/** Fetch rows of `schema.table` where `column = value` — the relation viewer's data source. */
export const getRelatedRows = (
  id: string,
  schema: string,
  table: string,
  column: string,
  value: string,
  limit = 50,
  offset = 0,
): Promise<TableData> =>
  getTableRows(id, schema, table, { limit, offset, filter: { column, value } })
