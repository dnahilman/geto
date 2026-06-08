import { client, unwrap } from '$lib/api/eden'
import type { QueryResult } from '@geto/server'

const conn = (id: string) => client.api.connections({ id })
const tbl = (id: string, schema: string, table: string) =>
  conn(id).tables({ schema })({ table })

export type Row = Record<string, unknown>

export const insertRow = (id: string, schema: string, table: string, values: Row) =>
  unwrap(tbl(id, schema, table).rows.post({ values })) as Promise<QueryResult>

export const updateRow = (id: string, schema: string, table: string, pk: Row, values: Row) =>
  unwrap(tbl(id, schema, table).rows.patch({ pk, values })) as Promise<QueryResult>

export const deleteRow = (id: string, schema: string, table: string, pk: Row) =>
  unwrap(tbl(id, schema, table).rows.delete({ pk })) as Promise<QueryResult>

export interface ColumnSpec {
  name: string
  type: string
  notNull?: boolean
  default?: string | null
  primaryKey?: boolean
}

export const createTable = (id: string, schema: string, name: string, columns: ColumnSpec[]) =>
  unwrap(conn(id).tables.post({ schema, name, columns }))

export const dropTable = (id: string, schema: string, table: string) =>
  unwrap(tbl(id, schema, table).delete())

export const truncateTable = (id: string, schema: string, table: string) =>
  unwrap(tbl(id, schema, table).truncate.post())

export const createDatabase = (id: string, name: string) =>
  unwrap(conn(id).databases.post({ name }))

export const dropDatabase = (id: string, name: string) =>
  unwrap(conn(id).databases({ name }).delete())
