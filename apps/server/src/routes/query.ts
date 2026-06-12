import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { getConnection } from '$src/store/connections'
import { getDriver } from '$src/db/registry'
import { pgErrorMessage } from '$src/db/shared/error'
import { recordHistory, listHistory, clearHistory } from '$src/store/history'
import { splitStatements } from '$src/db/shared/split'
import type { ColumnMeta } from '$src/db/shared/marshal'
import type { EditableSource } from '$src/db/driver'

/** Per-statement result returned in the `results` array. */
export interface StatementResult {
  index: number
  sql: string
  command: string | null
  columns: ColumnMeta[]
  rows: unknown[][]
  rowCount: number
  durationMs: number
  /** True only in the single-statement path when a LIMIT/OFFSET was appended. */
  paginated: boolean
  limit: number
  offset: number
  /** Set when the statement is a single-table SELECT that maps to an editable source. */
  source: EditableSource | null
  /** Set on the statement that failed; rows/columns will be empty. */
  error: string | null
}

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

      const limit = Math.min(Math.max(body.limit ?? 500, 1), 10000)
      const offset = Math.max(body.offset ?? 0, 0)

      const stmts = await splitStatements(body.sql)

      // ── Single-statement path: preserve original pagination + editable-source ──
      if (stmts.length === 1) {
        // Apply a default LIMIT/OFFSET to a single un-LIMITed SELECT so we never
        // fetch a whole table. Append (not subquery-wrap) to keep each column's
        // source-table OID intact for editable-result detection below.
        const sel = await driver.safety.inspectSelect(stmts[0])
        const paginated = sel.singleSelect && !sel.hasLimit
        const text = paginated
          ? `${stmts[0].replace(/;\s*$/, '')}\nLIMIT ${limit} OFFSET ${offset}`
          : stmts[0]

        const startedAt = new Date().toISOString()
        const t0 = performance.now()
        try {
          const result = await driver.exec.query(text)

          // Editable when every column traces to one base table that has a PK and
          // all PK columns are present in the projection (driver hides the dialect).
          const source = sel.singleSelect
            ? await driver.introspect.resolveEditableSource(result.columns)
            : null

          const durationMs = Math.round(performance.now() - t0)
          recordHistory({
            connectionId: connId,
            sql: body.sql,
            startedAt,
            durationMs,
            rowCount: result.rowCount,
            status: 'ok',
            error: null,
          })
          const statementResult: StatementResult = {
            index: 0,
            sql: stmts[0],
            command: result.command,
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rowCount,
            durationMs,
            paginated,
            limit,
            offset,
            source,
            error: null,
          }
          return { requiresConfirmation: false as const, results: [statementResult] }
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
      }

      // ── Multi-statement path: reserve one connection, run sequentially ─────
      const results: StatementResult[] = []
      const runner = await driver.exec.reserve()
      try {
        for (let i = 0; i < stmts.length; i++) {
          const stmt = stmts[i]
          const startedAt = new Date().toISOString()
          const t0 = performance.now()
          try {
            // Cap un-LIMITed SELECTs so a batch never pulls a whole table (no
            // offset paging in batch mode — just a safety ceiling, like the
            // single-statement path above).
            const sel = await driver.safety.inspectSelect(stmt)
            const capped = sel.singleSelect && !sel.hasLimit
            const text = capped ? `${stmt.replace(/;\s*$/, '')}\nLIMIT ${limit}` : stmt
            const result = await runner.query(text)

            // Resolve editable source only for single-SELECT statements in batch.
            const source = sel.singleSelect
              ? await driver.introspect.resolveEditableSource(result.columns)
              : null

            const durationMs = Math.round(performance.now() - t0)
            recordHistory({
              connectionId: connId,
              sql: stmt,
              startedAt,
              durationMs,
              rowCount: result.rowCount,
              status: 'ok',
              error: null,
            })
            results.push({
              index: i,
              sql: stmt,
              command: result.command,
              columns: result.columns,
              rows: result.rows,
              rowCount: result.rowCount,
              durationMs,
              paginated: false,
              limit,
              offset: 0,
              source,
              error: null,
            })
          } catch (e) {
            const message = pgErrorMessage(e)
            recordHistory({
              connectionId: connId,
              sql: stmt,
              startedAt,
              durationMs: Math.round(performance.now() - t0),
              rowCount: null,
              status: 'error',
              error: message,
            })
            results.push({
              index: i,
              sql: stmt,
              command: null,
              columns: [],
              rows: [],
              rowCount: 0,
              durationMs: Math.round(performance.now() - t0),
              paginated: false,
              limit,
              offset: 0,
              source: null,
              error: message,
            })
            // Stop at the first error — keep results that already succeeded.
            break
          }
        }
      } finally {
        runner.release()
      }

      return { requiresConfirmation: false as const, results }
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
