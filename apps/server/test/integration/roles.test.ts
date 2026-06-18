import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import postgres from 'postgres'
import type { Sql } from '$src/db/drivers/postgres/pool'
import {
  listRoles,
  createRole,
  alterRole,
  dropRole,
  setMembership,
  getObjectGrants,
  setObjectPrivilege,
} from '$src/db/drivers/postgres/roles'

// Runs only when TEST_DATABASE_URL is set (CI provides a Postgres service);
// otherwise skipped so the pure unit tests still run without a database.
const URL = process.env.TEST_DATABASE_URL
const suite = URL ? describe : describe.skip

const R = 'geto_it_role'
const PARENT = 'geto_it_parent'

suite('integration: role + privilege management', () => {
  let sql: Sql

  beforeAll(async () => {
    sql = postgres(URL as string, { onnotice: () => {}, max: 2 }) as unknown as Sql
    await sql.unsafe(`DROP ROLE IF EXISTS ${R}`).catch(() => {})
    await sql.unsafe(`DROP ROLE IF EXISTS ${PARENT}`).catch(() => {})
    await sql.unsafe('DROP SCHEMA IF EXISTS geto_rit CASCADE')
    await sql.unsafe('CREATE SCHEMA geto_rit; CREATE TABLE geto_rit.t (id int)')
  })

  afterAll(async () => {
    await sql.unsafe(`DROP ROLE IF EXISTS ${R}`).catch(() => {})
    await sql.unsafe(`DROP ROLE IF EXISTS ${PARENT}`).catch(() => {})
    await sql.unsafe('DROP SCHEMA IF EXISTS geto_rit CASCADE').catch(() => {})
    await sql.end()
  })

  test('createRole sets attributes, password and connection limit', async () => {
    await createRole(sql, {
      name: R,
      canLogin: true,
      canCreateDb: true,
      isSuperuser: false,
      password: "p4ss'word", // embedded quote must be safely escaped by %L
      connectionLimit: 5,
    })
    const r = (await listRoles(sql)).find((x) => x.name === R)
    expect(r?.canLogin).toBe(true)
    expect(r?.canCreateDb).toBe(true)
    expect(r?.isSuperuser).toBe(false)
    expect(r?.connectionLimit).toBe(5)
  })

  test('alterRole toggles attributes', async () => {
    await alterRole(sql, R, { canCreateDb: false, canCreateRole: true })
    const r = (await listRoles(sql)).find((x) => x.name === R)
    expect(r?.canCreateDb).toBe(false)
    expect(r?.canCreateRole).toBe(true)
  })

  test('setMembership grants then revokes', async () => {
    await createRole(sql, { name: PARENT, canLogin: false })
    await setMembership(sql, PARENT, R, true)
    expect((await listRoles(sql)).find((x) => x.name === R)?.memberOf).toContain(PARENT)
    await setMembership(sql, PARENT, R, false)
    expect((await listRoles(sql)).find((x) => x.name === R)?.memberOf).not.toContain(PARENT)
  })

  test('object privileges: GRANT then REVOKE, visible via aclexplode', async () => {
    await setObjectPrivilege(sql, {
      kind: 'table',
      schema: 'geto_rit',
      name: 't',
      role: R,
      privileges: ['SELECT', 'INSERT'],
      grant: true,
    })
    let mine = (await getObjectGrants(sql, 'geto_rit', 't', 'table'))
      .filter((g) => g.grantee === R)
      .map((g) => g.privilege)
    expect(mine).toContain('SELECT')
    expect(mine).toContain('INSERT')

    await setObjectPrivilege(sql, {
      kind: 'table',
      schema: 'geto_rit',
      name: 't',
      role: R,
      privileges: ['INSERT'],
      grant: false,
    })
    mine = (await getObjectGrants(sql, 'geto_rit', 't', 'table'))
      .filter((g) => g.grantee === R)
      .map((g) => g.privilege)
    expect(mine).toContain('SELECT')
    expect(mine).not.toContain('INSERT')
  })

  test('SECURITY: a malicious role identifier cannot break out of quoting', async () => {
    // If %I quoting failed, this would DROP TABLE geto_rit.t. It must not.
    const evil = `x"; DROP TABLE geto_rit.t; --`
    await dropRole(sql, evil).catch(() => {}) // "role does not exist" is fine
    const still = await sql`SELECT to_regclass('geto_rit.t') AS t`
    expect(still[0].t).not.toBeNull() // table survived → injection neutralized
  })

  test('SECURITY: privilege whitelist rejects non-whitelisted tokens', async () => {
    await expect(
      setObjectPrivilege(sql, {
        kind: 'table',
        schema: 'geto_rit',
        name: 't',
        role: R,
        privileges: ['SELECT; DROP TABLE geto_rit.t'],
        grant: true,
      }),
    ).rejects.toThrow()
    const still = await sql`SELECT to_regclass('geto_rit.t') AS t`
    expect(still[0].t).not.toBeNull()
  })

  test('dropRole removes the role', async () => {
    // Clean up grants/membership first so the drop succeeds.
    await setObjectPrivilege(sql, {
      kind: 'table',
      schema: 'geto_rit',
      name: 't',
      role: R,
      privileges: ['SELECT'],
      grant: false,
    }).catch(() => {})
    await dropRole(sql, R)
    expect((await listRoles(sql)).find((x) => x.name === R)).toBeUndefined()
  })
})
