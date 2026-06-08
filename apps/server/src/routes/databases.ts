import { Elysia, t } from 'elysia'
import { requireAuth } from '../auth/gate'
import { getConnection } from '../store/connections'
import { getPool } from '../pg/pool'
import { quoteIdent } from '../pg/introspect'

export const databasesRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .resolve(({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    return { sql: getPool(id) }
  })
  .post(
    '/:id/databases',
    async ({ sql, body }) => {
      // CREATE DATABASE cannot run inside a transaction; unsafe() uses the simple
      // protocol so this executes standalone.
      await sql.unsafe(`CREATE DATABASE ${quoteIdent(body.name)}`)
      return { created: true as const, name: body.name }
    },
    { params: t.Object({ id: t.String() }), body: t.Object({ name: t.String({ minLength: 1 }) }) },
  )
  .delete(
    '/:id/databases/:name',
    async ({ sql, params }) => {
      await sql.unsafe(`DROP DATABASE ${quoteIdent(params.name)}`)
      return { dropped: true as const }
    },
    { params: t.Object({ id: t.String(), name: t.String() }) },
  )
