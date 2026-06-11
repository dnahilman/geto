import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { getConnection } from '$src/store/connections'
import { getDriver } from '$src/db/registry'
import { pgErrorMessage } from '$src/db/shared/error'
import { recordHistory, listHistory, clearHistory } from '$src/store/history'

export const queryRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .resolve(({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    return { driver: getDriver(id), connId: id }
  })
  .post(
    '/:id/query',
    async ({ driver, connId, body }) => {
      // Authoritative dangerous-SQL gate: refuse risky statements unless the
      // client has explicitly confirmed (the editor's live /analyze is advisory).
      const report = await driver.safety.analyze(body.sql)
      if (report.dangerous && !body.confirmDangerous) {
        return { requiresConfirmation: true as const, report }
      }

      // Apply a default LIMIT/OFFSET to a single un-LIMITed SELECT so we never
      // fetch a whole table. Append (not subquery-wrap) to keep each column's
      // source-table OID intact for editable-result detection below.
      const sel = await driver.safety.inspectSelect(body.sql)
      const paginated = sel.singleSelect && !sel.hasLimit
      const limit = Math.min(Math.max(body.limit ?? 500, 1), 10000)
      const offset = Math.max(body.offset ?? 0, 0)
      const text = paginated
        ? `${body.sql.replace(/;\s*$/, '')}\nLIMIT ${limit} OFFSET ${offset}`
        : body.sql

      const startedAt = new Date().toISOString()
      const t0 = performance.now()
      try {
        const result = await driver.exec.query(text)

        // Editable when every column traces to one base table that has a PK and
        // all PK columns are present in the projection (driver hides the dialect).
        const source = sel.singleSelect
          ? await driver.introspect.resolveEditableSource(result.columns)
          : null

        recordHistory({
          connectionId: connId,
          sql: body.sql,
          startedAt,
          durationMs: Math.round(performance.now() - t0),
          rowCount: result.rowCount,
          status: 'ok',
          error: null,
        })
        return {
          requiresConfirmation: false as const,
          ...result,
          durationMs: Math.round(performance.now() - t0),
          paginated,
          limit,
          offset,
          source,
        }
      } catch (e) {
        const message = pgErrorMessage(e)
        recordHistory({
          connectionId: connId,
          sql: body.sql,
          startedAt,
          durationMs: Math.round(performance.now() - t0),
          rowCount: null,
          status: 'error',
          error: message,
        })
        throw e
      }
    },
    {
      body: t.Object({
        sql: t.String({ minLength: 1 }),
        confirmDangerous: t.Optional(t.Boolean()),
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
        offset: t.Optional(t.Integer({ minimum: 0 })),
      }),
    },
  )
  .post('/:id/query/analyze', ({ driver, body }) => driver.safety.analyze(body.sql), {
    body: t.Object({ sql: t.String() }),
  })
  .get('/:id/history', ({ connId }) => listHistory(connId, 100))
  .delete('/:id/history', ({ connId }) => ({ deleted: clearHistory(connId) }))
