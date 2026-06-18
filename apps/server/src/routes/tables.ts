import { Elysia, t } from 'elysia'
import { requireAuth } from '$src/auth/gate'
import { getConnection } from '$src/store/connections'
import { getDriver } from '$src/db/registry'
import type { DbDriver } from '$src/db/driver'
import type { QueryResult } from '$src/db/shared/marshal'
import { buildDelete, buildInsert, buildUpdate, inlineParams } from '$src/db/drivers/postgres/dml'
import { recordHistory } from '$src/store/history'
import { pgErrorMessage } from '$src/db/shared/error'

const tableParams = t.Object({ id: t.String(), schema: t.String(), table: t.String() })
const rowValues = t.Record(t.String(), t.Unknown())

/** Run a write, logging the executed SQL (with inlined values) to history. */
async function logged(
  connId: string,
  display: string,
  exec: () => Promise<QueryResult>,
): Promise<QueryResult> {
  const startedAt = new Date().toISOString()
  const t0 = performance.now()
  try {
    const result = await exec()
    recordHistory({
      connectionId: connId,
      sql: display,
      startedAt,
      durationMs: Math.round(performance.now() - t0),
      rowCount: result.rowCount,
      status: 'ok',
      error: null,
    })
    return result
  } catch (e) {
    recordHistory({
      connectionId: connId,
      sql: display,
      startedAt,
      durationMs: Math.round(performance.now() - t0),
      rowCount: null,
      status: 'error',
      error: pgErrorMessage(e),
    })
    throw e
  }
}

/** Run a DDL statement (no result rows), logging it to history. */
async function loggedDdl(connId: string, driver: DbDriver, ddl: string): Promise<void> {
  const startedAt = new Date().toISOString()
  const t0 = performance.now()
  try {
    await driver.ddl.exec(ddl)
    recordHistory({
      connectionId: connId,
      sql: ddl,
      startedAt,
      durationMs: Math.round(performance.now() - t0),
      rowCount: null,
      status: 'ok',
      error: null,
    })
  } catch (e) {
    recordHistory({
      connectionId: connId,
      sql: ddl,
      startedAt,
      durationMs: Math.round(performance.now() - t0),
      rowCount: null,
      status: 'error',
      error: pgErrorMessage(e),
    })
    throw e
  }
}

export const tablesRoutes = new Elysia({ prefix: '/connections' })
  .use(requireAuth)
  .resolve(async ({ params, status }) => {
    const id = (params as { id?: string }).id
    if (!id || !getConnection(id)) return status(404, { error: 'Connection not found' })
    return { driver: await getDriver(id), connId: id }
  })
  // ---- read a page of rows ----
  .get(
    '/:id/tables/:schema/:table/rows',
    async ({ driver, params, query }) => {
      const t0 = performance.now()
      const data = await driver.introspect.getTableData(params.schema, params.table, {
        limit: Math.min(query.limit ?? 500, 10000),
        offset: query.offset ?? 0,
        orderBy: query.orderBy,
        orderDir: query.orderDir === 'DESC' ? 'DESC' : 'ASC',
        filterColumn: query.filterColumn,
        filterValue: query.filterValue,
      })
      return { ...data, durationMs: Math.round(performance.now() - t0) }
    },
    {
      params: tableParams,
      query: t.Object({
        limit: t.Optional(t.Integer({ minimum: 1, maximum: 10000 })),
        offset: t.Optional(t.Integer({ minimum: 0 })),
        orderBy: t.Optional(t.String()),
        orderDir: t.Optional(t.Union([t.Literal('ASC'), t.Literal('DESC')])),
        filterColumn: t.Optional(t.String()),
        filterValue: t.Optional(t.String()),
      }),
    },
  )
  // ---- row CRUD (writes blocked by PG on read-only connections) ----
  .post(
    '/:id/tables/:schema/:table/rows',
    ({ driver, connId, params, body }) => {
      const { text, params: p } = buildInsert(params.schema, params.table, body.values)
      return logged(connId, inlineParams(text, p), () => driver.exec.query(text, p))
    },
    { params: tableParams, body: t.Object({ values: rowValues }) },
  )
  .patch(
    '/:id/tables/:schema/:table/rows',
    ({ driver, connId, params, body }) => {
      const { text, params: p } = buildUpdate(params.schema, params.table, body.pk, body.values)
      return logged(connId, inlineParams(text, p), () => driver.exec.query(text, p))
    },
    { params: tableParams, body: t.Object({ pk: rowValues, values: rowValues }) },
  )
  .delete(
    '/:id/tables/:schema/:table/rows',
    ({ driver, connId, params, body }) => {
      const { text, params: p } = buildDelete(params.schema, params.table, body.pk)
      return logged(connId, inlineParams(text, p), () => driver.exec.query(text, p))
    },
    { params: tableParams, body: t.Object({ pk: rowValues }) },
  )
  // ---- table DDL ----
  .post(
    '/:id/tables',
    async ({ driver, connId, body }) => {
      const ddl = driver.ddl.buildCreateTable(body.schema, body.name, body.columns)
      await loggedDdl(connId, driver, ddl)
      return { created: true as const, schema: body.schema, name: body.name }
    },
    {
      params: t.Object({ id: t.String() }),
      body: t.Object({
        schema: t.String({ minLength: 1 }),
        name: t.String({ minLength: 1 }),
        columns: t.Array(
          t.Object({
            name: t.String({ minLength: 1 }),
            type: t.String({ minLength: 1 }),
            notNull: t.Optional(t.Boolean()),
            default: t.Optional(t.Nullable(t.String())),
            primaryKey: t.Optional(t.Boolean()),
          }),
          { minItems: 1 },
        ),
      }),
    },
  )
  .delete(
    '/:id/tables/:schema/:table',
    async ({ driver, connId, params }) => {
      await loggedDdl(
        connId,
        driver,
        `DROP TABLE ${driver.ddl.quoteIdent(params.schema)}.${driver.ddl.quoteIdent(params.table)}`,
      )
      return { dropped: true as const }
    },
    { params: tableParams },
  )
  .post(
    '/:id/tables/:schema/:table/truncate',
    async ({ driver, connId, params }) => {
      await loggedDdl(
        connId,
        driver,
        `TRUNCATE ${driver.ddl.quoteIdent(params.schema)}.${driver.ddl.quoteIdent(params.table)}`,
      )
      return { truncated: true as const }
    },
    { params: tableParams },
  )
