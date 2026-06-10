import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import type { Sql, PgOptions } from '$src/db/drivers/postgres/pool'
import { executeSql } from '$src/db/drivers/postgres/exec'
import {
  getColumns,
  getPrimaryKey,
  getTableData,
  getTree,
} from '$src/db/drivers/postgres/introspect'
import { buildDelete, buildInsert, buildUpdate } from '$src/db/drivers/postgres/dml'
import { analyzeSql } from '$src/db/shared/safety'
import { PostgresDriver } from '$src/db/drivers/postgres/driver'

/** Parse a TEST_DATABASE_URL into the driver's PgOptions (no SSL for the test DB). */
function urlToOptions(raw: string): PgOptions {
  // globalThis.URL because the module-level `URL` constant below shadows the global.
  const u = new globalThis.URL(raw)
  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 5432,
    database: decodeURIComponent(u.pathname.replace(/^\//, '')) || 'postgres',
    username: decodeURIComponent(u.username) || 'postgres',
    password: u.password ? decodeURIComponent(u.password) : null,
    sslMode: 'disable',
  }
}

// Runs only when TEST_DATABASE_URL is set (see docker-compose `test` profile).
// Falls back to skipping so the pure unit tests still run without a database.
const URL = process.env.TEST_DATABASE_URL
const suite = URL ? describe : describe.skip

suite('integration: real PostgreSQL', () => {
  let sql: Sql

  beforeAll(async () => {
    sql = postgres(URL as string, { onnotice: () => {}, max: 2 }) as unknown as Sql
    await sql.unsafe(`
      DROP SCHEMA IF EXISTS geto_it CASCADE;
      CREATE SCHEMA geto_it;
      CREATE TABLE geto_it.t (
        id   bigserial PRIMARY KEY,
        name text NOT NULL,
        big  int8,
        meta jsonb,
        ts   timestamptz
      );
      INSERT INTO geto_it.t (name, big, meta, ts)
        VALUES ('widget', 9223372036854775807, '{"k":1}', '2024-01-02T03:04:05Z');
    `)
  })

  afterAll(async () => {
    await sql.unsafe('DROP SCHEMA IF EXISTS geto_it CASCADE')
    await sql.end()
  })

  test('executeSql marshals bigint→string, jsonb→object, timestamptz→ISO', async () => {
    const r = await executeSql(sql, 'SELECT big, meta, ts FROM geto_it.t')
    expect(r.rows[0][0]).toBe('9223372036854775807')
    expect(r.rows[0][1]).toEqual({ k: 1 })
    expect(r.rows[0][2]).toBe('2024-01-02T03:04:05.000Z')
    expect(r.columns.map((c) => c.typeName)).toContain('jsonb')
  })

  test('getTree lists the schema/table', async () => {
    const tree = await getTree(sql)
    const s = tree.find((x) => x.schema === 'geto_it')
    expect(s?.relations.some((rel) => rel.name === 't')).toBe(true)
  })

  test('getColumns + getPrimaryKey', async () => {
    const cols = await getColumns(sql, 'geto_it', 't')
    expect(cols.map((c) => c.name)).toEqual(['id', 'name', 'big', 'meta', 'ts'])
    expect(cols.find((c) => c.name === 'id')?.isPrimaryKey).toBe(true)
    expect(await getPrimaryKey(sql, 'geto_it', 't')).toEqual(['id'])
  })

  test('row insert → update → delete round-trip', async () => {
    const ins = buildInsert('geto_it', 't', { name: 'gadget', meta: '{"a":2}' })
    const inserted = await executeSql(sql, ins.text, ins.params)
    const idIdx = inserted.columns.findIndex((c) => c.name === 'id')
    const id = inserted.rows[0][idIdx] as string

    const upd = buildUpdate('geto_it', 't', { id }, { name: 'gadget2' })
    const updated = await executeSql(sql, upd.text, upd.params)
    const nameIdx = updated.columns.findIndex((c) => c.name === 'name')
    expect(updated.rows[0][nameIdx]).toBe('gadget2')

    const del = buildDelete('geto_it', 't', { id })
    const deleted = await executeSql(sql, del.text, del.params)
    expect(deleted.rowCount).toBe(1)
  })

  test('getTableData paginates + reports columns', async () => {
    const { result } = await getTableData(sql, 'geto_it', 't', { limit: 10, offset: 0 })
    expect(result.columns.length).toBe(5)
    expect(result.rows.length).toBeGreaterThanOrEqual(1)
  })

  test('safety guard matches real parser behavior', async () => {
    expect((await analyzeSql('DELETE FROM geto_it.t')).dangerous).toBe(true)
    expect((await analyzeSql('DELETE FROM geto_it.t WHERE id = 1')).dangerous).toBe(false)
  })

  test('PostgresDriver binds introspection + exec + editable-source', async () => {
    const driver = new PostgresDriver(urlToOptions(URL as string))
    try {
      const tree = await driver.introspect.getTree()
      expect(tree.find((x) => x.schema === 'geto_it')?.relations.some((r) => r.name === 't')).toBe(
        true,
      )
      const res = await driver.exec.query('SELECT id, name FROM geto_it.t LIMIT 1')
      expect(res.columns.map((c) => c.name)).toEqual(['id', 'name'])
      // id (the PK) is projected → result is editable, source resolves to geto_it.t.
      const editable = await driver.introspect.resolveEditableSource(res.columns)
      expect(editable?.table).toBe('t')
      expect(editable?.primaryKey).toEqual(['id'])
    } finally {
      await driver.lifecycle.close()
    }
  })

  test('read-only session blocks writes (default_transaction_read_only)', async () => {
    const ro = postgres(URL as string, {
      onnotice: () => {},
      max: 1,
      connection: { default_transaction_read_only: true },
    })
    try {
      await ro`INSERT INTO geto_it.t (name) VALUES ('nope')`
      throw new Error('expected a read-only error')
    } catch (e) {
      expect((e as Error).message).toContain('read-only')
    } finally {
      await ro.end()
    }
  })
})
