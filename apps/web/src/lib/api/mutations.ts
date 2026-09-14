import { client, unwrap } from '$lib/api/client'
import { execute } from '$lib/api/transport'
import type { QueryResult } from '$lib/types/server'

export type Row = Record<string, unknown>

export const insertRow = (id: string, schema: string, table: string, values: Row) =>
  execute('insert_table_row', { connectionId: id, schema, table, values }, () =>
    unwrap(
      client.POST('/api/connections/{id}/tables/{schema}/{table}/rows', {
        params: { path: { id, schema, table } },
        body: { values },
      }),
    ) as Promise<QueryResult>,
  )

export const updateRow = (id: string, schema: string, table: string, pk: Row, values: Row) =>
  execute('update_table_row', { connectionId: id, schema, table, pk, values }, () =>
    unwrap(
      client.PATCH('/api/connections/{id}/tables/{schema}/{table}/rows', {
        params: { path: { id, schema, table } },
        body: { pk, values },
      }),
    ) as Promise<QueryResult>,
  )

export const deleteRow = (id: string, schema: string, table: string, pk: Row) =>
  execute('delete_table_row', { connectionId: id, schema, table, pk }, () =>
    unwrap(
      client.DELETE('/api/connections/{id}/tables/{schema}/{table}/rows', {
        params: { path: { id, schema, table } },
        body: { pk },
      }),
    ) as Promise<QueryResult>,
  )

export interface ColumnSpec {
  name: string
  type: string
  notNull?: boolean
  default?: string | null
  primaryKey?: boolean
}

export const createTable = (id: string, schema: string, name: string, columns: ColumnSpec[]) =>
  execute('create_table', { connectionId: id, body: { schema, name, columns } }, () =>
    unwrap(
      client.POST('/api/connections/{id}/tables', {
        params: { path: { id } },
        body: { schema, name, columns },
      }),
    ),
  )

export const dropTable = (id: string, schema: string, table: string) =>
  execute('drop_table', { connectionId: id, schema, table }, () =>
    unwrap(
      client.DELETE('/api/connections/{id}/tables/{schema}/{table}', {
        params: { path: { id, schema, table } },
      }),
    ),
  )

export const truncateTable = (id: string, schema: string, table: string) =>
  execute('truncate_table', { connectionId: id, schema, table }, () =>
    unwrap(
      client.POST('/api/connections/{id}/tables/{schema}/{table}/truncate', {
        params: { path: { id, schema, table } },
      }),
    ),
  )

export const createDatabase = (id: string, name: string) =>
  execute('create_database', { connectionId: id, name }, () =>
    unwrap(
      client.POST('/api/connections/{id}/databases', {
        params: { path: { id } },
        body: { name },
      }),
    ),
  )

export const dropDatabase = (id: string, name: string) =>
  execute('drop_database', { connectionId: id, name }, () =>
    unwrap(
      client.DELETE('/api/connections/{id}/databases/{name}', {
        params: { path: { id, name } },
      }),
    ),
  )
