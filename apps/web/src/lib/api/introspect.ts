import { client, unwrap } from '$lib/api/client'
import { execute } from '$lib/api/transport'
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
  execute(
    'get_schema_tree',
    { connectionId: id, search: search ?? null },
    () =>
      unwrap(
        client.GET('/api/connections/{id}/tree', {
          params: { path: { id }, query: search ? { search } : undefined },
        }),
      ) as Promise<SchemaTree[]>,
  )

export const databasesKey = (id: string) => ['databases', id] as const
export const getDatabases = (id: string): Promise<DatabaseInfo[]> =>
  execute(
    'list_databases',
    { connectionId: id },
    () =>
      unwrap(
        client.GET('/api/connections/{id}/databases', { params: { path: { id } } }),
      ) as Promise<DatabaseInfo[]>,
  )

export const tableDetailKey = (id: string, schema: string, table: string) =>
  ['table-detail', id, schema, table] as const
export const getTableDetail = (id: string, schema: string, table: string): Promise<TableDetail> =>
  execute(
    'get_table_detail',
    { connectionId: id, schema, table },
    () =>
      unwrap(
        client.GET('/api/connections/{id}/tables/{schema}/{table}', {
          params: { path: { id, schema, table } },
        }),
      ) as Promise<TableDetail>,
  )

/** Optional single-column equality filter applied server-side. */
export interface RowFilter {
  column: string
  value: string
}

import {
  getActiveFilterGroup,
  type TableFilterGroup,
} from '$lib/components/data-grid/types/filter.js'

export const rowsKey = (
  id: string,
  schema: string,
  table: string,
  page: number,
  orderBy: string | undefined,
  orderDir: 'ASC' | 'DESC',
  filter?: RowFilter,
  filters?: TableFilterGroup | null,
) =>
  [
    'table-rows',
    id,
    schema,
    table,
    page,
    orderBy,
    orderDir,
    filter ?? null,
    filters ?? null,
  ] as const

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
    filters?: TableFilterGroup | null
  },
): Promise<TableData> => {
  const activeFilters = getActiveFilterGroup(opts.filters)
  const filtersJson = activeFilters ? JSON.stringify(activeFilters) : null

  return execute(
    'get_table_rows',
    {
      connectionId: id,
      schema,
      table,
      params: {
        limit: opts.limit,
        offset: opts.offset,
        orderBy: opts.orderBy ?? null,
        orderDir: opts.orderDir ?? 'ASC',
        filterColumn: opts.filter?.column ?? null,
        filterValue: opts.filter?.value ?? null,
        filters: filtersJson,
      },
    },
    () =>
      unwrap(
        client.GET('/api/connections/{id}/tables/{schema}/{table}/rows', {
          params: {
            path: { id, schema, table },
            query: {
              limit: opts.limit,
              offset: opts.offset,
              ...(opts.orderBy
                ? { order_by: opts.orderBy, order_dir: opts.orderDir ?? 'ASC' }
                : {}),
              ...(opts.filter
                ? { filter_column: opts.filter.column, filter_value: opts.filter.value }
                : {}),
              ...(filtersJson ? { filters: filtersJson } : {}),
            },
          },
        }),
      ) as Promise<TableData>,
  )
}

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
