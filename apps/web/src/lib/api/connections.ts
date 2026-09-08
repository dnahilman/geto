import { client, unwrap } from '$lib/api/client'
import type { Connection, ConnectionInput, ProviderMeta, SslMode, TestResult } from '$lib/types/server'

export type { Connection, ConnectionInput, ProviderMeta, SslMode, TestResult }

export const providersKey = ['providers'] as const
export const getProviders = (): Promise<ProviderMeta[]> =>
  unwrap(client.GET('/api/providers'))

export const connectionsKey = ['connections'] as const

export const listConnections = (): Promise<Connection[]> =>
  unwrap(client.GET('/api/connections'))

export const createConnection = (input: ConnectionInput): Promise<Connection> =>
  unwrap(client.POST('/api/connections', { body: input }))

export const updateConnection = (id: string, input: ConnectionInput): Promise<Connection> =>
  unwrap(client.PATCH('/api/connections/{id}', { params: { path: { id } }, body: input }))

export const deleteConnection = (id: string): Promise<{ deleted: boolean }> =>
  unwrap(client.DELETE('/api/connections/{id}', { params: { path: { id } } }))

export const switchDatabase = (id: string, name: string): Promise<Connection> =>
  unwrap(client.POST('/api/connections/{id}/database', { params: { path: { id } }, body: { name } }))

export const testNewConnection = (input: ConnectionInput): Promise<TestResult> =>
  unwrap(client.POST('/api/connections/test', { body: input }))

export const testSavedConnection = (id: string): Promise<TestResult> =>
  unwrap(client.POST('/api/connections/{id}/test', { params: { path: { id } } }))

export const getConnectionString = (id: string, withPassword: boolean): Promise<string> =>
  unwrap(
    client.GET('/api/connections/{id}/connection-string', {
      params: { path: { id }, query: { withPassword: String(withPassword) } },
    }),
  ).then((r) => r.connectionString)
