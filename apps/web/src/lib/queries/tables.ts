import { queryOptions, keepPreviousData } from '@tanstack/svelte-query'
import { getTableRows, getTableDetail, type RowFilter } from '$lib/api/introspect'

export const tableQueries = {
  rowsRootKey: (connId: string, schema: string, tableName: string, filter?: RowFilter | null) =>
    ['table-rows', connId, schema, tableName, filter ?? null] as const,

  rows: (
    connId: string,
    schema: string,
    tableName: string,
    opts: {
      limit: number
      offset: number
      orderBy?: string
      orderDir?: 'ASC' | 'DESC'
      filter?: RowFilter
    },
  ) =>
    queryOptions({
      queryKey: [
        ...tableQueries.rowsRootKey(connId, schema, tableName, opts.filter),
        Math.floor(opts.offset / opts.limit),
        opts.limit,
        opts.orderBy,
        opts.orderDir,
      ] as const,
      queryFn: () => getTableRows(connId, schema, tableName, opts),
      placeholderData: keepPreviousData,
    }),

  detail: (connId: string, schema: string, tableName: string) =>
    queryOptions({
      queryKey: ['table-detail', connId, schema, tableName] as const,
      queryFn: () => getTableDetail(connId, schema, tableName),
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      retry: false,
    }),
}
