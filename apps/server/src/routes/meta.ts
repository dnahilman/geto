import { Elysia, t } from 'elysia'
import { requireAuth } from '../auth/gate'
import { getConnection } from '../store/connections'
import { getPool } from '../pg/pool'
import {
  getAllColumns,
  getColumns,
  getConstraints,
  getForeignKeys,
  getFunctions,
  getIndexes,
  getPrimaryKey,
  getTree,
  listDatabases,
  listSchemas,
} from '../pg/introspect'

export const metaRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  // Reject unknown connection ids early for every route in this group.
  .resolve(({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    return { sql: getPool(id) }
  })
  .get('/:id/databases', ({ sql }) => listDatabases(sql))
  .get('/:id/schemas', ({ sql }) => listSchemas(sql))
  .get('/:id/tree', ({ sql, query }) => getTree(sql, query.search), {
    query: t.Object({ search: t.Optional(t.String()) }),
  })
  .get(
    '/:id/tables/:schema/:table',
    async ({ sql, params }) => {
      const [columns, indexes, constraints, primaryKey] = await Promise.all([
        getColumns(sql, params.schema, params.table),
        getIndexes(sql, params.schema, params.table),
        getConstraints(sql, params.schema, params.table),
        getPrimaryKey(sql, params.schema, params.table),
      ])
      return { columns, indexes, constraints, primaryKey }
    },
    { params: t.Object({ id: t.String(), schema: t.String(), table: t.String() }) },
  )
  // Entities for the Monaco completion service. Tables + columns are the core of
  // intellisense; functions + FKs are enrichments. The enrichments must never be
  // able to break core completion, so a failure there degrades to an empty list
  // (e.g. pg_proc.prokind needs PG >= 11) instead of failing the whole request.
  .get('/:id/completion', async ({ sql }) => {
    const [tree, columns] = await Promise.all([getTree(sql), getAllColumns(sql)])
    const [functions, foreignKeys] = await Promise.all([
      getFunctions(sql).catch((e) => {
        console.warn('completion: getFunctions failed, skipping', e)
        return []
      }),
      getForeignKeys(sql).catch((e) => {
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
