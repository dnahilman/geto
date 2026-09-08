import { client, unwrap } from '$lib/api/client'
import type { QueryResult } from '$lib/types/server'

export type Row = Record<string, unknown>

export const insertRow = (id: string, schema: string, table: string, values: Row) =>
  unwrap(
    client.POST('/api/connections/{id}/tables/{schema}/{table}/rows', {
      params: { path: { id, schema, table } },
      body: { values },
    }),
  ) as Promise<QueryResult>

export const updateRow = (id: string, schema: string, table: string, pk: Row, values: Row) =>
  unwrap(
    client.PATCH('/api/connections/{id}/tables/{schema}/{table}/rows', {
      params: { path: { id, schema, table } },
      body: { pk, values },
    }),
  ) as Promise<QueryResult>

export const deleteRow = (id: string, schema: string, table: string, pk: Row) =>
  unwrap(
    client.DELETE('/api/connections/{id}/tables/{schema}/{table}/rows', {
      params: { path: { id, schema, table } },
      body: { pk },
    }),
  ) as Promise<QueryResult>

export interface ColumnSpec {
  name: string
  type: string
  notNull?: boolean
  default?: string | null
  primaryKey?: boolean
}

export const createTable = (id: string, schema: string, name: string, columns: ColumnSpec[]) =>
  unwrap(
    client.POST('/api/connections/{id}/tables', {
      params: { path: { id } },
      body: { schema, name, columns },
    }),
  )

export const dropTable = (id: string, schema: string, table: string) =>
  unwrap(
    client.DELETE('/api/connections/{id}/tables/{schema}/{table}', {
      params: { path: { id, schema, table } },
    }),
  )

export const truncateTable = (id: string, schema: string, table: string) =>
  unwrap(
    client.POST('/api/connections/{id}/tables/{schema}/{table}/truncate', {
      params: { path: { id, schema, table } },
    }),
  )

export const createDatabase = (id: string, name: string) =>
  unwrap(
    client.POST('/api/connections/{id}/databases', {
      params: { path: { id } },
      body: { name },
    }),
  )

export const dropDatabase = (id: string, name: string) =>
  unwrap(
    client.DELETE('/api/connections/{id}/databases/{name}', {
      params: { path: { id, name } },
    }),
  )
