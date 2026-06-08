import { Elysia, t } from 'elysia'
import { requireAuth } from '../auth/gate'
import { getConnection } from '../store/connections'
import { getPool } from '../pg/pool'
import { executeSql } from '../pg/marshal'
import { analyzeSql, inspectSelect } from '../pg/safety'
import { resolveSource } from '../pg/introspect'
import { pgErrorMessage } from '../pg/error'
import { recordHistory, listHistory } from '../store/history'

export const queryRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .resolve(({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    return { sql: getPool(id), connId: id }
  })
  .post(
    '/:id/query',
    async ({ sql, connId, body }) => {
      // Authoritative dangerous-SQL gate: refuse risky statements unless the
      // client has explicitly confirmed (the editor's live /analyze is advisory).
      const report = await analyzeSql(body.sql)
      if (report.dangerous && !body.confirmDangerous) {
        return { requiresConfirmation: true as const, report }
      }

      // Apply a default LIMIT/OFFSET to a single un-LIMITed SELECT so we never
      // fetch a whole table. Append (not subquery-wrap) to keep each column's
      // source-table OID intact for editable-result detection below.
      const sel = await inspectSelect(body.sql)
      const paginated = sel.singleSelect && !sel.hasLimit
      const limit = Math.min(Math.max(body.limit ?? 500, 1), 10000)
      const offset = Math.max(body.offset ?? 0, 0)
      const text = paginated
        ? `${body.sql.replace(/;\s*$/, '')}\nLIMIT ${limit} OFFSET ${offset}`
        : body.sql

      const startedAt = new Date().toISOString()
      const t0 = performance.now()
      try {
        const result = await executeSql(sql, text)

        // Editable when every column traces to one base table that has a PK and
        // all PK columns are present in the projection.
        let source: {
          schema: string
          table: string
          primaryKey: string[]
          columnNames: (string | null)[]
        } | null = null
        if (sel.singleSelect) {
          const oids = new Set(
            result.columns
              .map((c) => c.sourceTable)
              .filter((o): o is number => typeof o === 'number' && o > 0),
          )
          if (oids.size === 1) {
            const st = await resolveSource(sql, [...oids][0])
            if (st && st.primaryKey.length > 0) {
              const columnNames = result.columns.map((c) =>
                c.sourceColumn ? (st.attnumName[c.sourceColumn] ?? null) : null,
              )
              if (st.primaryKey.every((pkName) => columnNames.includes(pkName))) {
                source = {
                  schema: st.schema,
                  table: st.table,
                  primaryKey: st.primaryKey,
                  columnNames,
                }
              }
            }
          }
        }

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
  .post('/:id/query/analyze', ({ body }) => analyzeSql(body.sql), {
    body: t.Object({ sql: t.String() }),
  })
  .get('/:id/history', ({ connId }) => listHistory(connId, 100))
