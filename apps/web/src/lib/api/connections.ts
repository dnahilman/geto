import { client, unwrap } from '$lib/api/client'
import { execute } from '$lib/api/transport'
import type {
  Connection,
  ConnectionInput,
  ProviderMeta,
  SslMode,
  TestResult,
} from '$lib/types/server'

export type { Connection, ConnectionInput, ProviderMeta, SslMode, TestResult }

export const providersKey = ['providers'] as const
export const getProviders = (): Promise<ProviderMeta[]> =>
  execute('get_providers', undefined, () => unwrap(client.GET('/api/providers')))

export const connectionsKey = ['connections'] as const

export const listConnections = (): Promise<Connection[]> =>
  execute('list_connections', undefined, () => unwrap(client.GET('/api/connections')))

export const createConnection = (input: ConnectionInput): Promise<Connection> =>
  execute('create_connection', { input }, () =>
    unwrap(client.POST('/api/connections', { body: input })),
  )

export const updateConnection = (id: string, input: ConnectionInput): Promise<Connection> =>
  execute('update_connection', { id, input }, () =>
    unwrap(client.PATCH('/api/connections/{id}', { params: { path: { id } }, body: input })),
  )

export const deleteConnection = async (id: string): Promise<{ deleted: boolean }> => {
  const deleted = await execute<boolean>('delete_connection', { id }, () =>
    unwrap(client.DELETE('/api/connections/{id}', { params: { path: { id } } })).then(
      (r) => r.deleted,
    ),
  )
  return { deleted: Boolean(deleted) }
}

export const switchDatabase = (id: string, name: string): Promise<Connection> =>
  execute('set_connection_database', { id, database: name }, () =>
    unwrap(
      client.POST('/api/connections/{id}/database', {
        params: { path: { id } },
        body: { name },
      }),
    ),
  )

export const testNewConnection = (input: ConnectionInput): Promise<TestResult> =>
  execute('test_unsaved_connection', { input }, () =>
    unwrap(client.POST('/api/connections/test', { body: input })),
  )

export const testSavedConnection = (id: string): Promise<TestResult> =>
  execute('test_saved_connection', { id }, () =>
    unwrap(client.POST('/api/connections/{id}/test', { params: { path: { id } } })),
  )

export const getConnectionString = (id: string, withPassword: boolean): Promise<string> =>
  execute('get_connection_string', { id, withPassword }, () =>
    unwrap(
      client.GET('/api/connections/{id}/connection-string', {
        params: { path: { id }, query: { withPassword: String(withPassword) } },
      }),
    ).then((r) => r.connectionString),
  )
