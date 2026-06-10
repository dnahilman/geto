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

export const tableRowsKey = (
  id: string,
  schema: string,
  table: string,
  page: number,
  orderBy: string | undefined,
  orderDir: 'ASC' | 'DESC',
) => ['table-rows', id, schema, table, page, orderBy, orderDir] as const

export const getTableRows = (
  id: string,
  schema: string,
  table: string,
  opts: { limit: number; offset: number; orderBy?: string; orderDir?: 'ASC' | 'DESC' },
): Promise<TableData> =>
  unwrap(
    conn(id)
      .tables({ schema })({ table })
      .rows.get({
        query: {
          limit: opts.limit,
          offset: opts.offset,
          ...(opts.orderBy ? { orderBy: opts.orderBy, orderDir: opts.orderDir ?? 'ASC' } : {}),
        },
      }),
  ) as Promise<TableData>
