import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import {
  createConnection,
  deleteConnection,
  getConnection,
  getConnectionSecret,
  listConnections,
  setConnectionDatabase,
  updateConnection,
  type ConnectionInput,
} from '$src/store/connections'
import { closeDriver } from '$src/db/registry'
import { getAdapter } from '$src/db/adapters'
import { withTunnel } from '$src/db/ssh/tunnel'
import type { ProviderId } from '$src/providers'
import type { ConnectionTarget } from '$src/db/types'
import type { SshSecret, SshInput } from '$src/store/connections'

const sslMode = t.Union([
  t.Literal('disable'),
  t.Literal('allow'),
  t.Literal('prefer'),
  t.Literal('require'),
  t.Literal('verify-ca'),
  t.Literal('verify-full'),
])

const sshBody = t.Object({
  enabled: t.Boolean(),
  host: t.String(),
  port: t.Integer({ minimum: 1, maximum: 65535 }),
  username: t.String(),
  authMethod: t.Union([t.Literal('password'), t.Literal('key')]),
  password: t.Optional(t.Nullable(t.String())),
  privateKey: t.Optional(t.Nullable(t.String())),
  passphrase: t.Optional(t.Nullable(t.String())),
})

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
  ssh: t.Optional(t.Nullable(sshBody)),
})

function toInput(b: typeof connectionBody.static): ConnectionInput {
  return { ...b, provider: b.provider ?? 'postgresql', ssh: (b.ssh ?? null) as SshInput | null }
}

/** Run a connection test via the provider adapter, transparently routing through
 *  an SSH tunnel when requested. For an unsaved test, SSH secrets arrive plaintext.
 *  Dialect-agnostic: it never names PostgreSQL — the adapter does the engine work. */
async function testWithOptionalSsh(
  provider: ProviderId,
  target: ConnectionTarget,
  ssh: SshSecret | null,
) {
  const { testConnection } = getAdapter(provider)
  if (!ssh) return testConnection(target)
  try {
    return await withTunnel({ ...ssh, target: { host: target.host, port: target.port } }, (lp) =>
      testConnection({ ...target, host: '127.0.0.1', port: lp }),
    )
  } catch (e) {
    return { error: (e as Error).message }
  }
}

function sshSecretFromBody(s: typeof sshBody.static | null | undefined): SshSecret | null {
  if (!s || !s.enabled) return null
  return {
    host: s.host,
    port: s.port,
    username: s.username,
    authMethod: s.authMethod,
    password: s.password ?? null,
    privateKey: s.privateKey ?? null,
    passphrase: s.passphrase ?? null,
  }
}

export const connectionsRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .get('/', () => listConnections())
  .post('/', ({ body }) => createConnection(toInput(body)), { body: connectionBody })
  .post(
    '/test',
    async ({ body }) =>
      testWithOptionalSsh(
        body.provider ?? 'postgresql',
        {
          host: body.host,
          port: body.port,
          database: body.database,
          username: body.username,
          password: body.password ?? null,
          sslMode: body.sslMode,
        },
        sshSecretFromBody(body.ssh),
      ),
    { body: connectionBody },
  )
  .get(
    '/:id',
    ({ params, status }) => getConnection(params.id) ?? status(404, { error: 'Not found' }),
  )
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
    return testWithOptionalSsh(
      secret.provider,
      {
        host: secret.host,
        port: secret.port,
        database: secret.database,
        username: secret.username,
        password: secret.password,
        sslMode: secret.sslMode,
      },
      secret.sshSecret,
    )
  })
  .get(
    '/:id/connection-string',
    ({ params, query, status }) => {
      const secret = getConnectionSecret(params.id)
      if (!secret) return status(404, { error: 'Not found' })
      const withPassword = query.withPassword === 'true'
      const password = withPassword ? secret.password : secret.password ? '****' : null
      return {
        connectionString: getAdapter(secret.provider).buildConnectionString(secret, password),
      }
    },
    { query: t.Object({ withPassword: t.Optional(t.String()) }) },
  )
