import { Elysia, t } from 'elysia'
import { authController } from '$src/auth/gate'
import { pgErrorMessage } from '$src/db/shared/error'
import { connectionsRoutes } from '$src/routes/connections'
import { providersRoutes } from '$src/routes/providers'
import { metaRoutes } from '$src/routes/meta'
import { tablesRoutes } from '$src/routes/tables'
import { queryRoutes } from '$src/routes/query'
import { databasesRoutes } from '$src/routes/databases'
import { rolesRoutes } from '$src/routes/roles'
import { keysRoutes } from '$src/routes/keys'

/**
 * The API surface. Grouped under `/api`. Each feature area is added as its own
 * Elysia instance via `.use()` so the inferred type stays composable for Eden.
 *
 * `export type App = typeof app` (in index.ts) is consumed by the web client
 * through Eden Treaty for end-to-end type safety with zero codegen.
 */
export const api = new Elysia({ prefix: '/api' })
  .onError(({ code, error, set }) => {
    if (code === 'VALIDATION') {
      set.status = 422
      return { error: error.message }
    }
    if (code === 'NOT_FOUND') {
      set.status = 404
      return { error: 'Not found' }
    }
    // Most thrown errors here are PostgreSQL errors from a user's query/DDL.
    set.status = 400
    return { error: pgErrorMessage(error) }
  })
  .get(
    '/health',
    () => ({
      ok: true as const,
      name: 'geto',
      version: '0.0.0',
    }),
    {
      response: t.Object({
        ok: t.Literal(true),
        name: t.String(),
        version: t.String(),
      }),
    },
  )
  .use(authController)
  .use(providersRoutes)
  .use(connectionsRoutes)
  .use(metaRoutes)
  .use(tablesRoutes)
  .use(queryRoutes)
  .use(databasesRoutes)
  .use(rolesRoutes)
  .use(keysRoutes)

export type Api = typeof api
