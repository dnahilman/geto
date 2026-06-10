import { Elysia, t } from 'elysia'
import { requireAuth } from '../auth/gate'
import {
  createConnection,
  deleteConnection,
  getConnection,
  getConnectionSecret,
  listConnections,
  setConnectionDatabase,
  updateConnection,
  type ConnectionInput,
} from '../store/connections'
import { closeDriver } from '../db/registry'
import { testConnection } from '../db/drivers/postgres/pool'
import { buildConnectionString } from '../db/drivers/postgres/connection-string'

const sslMode = t.Union([
  t.Literal('disable'),
  t.Literal('allow'),
  t.Literal('prefer'),
  t.Literal('require'),
  t.Literal('verify-ca'),
  t.Literal('verify-full'),
])

const connectionBody = t.Object({
  name: t.String({ minLength: 1 }),
  provider: t.Optional(t.Literal('postgresql')),
  host: t.String({ minLength: 1 }),
  port: t.Integer({ minimum: 1, maximum: 65535 }),
  database: t.String({ minLength: 1 }),
  username: t.String({ minLength: 1 }),
  password: t.Optional(t.Nullable(t.String())),
  sslMode,
  color: t.Optional(t.Nullable(t.String())),
  readonly: t.Boolean(),
})

function toInput(b: typeof connectionBody.static): ConnectionInput {
  return { ...b, provider: b.provider ?? 'postgresql' }
}

export const connectionsRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .get('/', () => listConnections())
  .post('/', ({ body }) => createConnection(toInput(body)), { body: connectionBody })
  .post(
    '/test',
    async ({ body }) =>
      testConnection({
        host: body.host,
        port: body.port,
        database: body.database,
        username: body.username,
        password: body.password ?? null,
        sslMode: body.sslMode,
      }),
    { body: connectionBody },
  )
  .get('/:id', ({ params, status }) => getConnection(params.id) ?? status(404, { error: 'Not found' }))
  .patch(
    '/:id',
    async ({ params, body, status }) => {
      const updated = updateConnection(params.id, toInput(body))
      if (!updated) return status(404, { error: 'Not found' })
      await closeDriver(params.id) // creds may have changed
      return updated
    },
    { body: connectionBody },
  )
  .delete('/:id', async ({ params, status }) => {
    const ok = deleteConnection(params.id)
    if (!ok) return status(404, { error: 'Not found' })
    await closeDriver(params.id)
    return { deleted: true as const }
  })
  // Switch the active database (reconnects the pool to the new database).
  .post(
    '/:id/database',
    async ({ params, body, status }) => {
      const updated = setConnectionDatabase(params.id, body.name)
      if (!updated) return status(404, { error: 'Not found' })
      await closeDriver(params.id)
      return updated
    },
    { body: t.Object({ name: t.String({ minLength: 1 }) }) },
  )
  .post('/:id/test', async ({ params, status }) => {
    const secret = getConnectionSecret(params.id)
    if (!secret) return status(404, { error: 'Not found' })
    return testConnection(secret)
  })
  .get(
    '/:id/connection-string',
    ({ params, query, status }) => {
      const secret = getConnectionSecret(params.id)
      if (!secret) return status(404, { error: 'Not found' })
      const withPassword = query.withPassword === 'true'
      const password = withPassword ? secret.password : secret.password ? '****' : null
      return { connectionString: buildConnectionString(secret, password) }
    },
    { query: t.Object({ withPassword: t.Optional(t.String()) }) },
  )
