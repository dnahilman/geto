import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { getConnection } from '$src/store/connections'
import { getDriver } from '$src/db/registry'

export const metaRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  // Reject unknown connection ids early for every route in this group.
  .resolve(async ({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    return { driver: await getDriver(id) }
  })
  .get('/:id/databases', ({ driver }) => driver.introspect.listDatabases())
  .get('/:id/schemas', ({ driver }) => driver.introspect.listSchemas())
  .get('/:id/tree', ({ driver, query }) => driver.introspect.getTree(query.search), {
    query: t.Object({ search: t.Optional(t.String()) }),
  })
  .get(
    '/:id/tables/:schema/:table',
    async ({ driver, params }) => {
      const [columns, indexes, constraints, primaryKey] = await Promise.all([
        driver.introspect.getColumns(params.schema, params.table),
        driver.introspect.getIndexes(params.schema, params.table),
        driver.introspect.getConstraints(params.schema, params.table),
        driver.introspect.getPrimaryKey(params.schema, params.table),
      ])
      return { columns, indexes, constraints, primaryKey }
    },
    { params: t.Object({ id: t.String(), schema: t.String(), table: t.String() }) },
  )
  // Entities for the editor completion service. Tables + columns are the core of
  // intellisense; functions + FKs are enrichments. The enrichments must never be
  // able to break core completion, so a failure there degrades to an empty list
  // (e.g. pg_proc.prokind needs PG >= 11) instead of failing the whole request.
  .get('/:id/completion', async ({ driver }) => {
    const [tree, columns] = await Promise.all([
      driver.introspect.getTree(),
      driver.introspect.getAllColumns(),
    ])
    const [functions, foreignKeys] = await Promise.all([
      driver.introspect.getFunctions().catch((e) => {
        console.warn('completion: getFunctions failed, skipping', e)
        return []
      }),
      driver.introspect.getForeignKeys().catch((e) => {
        console.warn('completion: getForeignKeys failed, skipping', e)
        return []
      }),
    ])
    return {
      tables: tree.flatMap((s) =>
        s.relations.map((r) => ({ schema: s.schema, name: r.name, type: r.type })),
      ),
      columns,
      functions,
      foreignKeys,
    }
  })
