import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { getConnection } from '$src/store/connections'
import { getDriver } from '$src/db/registry'

export const databasesRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .resolve(async ({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    return { driver: await getDriver(id) }
  })
  .post(
    '/:id/databases',
    async ({ driver, body }) => {
      // CREATE DATABASE cannot run inside a transaction; ddl.exec uses the simple
      // protocol so this executes standalone.
      await driver.ddl.exec(`CREATE DATABASE ${driver.ddl.quoteIdent(body.name)}`)
      return { created: true as const, name: body.name }
    },
    { params: t.Object({ id: t.String() }), body: t.Object({ name: t.String({ minLength: 1 }) }) },
  )
  .delete(
    '/:id/databases/:name',
    async ({ driver, params }) => {
      await driver.ddl.exec(`DROP DATABASE ${driver.ddl.quoteIdent(params.name)}`)
      return { dropped: true as const }
    },
    { params: t.Object({ id: t.String(), name: t.String() }) },
  )
