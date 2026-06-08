import { client, unwrap } from '$lib/api/eden'
import type { Connection, ConnectionInput, ProviderMeta } from '@geto/server'

export type { Connection, ConnectionInput, ProviderMeta }
export type SslMode = ConnectionInput['sslMode']

export const providersKey = ['providers'] as const
export const getProviders = (): Promise<ProviderMeta[]> =>
  unwrap(client.api.providers.get()) as Promise<ProviderMeta[]>

export interface TestResult {
  version?: string
  latencyMs?: number
  error?: string
}

export const connectionsKey = ['connections'] as const

export const listConnections = (): Promise<Connection[]> =>
  unwrap(client.api.connections.get()) as Promise<Connection[]>

export const createConnection = (input: ConnectionInput): Promise<Connection> =>
  unwrap(client.api.connections.post(input)) as Promise<Connection>

export const updateConnection = (id: string, input: ConnectionInput): Promise<Connection> =>
  unwrap(client.api.connections({ id }).patch(input)) as Promise<Connection>

export const deleteConnection = (id: string): Promise<{ deleted: true }> =>
  unwrap(client.api.connections({ id }).delete()) as Promise<{ deleted: true }>

export const switchDatabase = (id: string, name: string): Promise<Connection> =>
  unwrap(client.api.connections({ id }).database.post({ name })) as Promise<Connection>

export const testNewConnection = (input: ConnectionInput): Promise<TestResult> =>
  unwrap(client.api.connections.test.post(input)) as Promise<TestResult>

export const testSavedConnection = (id: string): Promise<TestResult> =>
  unwrap(client.api.connections({ id }).test.post()) as Promise<TestResult>

export const getConnectionString = (id: string, withPassword: boolean): Promise<string> =>
  unwrap(
    client.api
      .connections({ id })
      ['connection-string'].get({ query: { withPassword: String(withPassword) } }),
  ).then((r) => (r as { connectionString: string }).connectionString)
