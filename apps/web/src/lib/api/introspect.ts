import { client, unwrap } from '$lib/api/client'
import type {
  DatabaseInfo,
  SchemaTree,
  ColumnInfo,
  IndexInfo,
  ConstraintInfo,
  CompletionForeignKey,
  QueryResult,
} from '$lib/types/server'

export type {
  DatabaseInfo,
  SchemaTree,
  ColumnInfo,
  IndexInfo,
  ConstraintInfo,
  CompletionForeignKey,
  QueryResult,
}

export interface TableDetail {
  columns: ColumnInfo[]
  indexes: IndexInfo[]
  constraints: ConstraintInfo[]
  primaryKey: string[]
  foreignKeys: CompletionForeignKey[]
}

export interface TableData {
  result: QueryResult
  durationMs: number
}

export const treeKey = (id: string) => ['tree', id] as const
export const getTree = (id: string, search?: string): Promise<SchemaTree[]> =>
  unwrap(
    client.GET('/api/connections/{id}/tree', {
      params: { path: { id }, query: search ? { search } : undefined },
    }),
  ) as Promise<SchemaTree[]>

export const databasesKey = (id: string) => ['databases', id] as const
export const getDatabases = (id: string): Promise<DatabaseInfo[]> =>
  unwrap(client.GET('/api/connections/{id}/databases', { params: { path: { id } } })) as Promise<
    DatabaseInfo[]
  >

export const tableDetailKey = (id: string, schema: string, table: string) =>
  ['table-detail', id, schema, table] as const
export const getTableDetail = (id: string, schema: string, table: string): Promise<TableDetail> =>
  unwrap(
    client.GET('/api/connections/{id}/tables/{schema}/{table}', {
      params: { path: { id, schema, table } },
    }),
  ) as Promise<TableDetail>

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
    client.GET('/api/connections/{id}/tables/{schema}/{table}/rows', {
      params: {
        path: { id, schema, table },
        query: {
          limit: opts.limit,
          offset: opts.offset,
          ...(opts.orderBy ? { order_by: opts.orderBy, order_dir: opts.orderDir ?? 'ASC' } : {}),
          ...(opts.filter
            ? { filter_column: opts.filter.column, filter_value: opts.filter.value }
            : {}),
        },
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
