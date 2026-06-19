import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { getConnection } from '$src/store/connections'
import { getDriver } from '$src/db/registry'

// Key-value browsing (Redis-style). Gated: the resolve 501s unless the connection's
// driver exposes the `keyv` facet, so SQL connections never reach these handlers.
export const keysRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .resolve(async ({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    const driver = await getDriver(id)
    if (!driver.keyv) return status(501, { error: 'Key-value browsing not supported' })
    return { keyv: driver.keyv }
  })
  .get(
    '/:id/keys',
    ({ keyv, query }) =>
      keyv.scan({
        match: query.match,
        cursor: query.cursor,
        count: query.count ? Number(query.count) : undefined,
      }),
    {
      query: t.Object({
        match: t.Optional(t.String()),
        cursor: t.Optional(t.String()),
        count: t.Optional(t.String()),
      }),
    },
  )
  .get('/:id/keys/value', ({ keyv, query }) => keyv.get(query.key), {
    query: t.Object({ key: t.String() }),
  })
  .delete(
    '/:id/keys',
    async ({ keyv, query }) => {
      await keyv.delete(query.key)
      return { deleted: true as const }
    },
    { query: t.Object({ key: t.String() }) },
  )
  .post('/:id/command', ({ keyv, body }) => keyv.command(body.argv), {
    body: t.Object({ argv: t.Array(t.String()) }),
  })
